create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users on delete set null,
  email text not null unique check (email = lower(btrim(email)) and email <> ''),
  name text not null check (btrim(name) <> ''),
  role text not null check (role in ('tutor', 'student', 'guardian')),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now()
);
create unique index one_tutor on public.people (role) where role = 'tutor';

create table public.guardians (
  guardian_id uuid not null references public.people on delete cascade,
  student_id uuid not null references public.people on delete cascade,
  primary key (guardian_id, student_id),
  check (guardian_id <> student_id)
);

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  kind text not null check (kind in ('one-off', 'short-term', 'ongoing')),
  description text not null default '',
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now()
);

create table public.engagement_students (
  engagement_id uuid not null references public.engagements on delete cascade,
  student_id uuid not null references public.people on delete restrict,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  primary key (engagement_id, student_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements on delete restrict,
  title text not null check (btrim(title) <> ''),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  location text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  unique (id, engagement_id)
);

create table public.session_students (
  session_id uuid not null,
  engagement_id uuid not null,
  student_id uuid not null references public.people on delete restrict,
  primary key (session_id, student_id),
  foreign key (session_id, engagement_id) references public.sessions (id, engagement_id) on delete cascade
);

create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  student_id uuid,
  topics text not null default '',
  strengths text not null default '',
  weaknesses text not null default '',
  next_steps text not null default '',
  unique nulls not distinct (session_id, student_id),
  foreign key (session_id, student_id) references public.session_students on delete restrict
);

create table public.recaps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  student_id uuid,
  audience text not null check (audience in ('student', 'guardian')),
  body text not null default '',
  topics text not null default '',
  published_at timestamptz,
  unique nulls not distinct (session_id, student_id, audience),
  foreign key (session_id, student_id) references public.session_students on delete restrict
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements on delete restrict,
  session_id uuid,
  student_id uuid references public.people on delete restrict,
  title text not null check (btrim(title) <> ''),
  body text not null default '',
  storage_path text unique,
  published_at timestamptz,
  foreign key (session_id, engagement_id) references public.sessions (id, engagement_id) on delete restrict,
  foreign key (session_id, student_id) references public.session_students on delete restrict,
  check (storage_path is null or split_part(storage_path, '/', 1) = engagement_id::text)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.people on delete restrict,
  title text not null check (btrim(title) <> ''),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  hosted_url text not null check (hosted_url ~ '^https://(invoice|buy|pay)\.stripe\.com/[^[:space:]]+$'),
  due_at date
);

create table public.payment_portals (
  guardian_id uuid primary key references public.people on delete cascade,
  hosted_url text not null check (hosted_url ~ '^https://billing\.stripe\.com/[^[:space:]]+$')
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.people on delete cascade,
  title text not null,
  body text not null default '',
  href text not null check (href ~ '^/portal(/[a-zA-Z0-9_/-]+)?$'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index guardians_student on public.guardians (student_id);
create index engagement_students_student on public.engagement_students (student_id);
create index sessions_engagement_starts_at on public.sessions (engagement_id, starts_at);
create index session_students_student on public.session_students (student_id);
create index materials_engagement on public.materials (engagement_id);
create index materials_session_student on public.materials (session_id, student_id);
create index invoices_student on public.invoices (student_id);
create index notifications_recipient_recent on public.notifications (recipient_id, created_at desc);

-- Helpers read membership without depending on the policies that call them.
create function private.person_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.people where auth_user_id = (select auth.uid())
$$;

create function private.is_tutor() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.people where id = (select private.person_id()) and role = 'tutor')
$$;

create function private.is_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.people
    where id = p_student_id and auth_user_id = (select auth.uid()) and role = 'student'
  )
$$;

create function private.is_guardian_of(p_student_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guardians g join public.people p on p.id = g.guardian_id
    where g.student_id = p_student_id and p.auth_user_id = (select auth.uid()) and p.role = 'guardian'
  )
$$;

create function private.can_read_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session_students ss where ss.session_id = p_session_id
      and (private.is_student(ss.student_id) or private.is_guardian_of(ss.student_id))
  )
$$;

create function private.can_read_engagement(p_engagement_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.engagement_students es where es.engagement_id = p_engagement_id
      and private.is_student(es.student_id)
  ) or exists (
    select 1 from public.session_students ss where ss.engagement_id = p_engagement_id
      and private.is_student(ss.student_id)
  )
$$;

create function private.effective_flag(p_student_id uuid, p_engagement_id uuid, p_key text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select (settings -> p_key = 'true'::jsonb) from public.engagement_students
     where student_id = p_student_id and engagement_id = p_engagement_id),
    (select (settings -> p_key = 'true'::jsonb) from public.people where id = p_student_id),
    (select (settings -> p_key = 'true'::jsonb) from public.engagements where id = p_engagement_id),
    p_key in ('quizzes', 'materials', 'parentNotifications')
  )
  where private.is_tutor() or private.is_student(p_student_id)
$$;

create function private.can_read_recap(p_session_id uuid, p_student_id uuid, p_audience text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session_students ss
    where ss.session_id = p_session_id and (p_student_id is null or ss.student_id = p_student_id)
      and ((p_audience = 'student' and private.is_student(ss.student_id))
        or (p_audience = 'guardian' and private.is_guardian_of(ss.student_id)))
  )
$$;

create function private.can_read_material(p_engagement_id uuid, p_session_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.effective_flag(private.person_id(), p_engagement_id, 'materials')
    and (p_student_id is null or private.is_student(p_student_id))
    and case when p_session_id is null then exists (
      select 1 from public.engagement_students es where es.engagement_id = p_engagement_id
        and private.is_student(es.student_id)
    ) else exists (
      select 1 from public.session_students ss where ss.session_id = p_session_id
        and private.is_student(ss.student_id)
    ) end
$$;

-- Bind a tutor-created record only to the verified owner of that email.
create function private.attach_person() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  person uuid;
begin
  if current_user_id is null then return null; end if;
  select id into person from public.people where auth_user_id = current_user_id;
  if person is not null then return person; end if;
  update public.people p set auth_user_id = current_user_id
  from auth.users u
  where u.id = current_user_id and u.email_confirmed_at is not null
    and p.email = lower(u.email) and p.auth_user_id is null
  returning p.id into person;
  return person;
end;
$$;

create function private.linked_students() returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name from public.people p
  where p.role = 'student' and private.is_guardian_of(p.id)
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to authenticated;

create function public.attach_person() returns uuid
language sql set search_path = ''
as $$ select private.attach_person() $$;
revoke all on function public.attach_person() from public, anon;
grant execute on function public.attach_person() to authenticated;

create function public.linked_students() returns table (id uuid, name text)
language sql stable set search_path = ''
as $$ select * from private.linked_students() $$;
revoke all on function public.linked_students() from public, anon;
grant execute on function public.linked_students() to authenticated;

do $$
declare
  name text;
begin
  foreach name in array array[
    'people', 'guardians', 'engagements', 'engagement_students', 'sessions', 'session_students',
    'session_notes', 'recaps', 'materials', 'invoices', 'payment_portals', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on public.%I from anon, authenticated', name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', name);
    execute format('grant select, insert, update, delete on public.%I to service_role', name);
    execute format('create policy tutor_manage on public.%I for all to authenticated
      using ((select private.is_tutor())) with check ((select private.is_tutor()))', name);
  end loop;
end;
$$;

create policy people_read on public.people for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy guardians_read on public.guardians for select to authenticated
using (guardian_id = (select private.person_id()));

create policy engagements_read on public.engagements for select to authenticated
using (private.can_read_engagement(id));

create policy enrollments_read on public.engagement_students for select to authenticated
using (private.is_student(student_id));

create policy sessions_read on public.sessions for select to authenticated
using (private.can_read_session(id));

create policy session_students_read on public.session_students for select to authenticated
using (private.is_student(student_id) or private.is_guardian_of(student_id));

create policy recaps_read on public.recaps for select to authenticated
using (published_at is not null and private.can_read_recap(session_id, student_id, audience));

create policy materials_read on public.materials for select to authenticated
using (published_at is not null and private.can_read_material(engagement_id, session_id, student_id));

create policy invoices_read on public.invoices for select to authenticated
using (private.is_guardian_of(student_id));

create policy payment_portals_read on public.payment_portals for select to authenticated
using (guardian_id = (select private.person_id()));

create policy notifications_read on public.notifications for select to authenticated
using (recipient_id = (select private.person_id()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materials', 'materials', false, 4194304, array[
  'application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/webp'
]);

create policy materials_storage_tutor on storage.objects for all to authenticated
using (bucket_id = 'materials' and (select private.is_tutor()))
with check (bucket_id = 'materials' and (select private.is_tutor()));

create policy materials_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'materials' and exists (
    select 1 from public.materials m where m.storage_path = name and m.published_at is not null
  )
);

create function public.save_session(
  p_id uuid, p_engagement_id uuid, p_title text, p_starts_at timestamptz,
  p_duration_minutes integer, p_location text, p_status text, p_students uuid[]
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  saved_session_id uuid;
begin
  if not private.is_tutor() then raise exception 'Tutor access required' using errcode = '42501'; end if;
  if coalesce(cardinality(p_students), 0) = 0 then raise exception 'Select at least one student'; end if;
  if exists (
    select 1 from unnest(p_students) as roster(student_id)
    where not exists (
      select 1 from public.engagement_students es join public.people p on p.id = es.student_id
      where es.engagement_id = p_engagement_id and es.student_id = roster.student_id and p.role = 'student'
    ) and not exists (
      select 1 from public.session_students ss
      where ss.session_id = p_id and ss.engagement_id = p_engagement_id and ss.student_id = roster.student_id
    )
  ) then raise exception 'Select students enrolled in this engagement'; end if;

  if p_id is null then
    insert into public.sessions (engagement_id, title, starts_at, duration_minutes, location, status)
    values (p_engagement_id, p_title, p_starts_at, p_duration_minutes, p_location, p_status)
    returning id into saved_session_id;
  else
    update public.sessions set title = p_title, starts_at = p_starts_at,
      duration_minutes = p_duration_minutes, location = p_location, status = p_status
    where id = p_id and engagement_id = p_engagement_id returning id into saved_session_id;
    if not found then raise exception 'Session not found in this engagement'; end if;
  end if;

  delete from public.session_students ss where ss.session_id = saved_session_id
    and not (ss.student_id = any(p_students));
  insert into public.session_students (session_id, engagement_id, student_id)
    select distinct saved_session_id, p_engagement_id, roster.student_id
    from unnest(p_students) as roster(student_id)
    on conflict on constraint session_students_pkey do nothing;
  return saved_session_id;
end;
$$;

create function public.publish_recap(p_id uuid) returns void
language plpgsql set search_path = ''
as $$
declare
  recap public.recaps;
  engagement uuid;
begin
  if not private.is_tutor() then raise exception 'Tutor access required' using errcode = '42501'; end if;
  update public.recaps set published_at = now() where id = p_id and published_at is null and btrim(body) <> ''
  returning * into recap;
  if not found then return; end if;

  if recap.audience = 'student' then
    insert into public.notifications (recipient_id, title, body, href)
    select student_id, 'Session recap ready', 'Your tutor shared a session recap.', '/portal/sessions'
    from public.session_students ss where ss.session_id = recap.session_id
      and (recap.student_id is null or recap.student_id = ss.student_id);
  else
    select engagement_id into engagement from public.sessions where id = recap.session_id;
    insert into public.notifications (recipient_id, title, body, href)
    select distinct g.guardian_id, 'Session recap ready', 'Your tutor shared a session recap.', '/portal/sessions'
    from public.session_students ss join public.guardians g using (student_id)
    where ss.session_id = recap.session_id and (recap.student_id is null or recap.student_id = ss.student_id)
      and private.effective_flag(ss.student_id, engagement, 'parentNotifications');
  end if;
end;
$$;

create function public.publish_material(p_id uuid) returns void
language plpgsql set search_path = ''
as $$
declare
  material public.materials;
begin
  if not private.is_tutor() then raise exception 'Tutor access required' using errcode = '42501'; end if;
  update public.materials set published_at = now()
  where id = p_id and published_at is null and (btrim(body) <> '' or storage_path is not null)
  returning * into material;
  if not found then return; end if;

  insert into public.notifications (recipient_id, title, body, href)
  select roster.student_id, 'Learning material ready', 'Your tutor shared a learning resource.', '/portal/materials'
  from (
    select ss.student_id from public.session_students ss where ss.session_id = material.session_id
    union
    select es.student_id from public.engagement_students es
    where material.session_id is null and es.engagement_id = material.engagement_id
  ) roster
  where (material.student_id is null or material.student_id = roster.student_id)
    and private.effective_flag(roster.student_id, material.engagement_id, 'materials');
end;
$$;

create function public.read_notifications() returns void
language plpgsql set search_path = ''
as $$
begin
  update public.notifications set read_at = now()
  where recipient_id = (select private.person_id()) and read_at is null;
end;
$$;

-- The notification acknowledgment needs a single, narrowly scoped update.
create policy notifications_acknowledge on public.notifications for update to authenticated
using (recipient_id = (select private.person_id())) with check (recipient_id = (select private.person_id()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on function public.save_session(uuid, uuid, text, timestamptz, integer, text, text, uuid[]),
  public.publish_recap(uuid), public.publish_material(uuid), public.read_notifications() from public, anon;
grant execute on function public.save_session(uuid, uuid, text, timestamptz, integer, text, text, uuid[]),
  public.publish_recap(uuid), public.publish_material(uuid), public.read_notifications() to authenticated;
