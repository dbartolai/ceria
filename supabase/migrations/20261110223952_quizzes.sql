-- Quiz drafts are tutor-only. Publishing copies their content and answer keys
-- into immutable snapshots, so later edits never change a student's work.
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  questions jsonb not null default '[]' check (
    jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 60
  ),
  updated_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete restrict,
  engagement_id uuid not null references public.engagements(id) on delete restrict,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  published_at timestamptz not null default now()
);

create table public.assignment_students (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.people(id) on delete restrict,
  primary key (assignment_id, student_id)
);

create table public.assignment_questions (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  position integer not null check (position > 0),
  kind text not null check (kind in ('multiple-choice', 'short-answer', 'numeric')),
  prompt text not null,
  topic text not null default '',
  choices jsonb not null default '[]' check (jsonb_typeof(choices) = 'array'),
  primary key (assignment_id, position)
);

create table private.assignment_answer_keys (
  assignment_id uuid not null,
  position integer not null,
  answer text not null,
  explanation text not null,
  tolerance numeric not null default 0 check (tolerance >= 0),
  primary key (assignment_id, position),
  foreign key (assignment_id, position)
    references public.assignment_questions(assignment_id, position) on delete cascade
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  submitted_at timestamptz not null default now(),
  score integer not null default 0,
  total integer not null check (total > 0),
  pending_count integer not null default 0,
  unique (assignment_id, student_id),
  foreign key (assignment_id, student_id)
    references public.assignment_students(assignment_id, student_id) on delete restrict,
  foreign key (assignment_id) references public.assignments(id) on delete restrict,
  foreign key (student_id) references public.people(id) on delete restrict,
  check (score >= 0 and pending_count >= 0 and score + pending_count <= total)
);

create table public.submission_answers (
  submission_id uuid not null references public.submissions(id) on delete cascade,
  position integer not null check (position > 0),
  response text not null,
  outcome text not null check (outcome in ('correct', 'incorrect', 'pending')),
  correct_answer text not null,
  explanation text not null,
  feedback text not null default '',
  primary key (submission_id, position)
);

create index assignments_quiz_idx on public.assignments(quiz_id);
create index assignments_engagement_idx on public.assignments(engagement_id);
create index assignment_students_student_idx on public.assignment_students(student_id, assignment_id);
create index submissions_student_idx on public.submissions(student_id);

revoke all on private.assignment_answer_keys from public, anon, authenticated;
alter table private.assignment_answer_keys enable row level security;

revoke all on public.quizzes, public.assignments, public.assignment_students,
  public.assignment_questions, public.submissions, public.submission_answers from public, anon, authenticated;
grant select, insert, update on public.quizzes to authenticated;
grant select on public.assignments, public.assignment_students, public.assignment_questions,
  public.submissions, public.submission_answers to authenticated;
grant select, insert, update, delete on public.quizzes, public.assignments, public.assignment_students,
  public.assignment_questions, public.submissions, public.submission_answers to service_role;

alter table public.quizzes enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_students enable row level security;
alter table public.assignment_questions enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_answers enable row level security;

create function private.can_start_assignment(p_assignment_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_student(p_student_id) and exists (
    select 1
    from public.assignments as a
    join public.assignment_students as target on target.assignment_id = a.id
    join public.engagement_students as enrolled on enrolled.engagement_id = a.engagement_id
      and enrolled.student_id = target.student_id
    where a.id = p_assignment_id and target.student_id = p_student_id
      and private.effective_flag(p_student_id, a.engagement_id, 'quizzes')
  );
$$;

create function private.can_read_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_start_assignment(p_assignment_id, (select private.person_id())) or exists (
    select 1 from public.submissions as s
    where s.assignment_id = p_assignment_id and private.is_student(s.student_id)
  );
$$;

revoke execute on function private.can_start_assignment(uuid, uuid),
  private.can_read_assignment(uuid) from public, anon, authenticated;
grant execute on function private.can_read_assignment(uuid) to authenticated;

create policy quiz_tutor on public.quizzes for all to authenticated
  using ((select private.is_tutor())) with check ((select private.is_tutor()));
create policy assignment_read on public.assignments for select to authenticated
  using ((select private.is_tutor()) or private.can_read_assignment(id));
create policy assignment_student_read on public.assignment_students for select to authenticated
  using ((select private.is_tutor()) or (private.is_student(student_id) and private.can_read_assignment(assignment_id)));
create policy assignment_question_read on public.assignment_questions for select to authenticated
  using ((select private.is_tutor()) or private.can_read_assignment(assignment_id));
create policy submission_read on public.submissions for select to authenticated
  using ((select private.is_tutor()) or private.is_student(student_id));
create policy submission_answer_read on public.submission_answers for select to authenticated
  using ((select private.is_tutor()) or exists (
    select 1 from public.submissions as s
    where s.id = submission_id and private.is_student(s.student_id)
  ));

-- Bound numeric input before casting. Fractions or expressions are kept as
-- responses for the tutor to review rather than interpreted as code.
create function private.quiz_number(p_input text)
returns numeric language sql immutable strict set search_path = '' as $$
  select case when char_length(btrim(p_input)) <= 50
    and btrim(p_input) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,2})?$'
    then btrim(p_input)::numeric end;
$$;
revoke execute on function private.quiz_number(text) from public, anon, authenticated;

create function private.validate_quiz_question(p_question jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  kind text := p_question->>'kind';
  choices jsonb := p_question->'choices';
  answer text := p_question->>'answer';
  option_count integer;
begin
  if jsonb_typeof(p_question) is distinct from 'object'
    or kind is null or kind not in ('multiple-choice', 'short-answer', 'numeric')
    or jsonb_typeof(p_question->'prompt') is distinct from 'string'
    or char_length(btrim(p_question->>'prompt')) not between 1 and 3000
    or jsonb_typeof(p_question->'topic') is distinct from 'string'
    or char_length(p_question->>'topic') > 100
    or jsonb_typeof(p_question->'answer') is distinct from 'string'
    or char_length(btrim(answer)) not between 1 and 1000
    or jsonb_typeof(p_question->'explanation') is distinct from 'string'
    or char_length(btrim(p_question->>'explanation')) not between 1 and 4000
    or jsonb_typeof(choices) is distinct from 'array'
    or jsonb_typeof(p_question->'tolerance') is distinct from 'number'
    or (p_question->>'tolerance')::numeric < 0
  then
    raise exception 'Each question needs a valid type, prompt, answer, and explanation.' using errcode = '22023';
  end if;

  option_count := jsonb_array_length(choices);
  if kind = 'multiple-choice' then
    if option_count not between 2 and 8
      or not (choices ? answer)
      or exists (
        select 1 from jsonb_array_elements(choices) as option(value)
        where jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 1 and 500
      )
      or option_count <> (select count(distinct value) from jsonb_array_elements(choices))
    then
      raise exception 'Multiple choice requires two to eight distinct choices and a matching answer.' using errcode = '22023';
    end if;
  elsif option_count <> 0 then
    raise exception 'Choices are available for multiple-choice questions.' using errcode = '22023';
  elsif kind = 'numeric' and private.quiz_number(answer) is null then
    raise exception 'Numeric questions need a number as the correct answer.' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.validate_quiz_question(jsonb) from public, anon, authenticated;

create function private.publish_quiz_assignment(
  p_quiz_id uuid, p_engagement_id uuid, p_student_ids uuid[], p_due_at timestamptz, p_request_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  draft public.quizzes%rowtype;
  question jsonb;
  recipients uuid[];
  assignment_id uuid;
begin
  if private.is_tutor() is not true then
    raise exception 'Tutor access is required.' using errcode = '42501';
  end if;
  if p_request_id is not null and exists (select 1 from public.assignments where id = p_request_id) then
    return p_request_id;
  end if;
  select * into draft from public.quizzes where id = p_quiz_id;
  if not found or jsonb_array_length(draft.questions) = 0 then
    raise exception 'Save a quiz with at least one question before publishing.' using errcode = '22023';
  end if;
  for question in select value from jsonb_array_elements(draft.questions) loop
    perform private.validate_quiz_question(question);
  end loop;

  select array_agg(es.student_id order by es.student_id) into recipients
  from public.engagement_students as es
  join public.people as student on student.id = es.student_id and student.role = 'student'
  where es.engagement_id = p_engagement_id
    and (p_student_ids is null or es.student_id = any(p_student_ids))
    and private.effective_flag(es.student_id, p_engagement_id, 'quizzes');
  if coalesce(cardinality(recipients), 0) = 0 then
    raise exception 'Choose an engagement with at least one student who has quizzes enabled.' using errcode = '22023';
  end if;
  if p_student_ids is not null and cardinality(p_student_ids) <> cardinality(recipients) then
    raise exception 'Selected students must be enrolled and have quizzes enabled.' using errcode = '22023';
  end if;

  insert into public.assignments (id, quiz_id, engagement_id, title, description, due_at)
  values (coalesce(p_request_id, gen_random_uuid()), draft.id, p_engagement_id, draft.title, draft.description, p_due_at)
  on conflict (id) do nothing returning id into assignment_id;
  if not found then
    return p_request_id;
  end if;

  insert into public.assignment_students (assignment_id, student_id)
    select assignment_id, student_id from unnest(recipients) as student_id;
  insert into public.assignment_questions (assignment_id, position, kind, prompt, topic, choices)
    select assignment_id, ord::integer, q->>'kind', q->>'prompt', q->>'topic', q->'choices'
    from jsonb_array_elements(draft.questions) with ordinality as question_data(q, ord);
  insert into private.assignment_answer_keys (assignment_id, position, answer, explanation, tolerance)
    select assignment_id, ord::integer, q->>'answer', q->>'explanation', (q->>'tolerance')::numeric
    from jsonb_array_elements(draft.questions) with ordinality as question_data(q, ord);
  insert into public.notifications (recipient_id, title, body, href)
    select student_id, 'New assignment', draft.title, '/portal/assignments/' || assignment_id::text
    from unnest(recipients) as student_id;
  return assignment_id;
end;
$$;

create function private.refresh_quiz_score(p_submission_id uuid)
returns void language sql set search_path = '' as $$
  update public.submissions as s
  set score = result.score, pending_count = result.pending_count
  from (
    select count(*) filter (where outcome = 'correct')::integer as score,
      count(*) filter (where outcome = 'pending')::integer as pending_count
    from public.submission_answers where submission_id = p_submission_id
  ) as result where s.id = p_submission_id;
$$;
revoke execute on function private.refresh_quiz_score(uuid) from public, anon, authenticated;

create function private.submit_quiz(p_assignment_id uuid, p_answers jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_student uuid := private.person_id();
  submission uuid;
  question_count integer;
begin
  if private.is_student(current_student) is not true then
    raise exception 'Student access is required.' using errcode = '42501';
  end if;
  select id into submission from public.submissions
    where assignment_id = p_assignment_id and student_id = current_student;
  if found then
    return submission;
  end if;
  if private.can_start_assignment(p_assignment_id, current_student) is not true then
    raise exception 'This assignment is unavailable.' using errcode = '42501';
  end if;

  select count(*) into question_count from public.assignment_questions where assignment_id = p_assignment_id;
  if jsonb_typeof(p_answers) is distinct from 'array' or question_count = 0 then
    raise exception 'Enter a response for each question.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_answers) <> question_count or exists (
    select 1 from jsonb_array_elements(p_answers) as answers(value)
    where jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 1 and 4000
  ) then
    raise exception 'Enter a response for each question (up to 4,000 characters).' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.assignment_questions as q
    where q.assignment_id = p_assignment_id and q.kind = 'multiple-choice'
      and not (q.choices ? (p_answers->>(q.position - 1)))
  ) then
    raise exception 'Choose one of the listed answers.' using errcode = '22023';
  end if;

  insert into public.submissions (assignment_id, student_id, total)
  values (p_assignment_id, current_student, question_count)
  on conflict (assignment_id, student_id) do nothing returning id into submission;
  if not found then
    select id into submission from public.submissions
      where assignment_id = p_assignment_id and student_id = current_student;
    return submission;
  end if;

  insert into public.submission_answers (submission_id, position, response, outcome, correct_answer, explanation)
    select submission, q.position, response.answer,
      case
        when q.kind = 'short-answer' then 'pending'
        when q.kind = 'numeric' then case
          when private.quiz_number(response.answer) is null then 'pending'
          when abs(private.quiz_number(response.answer) - private.quiz_number(key.answer)) <= key.tolerance then 'correct'
          else 'incorrect'
        end
        when response.answer = key.answer then 'correct'
        else 'incorrect'
      end,
      key.answer, key.explanation
    from public.assignment_questions as q
    join private.assignment_answer_keys as key using (assignment_id, position)
    cross join lateral (select p_answers->>(q.position - 1) as answer) as response
    where q.assignment_id = p_assignment_id;
  perform private.refresh_quiz_score(submission);
  return submission;
end;
$$;

create function private.grade_quiz_answer(p_submission_id uuid, p_position integer, p_correct boolean, p_feedback text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  attempt public.submissions%rowtype;
  remaining integer;
begin
  if private.is_tutor() is not true then
    raise exception 'Tutor access is required.' using errcode = '42501';
  end if;
  if p_correct is null or char_length(coalesce(p_feedback, '')) > 4000 then
    raise exception 'Choose a grade and limit feedback to 4,000 characters.' using errcode = '22023';
  end if;
  -- Lock the attempt before updating any answer so simultaneous reviews keep
  -- the totals consistent and notify the student when the final review lands.
  select * into attempt from public.submissions where id = p_submission_id for update;
  update public.submission_answers set
    outcome = case when p_correct then 'correct' else 'incorrect' end,
    feedback = coalesce(p_feedback, '')
  where submission_id = p_submission_id and position = p_position;
  if not found then
    raise exception 'This answer could not be found.' using errcode = '22023';
  end if;
  perform private.refresh_quiz_score(p_submission_id);
  select pending_count into remaining from public.submissions where id = p_submission_id;
  if attempt.pending_count > 0 and remaining = 0 then
    insert into public.notifications (recipient_id, title, body, href)
    select attempt.student_id, 'Quiz reviewed', a.title, '/portal/assignments/' || a.id::text
    from public.assignments as a where a.id = attempt.assignment_id;
  end if;
end;
$$;

-- PostgREST exposes only invoker wrappers. All privileged work happens in
-- private functions with explicit tutor or student ownership checks.
create function public.publish_quiz_assignment(
  p_quiz_id uuid, p_engagement_id uuid, p_student_ids uuid[] default null,
  p_due_at timestamptz default null, p_request_id uuid default null
)
returns uuid language sql set search_path = '' as $$
  select private.publish_quiz_assignment(p_quiz_id, p_engagement_id, p_student_ids, p_due_at, p_request_id);
$$;
create function public.submit_quiz(p_assignment_id uuid, p_answers jsonb)
returns uuid language sql set search_path = '' as $$
  select private.submit_quiz(p_assignment_id, p_answers);
$$;
create function public.grade_quiz_answer(p_submission_id uuid, p_position integer, p_correct boolean, p_feedback text)
returns void language sql set search_path = '' as $$
  select private.grade_quiz_answer(p_submission_id, p_position, p_correct, p_feedback);
$$;

revoke execute on function private.publish_quiz_assignment(uuid, uuid, uuid[], timestamptz, uuid),
  private.submit_quiz(uuid, jsonb), private.grade_quiz_answer(uuid, integer, boolean, text),
  public.publish_quiz_assignment(uuid, uuid, uuid[], timestamptz, uuid),
  public.submit_quiz(uuid, jsonb), public.grade_quiz_answer(uuid, integer, boolean, text)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.publish_quiz_assignment(uuid, uuid, uuid[], timestamptz, uuid),
  private.submit_quiz(uuid, jsonb), private.grade_quiz_answer(uuid, integer, boolean, text),
  public.publish_quiz_assignment(uuid, uuid, uuid[], timestamptz, uuid),
  public.submit_quiz(uuid, jsonb), public.grade_quiz_answer(uuid, integer, boolean, text)
  to authenticated;
