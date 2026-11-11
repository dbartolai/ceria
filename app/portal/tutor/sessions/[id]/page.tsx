import Link from "next/link";
import { notFound } from "next/navigation";
import { MathText } from "@/components/math";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ActionForm } from "@/lib/tutor/action-form";
import { Field, TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { publishRecap, saveNotes, saveRecap, unpublishRecap } from "../actions";
import { SessionForm } from "../form";

const noteFields = [
  ["topics", "Topics covered"],
  ["strengths", "Observed strengths"],
  ["weaknesses", "Areas to revisit"],
  ["next_steps", "Next steps"],
] as const;

type LessonNotes = Partial<Record<(typeof noteFields)[number][0], string>>;

function NoteForm({ sessionId, studentId, notes }: { sessionId: string; studentId?: string; notes?: LessonNotes }) {
  const prefix = studentId ?? "group";
  return (
    <ActionForm action={saveNotes} label="Save private notes" secondary>
      <input name="session_id" type="hidden" value={sessionId} />
      <input name="student_id" type="hidden" value={studentId ?? ""} />
      <div className="form-grid">
        {noteFields.map(([name, label]) => (
          <Field key={name} name={`${prefix}-${name}`} label={label}>
            <textarea id={`${prefix}-${name}`} name={name} rows={3} maxLength={3000} defaultValue={notes?.[name]} />
          </Field>
        ))}
      </div>
    </ActionForm>
  );
}

function RecapFields({ prefix, body = "", topics = "" }: { prefix: string; body?: string; topics?: string }) {
  return <>
    <Field name={`${prefix}-topics`} label="Topics covered">
      <input id={`${prefix}-topics`} name="topics" defaultValue={topics} maxLength={1500} />
    </Field>
    <Field name={`${prefix}-body`} label="Recap">
      <textarea id={`${prefix}-body`} name="body" rows={6} defaultValue={body} maxLength={12000} required />
    </Field>
  </>;
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const session = await db.from("sessions").select("id,engagement_id,title,starts_at,duration_minutes,location,status").eq("id", id).maybeSingle();
  if (session.error) throw session.error;
  if (!session.data) notFound();

  const { engagement_id: engagementId } = session.data;
  const results = await Promise.all([
    db.from("session_students").select("student_id").eq("session_id", id),
    db.from("engagement_students").select("student_id").eq("engagement_id", engagementId),
    db.from("people").select("id,name").eq("role", "student").order("name"),
    db.from("session_notes").select("student_id,topics,strengths,weaknesses,next_steps").eq("session_id", id),
    db.from("recaps").select("id,student_id,audience,topics,body,published_at").eq("session_id", id).order("published_at", { nullsFirst: true }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [participants, enrollments, students, notes, recaps] = results;
  const participantIds = participants.data?.map((row) => row.student_id) ?? [];
  const eligible = new Set(enrollments.data?.map((row) => row.student_id));
  const participantsByName = students.data?.filter((student) => participantIds.includes(student.id)) ?? [];
  const roster = students.data?.filter((student) => eligible.has(student.id) || participantIds.includes(student.id)) ?? [];
  const groupNotes = notes.data?.find((note) => !note.student_id);

  return (
    <div className="stack">
      <TutorIntro title={session.data.title} description={`${formatDateTime(session.data.starts_at)} · ${session.data.duration_minutes} min · ${session.data.status}`} back={{ href: "/portal/tutor/sessions", label: "Sessions" }}>
        <div className="flex flex-wrap gap-2">
          <Link className="button" href={`/portal/tutor/sessions/${id}/prepare`}>Prepare session & study plan</Link>
          {session.data.status !== "cancelled" && <a className="button secondary" href={`/portal/calendar/${id}`}>Download calendar invite</a>}
          <Link className="button secondary" href={`/portal/tutor/quizzes/new?session=${id}`}>Create a practice quiz</Link>
          <Link className="button secondary" href={`/portal/tutor/materials?engagement=${engagementId}&session=${id}`}>Add learning material</Link>
        </div>
      </TutorIntro>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="stack">
          <section className="panel stack">
            <h2>Lesson notes</h2>
            <p className="muted">Private notes visible to the tutor.</p>
            <details open>
              <summary>Session notes</summary>
              <div className="mt-4"><NoteForm sessionId={id} notes={groupNotes} /></div>
            </details>
            {participantsByName.map((student) => (
              <details key={student.id}>
                <summary>Notes for {student.name}</summary>
                <div className="mt-4"><NoteForm sessionId={id} studentId={student.id} notes={notes.data?.find((note) => note.student_id === student.id)} /></div>
              </details>
            ))}
          </section>

          <section className="panel stack">
            <h2>Session recaps</h2>
            {!recaps.data?.length && <p className="muted">Draft a student summary or a recap for guardians.</p>}
            {recaps.data?.map((recap) => {
              const isPublished = !!recap.published_at;
              const target = participantsByName.find((student) => student.id === recap.student_id);
              const label = recap.audience === "student" ? "Student summary" : "Guardian recap";
              return (
                <details key={`${recap.id}-${isPublished}`} className="border-b border-[var(--border)] pb-3">
                  <summary>{label} · {target?.name ?? "Whole session"} · {isPublished ? "Published" : "Draft"}</summary>
                  <div className="stack mt-4">
                    {isPublished ? <>
                      {recap.topics && <p className="muted text-sm">{recap.topics}</p>}
                      <div className="prose-copy"><MathText text={recap.body} /></div>
                      <ActionForm action={unpublishRecap} label="Return to draft" secondary>
                        <input name="id" type="hidden" value={recap.id} />
                      </ActionForm>
                    </> : <>
                      <ActionForm action={saveRecap} label="Save recap draft" secondary>
                        <input name="id" type="hidden" value={recap.id} />
                        <input name="session_id" type="hidden" value={id} />
                        <RecapFields prefix={recap.id} body={recap.body} topics={recap.topics} />
                      </ActionForm>
                      <ActionForm action={publishRecap} label="Publish recap">
                        <input name="id" type="hidden" value={recap.id} />
                        <p className="muted text-sm">Publish the saved version to the selected audience.</p>
                      </ActionForm>
                    </>}
                  </div>
                </details>
              );
            })}
            <details open={!recaps.data?.length}>
              <summary>New recap</summary>
              <div className="mt-4">
                <ActionForm action={saveRecap} label="Create recap draft">
                  <input name="session_id" type="hidden" value={id} />
                  <div className="form-grid">
                    <Field name="recap-audience" label="Audience">
                      <select id="recap-audience" name="audience"><option value="student">Students</option><option value="guardian">Guardians</option></select>
                    </Field>
                    <Field name="recap-student" label="Share with">
                      <select id="recap-student" name="student_id" defaultValue="">
                        <option value="">Whole session</option>
                        {participantsByName.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <RecapFields prefix="new-recap" topics={groupNotes?.topics} />
                </ActionForm>
              </div>
            </details>
          </section>
        </div>
        <section className="panel stack self-start">
          <h2>Schedule and attendance</h2>
          <SessionForm engagementId={engagementId} roster={roster} selected={participantIds} session={session.data} />
        </section>
      </div>
    </div>
  );
}
