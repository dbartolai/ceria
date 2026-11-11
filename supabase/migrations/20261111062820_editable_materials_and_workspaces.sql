-- Contact addresses can change independently of a client's stable portal identity.
-- The tutor action updates Supabase Auth and the profile together.
drop trigger protect_linked_email on public.people;
drop function private.protect_linked_email();

alter table public.materials add column interactive boolean not null default false;
alter table public.materials add constraint materials_id_engagement_unique unique(id, engagement_id);

create table public.material_sessions (
  material_id uuid not null,
  session_id uuid not null,
  engagement_id uuid not null,
  primary key(material_id, session_id),
  foreign key(material_id, engagement_id) references public.materials(id, engagement_id) on delete cascade,
  foreign key(session_id, engagement_id) references public.sessions(id, engagement_id) on delete cascade
);
create index material_sessions_session on public.material_sessions(session_id);
alter table public.material_sessions enable row level security;
revoke all on public.material_sessions from public, anon, authenticated;
grant select, insert, delete on public.material_sessions to authenticated;
grant all on public.material_sessions to service_role;
create policy material_sessions_tutor on public.material_sessions for all to authenticated
  using((select private.is_tutor())) with check((select private.is_tutor()));
create policy material_sessions_student on public.material_sessions for select to authenticated
  using(private.can_read_session(session_id) and exists(select 1 from public.materials m where m.id=material_id));

-- Linking a material shares it with that session's students, while an
-- individual material remains restricted to its intended student.
create function private.can_read_linked_material(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.materials m where m.id=p_id
    and (m.student_id is null or private.is_student(m.student_id))
    and exists(select 1 from public.material_sessions linked
      join public.session_students ss on ss.session_id=linked.session_id
      where linked.material_id=m.id and private.is_student(ss.student_id)))
$$;
revoke all on function private.can_read_linked_material(uuid) from public, anon;
grant execute on function private.can_read_linked_material(uuid) to authenticated;
drop policy materials_read on public.materials;
create policy materials_read on public.materials for select to authenticated
  using(published_at is not null and (
    private.can_read_material(engagement_id,session_id,student_id) or private.can_read_linked_material(id)));

create table public.material_responses (
  material_id uuid not null references public.materials on delete cascade,
  student_id uuid not null references public.people on delete restrict,
  body text not null default '' check(char_length(body)<=50000),
  updated_at timestamptz not null default now(),
  primary key(material_id, student_id)
);
create index material_responses_student on public.material_responses(student_id);
alter table public.material_responses enable row level security;
revoke all on public.material_responses from public, anon, authenticated;
grant select on public.material_responses to authenticated;
grant insert(material_id,student_id,body), update(body) on public.material_responses to authenticated;
grant all on public.material_responses to service_role;
create policy material_responses_tutor on public.material_responses for select to authenticated
  using((select private.is_tutor()));
create policy material_responses_owner_read on public.material_responses for select to authenticated
  using(private.is_student(student_id) and exists(select 1 from public.materials m where m.id=material_id and m.interactive));
create policy material_responses_owner_insert on public.material_responses for insert to authenticated
  with check(private.is_student(student_id) and exists(select 1 from public.materials m where m.id=material_id and m.interactive));
create policy material_responses_owner_update on public.material_responses for update to authenticated
  using(private.is_student(student_id) and exists(select 1 from public.materials m where m.id=material_id and m.interactive))
  with check(private.is_student(student_id) and exists(select 1 from public.materials m where m.id=material_id and m.interactive));
create function private.stamp_material_response() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end;
$$;
revoke all on function private.stamp_material_response() from public,anon,authenticated;
create trigger material_response_updated before update on public.material_responses
  for each row execute function private.stamp_material_response();
create function public.save_material_response(p_material_id uuid,p_body text) returns timestamptz
language plpgsql set search_path='' as $$
declare saved_at timestamptz; student uuid := (select private.person_id());
begin
  if private.is_student(student) is not true then raise exception 'Student access required' using errcode='42501'; end if;
  insert into public.material_responses(material_id,student_id,body) values(p_material_id,student,p_body)
    on conflict(material_id,student_id) do update set body=excluded.body returning updated_at into saved_at;
  return saved_at;
end;
$$;
revoke all on function public.save_material_response(uuid,text) from public,anon;
grant execute on function public.save_material_response(uuid,text) to authenticated;

create function public.delete_material(p_id uuid) returns text[] language plpgsql set search_path='' as $$
declare paths text[]; legacy_path text;
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode='42501'; end if;
  select storage_path into legacy_path from public.materials where id=p_id for update;
  if not found then raise exception 'Material not found'; end if;
  select coalesce(array_agg(storage_path),'{}'::text[]) into paths from public.material_attachments where material_id=p_id;
  if legacy_path is not null then paths=array_append(paths,legacy_path); end if;
  delete from public.materials where id=p_id;
  return paths;
end;
$$;
revoke all on function public.delete_material(uuid) from public,anon;
grant execute on function public.delete_material(uuid) to authenticated;

-- A published document must keep text or at least one file while being edited.
create function private.material_has_content() returns trigger language plpgsql set search_path='' as $$
begin
  if new.published_at is not null and btrim(new.body)='' and new.storage_path is null
    and not exists(select 1 from public.material_attachments where material_id=new.id)
  then raise exception 'Add material text or a file before publishing'; end if;
  return new;
end;
$$;
revoke all on function private.material_has_content() from public,anon,authenticated;
create trigger published_material_content before insert or update of body,published_at on public.materials
  for each row execute function private.material_has_content();

create or replace function public.add_material_attachment(
  p_material_id uuid, p_storage_path text, p_filename text, p_size_bytes bigint
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  material public.materials;
  attachment_id uuid;
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode = '42501'; end if;
  select * into material from public.materials where id = p_material_id for update;
  if not found then raise exception 'Material not found'; end if;

  select id into attachment_id from public.material_attachments
  where material_id = p_material_id and storage_path = p_storage_path;
  if found then return attachment_id; end if;

  if split_part(p_storage_path, '/', 1) <> material.engagement_id::text
    or not exists (select 1 from storage.objects where bucket_id = 'materials' and name = p_storage_path)
  then raise exception 'Choose a file uploaded for this engagement'; end if;
  if p_size_bytes is null then raise exception 'File size is required'; end if;
  insert into public.material_attachments (material_id, storage_path, filename, size_bytes)
  values (p_material_id, p_storage_path, p_filename, p_size_bytes)
  returning id into attachment_id;
  return attachment_id;
end;
$$;

create or replace function public.remove_material_attachment(p_id uuid) returns text
language plpgsql set search_path = ''
as $$
declare
  attachment public.material_attachments;
  published timestamptz;
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode = '42501'; end if;
  select * into attachment from public.material_attachments where id = p_id;
  if not found then return null; end if;

  select published_at into published from public.materials where id = attachment.material_id for update;
  if published is not null and exists(select 1 from public.materials m
    where m.id=attachment.material_id and btrim(m.body)='' and (m.storage_path is null or m.storage_path=attachment.storage_path))
    and (select count(*) from public.material_attachments where material_id=attachment.material_id)<=1
  then raise exception 'Keep material text or another file, or return the material to draft first'; end if;
  delete from public.material_attachments where id = p_id;
  update public.materials set storage_path = null
  where id = attachment.material_id and storage_path = attachment.storage_path;
  return attachment.storage_path;
end;
$$;
