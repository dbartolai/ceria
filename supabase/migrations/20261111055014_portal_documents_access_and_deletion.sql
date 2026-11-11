-- Keep historical lesson/billing references when a client is removed. A deleted
-- profile has no contact email or usable Auth identity and is never reattached.
alter table public.people add column deleted_at timestamptz;
alter table public.people add column revoked_auth_user_id uuid;
create index people_revoked_auth on public.people(revoked_auth_user_id) where revoked_auth_user_id is not null;
alter table public.people drop constraint linked_people_need_email;

create or replace function private.person_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.people p where p.auth_user_id=(select auth.uid()) and p.deleted_at is null
    and not exists(select 1 from public.people removed where removed.revoked_auth_user_id=(select auth.uid()))
$$;
create or replace function private.is_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.people where id=p_student_id and id=(select private.person_id()) and role='student')
$$;
create or replace function private.is_guardian_of(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.guardians g join public.people p on p.id=g.guardian_id
    join public.people student on student.id=g.student_id
    where g.student_id=p_student_id and p.id=(select private.person_id()) and p.role='guardian' and student.deleted_at is null)
$$;
-- Guardians need the engagement name for their linked students' sessions.
create or replace function private.can_read_engagement(p_engagement_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.engagement_students es where es.engagement_id=p_engagement_id
    and private.is_student(es.student_id))
  or exists(select 1 from public.session_students ss where ss.engagement_id=p_engagement_id
    and (private.is_student(ss.student_id) or private.is_guardian_of(ss.student_id)))
$$;
create or replace function private.attach_person() returns uuid
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); person uuid;
begin
  if current_user_id is null or exists(select 1 from public.people where revoked_auth_user_id=current_user_id) then return null; end if;
  select id into person from public.people where auth_user_id=current_user_id and deleted_at is null;
  if person is not null then return person; end if;
  update public.people p set auth_user_id=current_user_id from auth.users u
  where u.id=current_user_id and u.email_confirmed_at is not null and p.email=lower(u.email)
    and p.auth_user_id is null and p.deleted_at is null returning p.id into person;
  return person;
end;
$$;
drop policy people_read on public.people;
create policy people_read on public.people for select to authenticated using(id=(select private.person_id()));

create or replace function private.protect_linked_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.email is distinct from old.email and new.deleted_at is null and old.email is not null then
    raise exception 'The email for a signed-in client cannot be changed here' using errcode='23514';
  end if;
  return new;
end;
$$;

create function public.delete_client(p_id uuid) returns uuid language plpgsql set search_path = '' as $$
declare old_auth_id uuid;
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode='42501'; end if;
  select auth_user_id into old_auth_id from public.people where id=p_id and role in ('student','guardian') and deleted_at is null for update;
  if not found then raise exception 'Choose an active client'; end if;
  update public.people set deleted_at=now(),revoked_auth_user_id=old_auth_id,auth_user_id=null,email=null where id=p_id;
  delete from public.guardians where guardian_id=p_id or student_id=p_id;
  delete from public.payment_portals where guardian_id=p_id;
  return old_auth_id;
end;
$$;
revoke all on function public.delete_client(uuid) from public,anon;
grant execute on function public.delete_client(uuid) to authenticated;

-- Existing titles become focus text; engagement and date identify the session.
alter table public.sessions drop constraint sessions_title_check;
alter table public.sessions alter column title set default '';
alter table public.sessions add constraint session_focus_length check(char_length(title)<=120);

-- Assignment snapshots are normally immutable to authenticated users. This
-- narrow operation deletes an entire engagement only after a tutor check.
create function private.delete_engagement(p_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode='42501'; end if;
  perform 1 from public.engagements where id=p_id for update;
  if not found then raise exception 'Engagement not found'; end if;
  select coalesce(array_agg(name),'{}'::text[]) into paths from storage.objects
    where bucket_id='materials' and split_part(name,'/',1)=p_id::text;
  delete from public.submissions where assignment_id in (select id from public.assignments where engagement_id=p_id);
  delete from public.assignments where engagement_id=p_id;
  delete from public.materials where engagement_id=p_id;
  delete from public.recaps where session_id in (select id from public.sessions where engagement_id=p_id);
  delete from public.session_notes where session_id in (select id from public.sessions where engagement_id=p_id);
  delete from public.sessions where engagement_id=p_id;
  delete from public.engagements where id=p_id;
  return paths;
end;
$$;
create function public.delete_engagement(p_id uuid) returns text[] language sql set search_path = '' as $$select private.delete_engagement(p_id)$$;
revoke all on function private.delete_engagement(uuid),public.delete_engagement(uuid) from public,anon;
grant execute on function private.delete_engagement(uuid),public.delete_engagement(uuid) to authenticated;
