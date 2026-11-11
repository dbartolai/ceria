alter table public.people alter column email drop not null;
alter table public.people add constraint linked_people_need_email
  check (auth_user_id is null or email is not null);

create function private.protect_linked_email() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    raise exception 'The email for a signed-in client cannot be changed here' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_linked_email() from public, anon, authenticated;
create trigger protect_linked_email before update of email on public.people
for each row when (old.auth_user_id is not null)
execute function private.protect_linked_email();

-- Features are available for every student. Enrollment and ownership checks
-- continue to control which records each account can access.
create or replace function private.effective_flag(p_student_id uuid, p_engagement_id uuid, p_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_key in ('quizzes', 'materials', 'roadmaps', 'parentNotifications')
    and (private.is_tutor() or private.is_student(p_student_id))
$$;

create table public.material_attachments (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials on delete cascade,
  storage_path text not null unique,
  filename text not null check (char_length(btrim(filename)) between 1 and 255),
  size_bytes bigint check (size_bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);
create index material_attachments_material on public.material_attachments (material_id);
alter table public.material_attachments enable row level security;
revoke all on public.material_attachments from public, anon, authenticated;
grant select, insert, delete on public.material_attachments to authenticated;
grant all on public.material_attachments to service_role;

create policy attachments_tutor_manage on public.material_attachments for all to authenticated
using ((select private.is_tutor())) with check ((select private.is_tutor()));
create policy attachments_read on public.material_attachments for select to authenticated
using (exists (
  select 1 from public.materials m
  where m.id = material_id and m.published_at is not null
));

insert into public.material_attachments (material_id, storage_path, filename)
select id, storage_path, left(regexp_replace(storage_path, '^.*/', ''), 255)
from public.materials where storage_path is not null;

drop policy materials_storage_read on storage.objects;
create policy materials_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'materials' and (
    exists (
      select 1 from public.materials m where m.storage_path = name and m.published_at is not null
    ) or exists (
      select 1 from public.material_attachments a join public.materials m on m.id = a.material_id
      where a.storage_path = name and m.published_at is not null
    )
  )
);

create function public.add_material_attachment(
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

  if material.published_at is not null then raise exception 'Return the material to draft before adding files'; end if;
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

create function public.remove_material_attachment(p_id uuid) returns text
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
  if published is not null then raise exception 'Return the material to draft before removing files'; end if;
  delete from public.material_attachments where id = p_id;
  update public.materials set storage_path = null
  where id = attachment.material_id and storage_path = attachment.storage_path;
  return attachment.storage_path;
end;
$$;

revoke all on function public.add_material_attachment(uuid, text, text, bigint),
  public.remove_material_attachment(uuid) from public, anon;
grant execute on function public.add_material_attachment(uuid, text, text, bigint),
  public.remove_material_attachment(uuid) to authenticated;

create or replace function public.publish_material(p_id uuid) returns void
language plpgsql set search_path = ''
as $$
declare
  material public.materials;
begin
  if not private.is_tutor() then raise exception 'Tutor access required' using errcode = '42501'; end if;
  update public.materials set published_at = now()
  where id = p_id and published_at is null and (btrim(body) <> '' or storage_path is not null or exists (
    select 1 from public.material_attachments a where a.material_id = materials.id
  ))
  returning * into material;
  if not found then
    if exists (select 1 from public.materials where id = p_id and published_at is not null) then return; end if;
    raise exception 'Add material text or a file before publishing';
  end if;

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

