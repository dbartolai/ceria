create table public.session_preparations (
  session_id uuid not null,
  student_id uuid not null,
  summary text not null default '' check (char_length(summary) <= 6000),
  topics jsonb not null default '[]' check (jsonb_typeof(topics) = 'array' and jsonb_array_length(topics) <= 16),
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id),
  foreign key (session_id, student_id) references public.session_students on delete cascade
);
create index preparations_student on public.session_preparations(student_id);
alter table public.session_preparations enable row level security;
grant select, insert, update, delete on public.session_preparations to authenticated;
grant all on public.session_preparations to service_role;
create policy preparations_tutor on public.session_preparations for all to authenticated
using ((select private.is_tutor())) with check ((select private.is_tutor()));

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  student_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 6000),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, student_id),
  foreign key (session_id, student_id) references public.session_students on delete cascade
);
create index study_plans_student on public.study_plans(student_id);
alter table public.study_plans enable row level security;
grant select, insert, update, delete on public.study_plans to authenticated;
grant all on public.study_plans to service_role;
create policy study_plans_tutor on public.study_plans for all to authenticated
using ((select private.is_tutor())) with check ((select private.is_tutor()));
create policy study_plans_read on public.study_plans for select to authenticated
using (published_at is not null and (private.is_student(student_id) or private.is_guardian_of(student_id)));

create table public.study_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans on delete cascade,
  position integer not null check (position between 0 and 29),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  details text not null default '' check (char_length(details) <= 3000),
  source text not null default '' check (char_length(source) <= 500),
  estimated_minutes integer check (estimated_minutes between 1 and 240),
  due_date date,
  completed_at timestamptz
);
create index study_plan_items_plan on public.study_plan_items(plan_id);
alter table public.study_plan_items enable row level security;
grant select, insert, update, delete on public.study_plan_items to authenticated;
grant all on public.study_plan_items to service_role;
create policy study_plan_items_tutor on public.study_plan_items for all to authenticated
using ((select private.is_tutor())) with check ((select private.is_tutor()));
create policy study_plan_items_read on public.study_plan_items for select to authenticated
using (exists(select 1 from public.study_plans p where p.id=plan_id and p.published_at is not null));
revoke all on public.session_preparations,public.study_plans,public.study_plan_items from public,anon;

-- Lock the parent so publishing cannot race a draft save. Preserve completion
-- when a tutor returns a plan to draft and edits an existing item.
create function public.save_study_plan(
  p_session_id uuid, p_student_id uuid, p_title text, p_summary text, p_items jsonb
) returns uuid language plpgsql set search_path = '' as $$
declare v_plan_id uuid; item jsonb; position integer := 0;
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode='42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Add between 1 and 30 study tasks';
  end if;
  insert into public.study_plans(session_id,student_id,title,summary)
  values(p_session_id,p_student_id,p_title,p_summary)
  on conflict(session_id,student_id) do nothing;
  select id into v_plan_id from public.study_plans where session_id=p_session_id and student_id=p_student_id and published_at is null for update;
  if not found then raise exception 'Return the study plan to draft before editing'; end if;
  update public.study_plans set title=p_title, summary=p_summary where id=v_plan_id;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Study tasks must have distinct identifiers';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if exists(select 1 from public.study_plan_items where id=(item->>'id')::uuid and study_plan_items.plan_id <> v_plan_id) then
      raise exception 'Choose a task from this study plan';
    end if;
    insert into public.study_plan_items(id,plan_id,position,title,details,source,estimated_minutes,due_date)
    values((item->>'id')::uuid,v_plan_id,position,item->>'title',coalesce(item->>'details',''),coalesce(item->>'source',''),
      (item->>'estimated_minutes')::integer,(item->>'due_date')::date)
    on conflict(id) do update set position=excluded.position,title=excluded.title,details=excluded.details,
      source=excluded.source,estimated_minutes=excluded.estimated_minutes,due_date=excluded.due_date;
    position := position + 1;
  end loop;
  delete from public.study_plan_items i where i.plan_id=v_plan_id and not exists(
    select 1 from jsonb_array_elements(p_items) x where (x->>'id')::uuid=i.id
  );
  return v_plan_id;
end;
$$;

create function public.publish_study_plan(p_id uuid) returns void language plpgsql set search_path = '' as $$
declare student uuid;
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode='42501'; end if;
  perform 1 from public.study_plans where id=p_id for update;
  if not exists(select 1 from public.study_plan_items where plan_id=p_id) then raise exception 'Add a study task before publishing'; end if;
  update public.study_plans set published_at=now() where id=p_id and published_at is null returning student_id into student;
  if not found then return; end if;
  insert into public.notifications(recipient_id,title,body,href)
  select recipient, 'Study plan ready', 'Your tutor shared a study plan.', '/portal/study-plans'
  from (select student as recipient union select guardian_id from public.guardians where student_id=student) recipients;
end;
$$;

-- Students can update only their own completion state, never task content.
create function private.complete_study_plan_item(p_id uuid,p_completed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.study_plans p join public.study_plan_items i on i.plan_id=p.id
  where i.id=p_id and p.published_at is not null and private.is_student(p.student_id) for update of p;
  if not found then raise exception 'Study task is unavailable' using errcode='42501'; end if;
  update public.study_plan_items set completed_at=case when p_completed then coalesce(completed_at,now()) else null end where id=p_id;
end;
$$;
create function public.complete_study_plan_item(p_id uuid,p_completed boolean) returns void
language sql set search_path = '' as $$select private.complete_study_plan_item(p_id,p_completed)$$;

revoke all on function public.save_study_plan(uuid,uuid,text,text,jsonb), public.publish_study_plan(uuid),
  private.complete_study_plan_item(uuid,boolean),public.complete_study_plan_item(uuid,boolean) from public,anon;
grant execute on function public.save_study_plan(uuid,uuid,text,text,jsonb), public.publish_study_plan(uuid),
  private.complete_study_plan_item(uuid,boolean),public.complete_study_plan_item(uuid,boolean) to authenticated;

-- A database-backed lease prevents concurrent generations and repeated clicks
-- from creating overlapping billed requests across Vercel instances.
create table private.session_ai_requests (
  session_id uuid not null references public.sessions on delete cascade,
  kind text not null check(kind in ('preparation','plan')),
  primary key(session_id,kind),
  next_allowed_at timestamptz not null
);
alter table private.session_ai_requests enable row level security;
revoke all on private.session_ai_requests from public,anon,authenticated;
create function private.claim_session_ai_request(p_session_id uuid,p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  if private.is_tutor() is not true then raise exception 'Tutor access required' using errcode='42501'; end if;
  insert into private.session_ai_requests(session_id,kind,next_allowed_at) values(p_session_id,p_kind,now()+interval '120 seconds')
  on conflict(session_id,kind) do update set next_allowed_at=excluded.next_allowed_at
  where session_ai_requests.next_allowed_at <= now() returning session_id into claimed;
  return claimed is not null;
end;
$$;
create function public.claim_session_ai_request(p_session_id uuid,p_kind text) returns boolean
language sql set search_path = '' as $$select private.claim_session_ai_request(p_session_id,p_kind)$$;
revoke all on function private.claim_session_ai_request(uuid,text),public.claim_session_ai_request(uuid,text) from public,anon;
grant execute on function private.claim_session_ai_request(uuid,text),public.claim_session_ai_request(uuid,text) to authenticated;
