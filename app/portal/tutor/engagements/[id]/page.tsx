import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ActionForm } from "@/lib/tutor/action-form";
import { Field, TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { deleteEngagement, addEnrollment, removeEnrollment } from "../actions";
import { EngagementForm } from "../form";

export default async function EngagementPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const editing = (await searchParams).edit === "1";
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const results = await Promise.all([
    db.from("engagements").select("id,title,kind,description").eq("id", id).maybeSingle(),
    db.from("engagement_students").select("student_id").eq("engagement_id", id),
    db.from("people").select("id,name").eq("role", "student").is("deleted_at", null).order("name"),
    db.from("sessions").select("id,title,starts_at,status").eq("engagement_id", id).order("starts_at", { ascending: false }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [engagement, enrollment, people, sessions] = results;
  if (!engagement.data) notFound();
  const enrolledIds = new Set(enrollment.data?.map((row) => row.student_id));
  const roster = people.data?.filter((person) => enrolledIds.has(person.id)) ?? [];
  const candidates = people.data?.filter((person) => !enrolledIds.has(person.id)) ?? [];

  return (
    <div className="stack">
      <TutorIntro title={engagement.data.title} description={engagement.data.description} back={{ href: "/portal/tutor/engagements", label: "Engagements" }}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/portal/tutor/sessions?engagement=${id}`} className="button">Schedule a session</Link>
          <Link href={`/portal/tutor/materials?engagement=${id}`} className="button secondary">Add learning material</Link>
        </div>
      </TutorIntro>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="stack">
          <section className="panel stack">
            <h2>Students</h2>
            {!roster.length && <p className="muted">Add the first student to start scheduling.</p>}
            {roster.map((student) => (
              <div key={student.id} className="row spread border-b border-[var(--border)] pb-3">
                <Link href={`/portal/tutor/clients/${student.id}`}>{student.name}</Link>
                <ActionForm action={removeEnrollment} label="Remove from engagement" secondary>
                  <input name="engagement_id" type="hidden" value={id} />
                  <input name="student_id" type="hidden" value={student.id} />
                </ActionForm>
              </div>
            ))}
            {!!candidates.length && <ActionForm action={addEnrollment} label="Enroll student" reset>
              <input name="engagement_id" type="hidden" value={id} />
              <Field name="enroll-student" label="Student">
                <select id="enroll-student" name="student_id" defaultValue="" required>
                  <option value="" disabled>Choose a student</option>
                  {candidates.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                </select>
              </Field>
            </ActionForm>}
            {!people.data?.length && <Link href="/portal/tutor/clients">Add a client</Link>}
          </section>
          <section className="panel stack">
            <h2>Sessions</h2>
            {!sessions.data?.length && <p className="muted">No sessions scheduled yet.</p>}
            {sessions.data?.map((session) => (
              <div key={session.id}>
                <Link href={`/portal/tutor/sessions/${session.id}`}>{formatDateTime(session.starts_at)}</Link>
                {session.title && <p>{session.title}</p>}
                <p className="muted text-sm">{session.status}</p>
              </div>
            ))}
          </section>
        </div>
        <section className="panel stack">
          <div className="row spread">
            <h2>Engagement details</h2>
            {!editing && <Link className="button secondary" href={`/portal/tutor/engagements/${id}?edit=1`}>Edit engagement</Link>}
          </div>
          {editing ? <>
            <EngagementForm engagement={engagement.data} />
            <Link className="button secondary" href={`/portal/tutor/engagements/${id}`}>Cancel</Link>
          </> : <dl className="stack">
            <div><dt className="muted text-sm">Title</dt><dd>{engagement.data.title}</dd></div>
            <div><dt className="muted text-sm">Type</dt><dd className="capitalize">{engagement.data.kind}</dd></div>
            {engagement.data.description && <div><dt className="muted text-sm">Description</dt><dd className="prose-copy">{engagement.data.description}</dd></div>}
          </dl>}
        </section>
      </div>
      <section className="panel stack">
        <h2>Delete engagement</h2>
        <p className="muted">Permanently removes this engagement’s sessions, materials, assignments, submissions, and study plans. Client accounts and reusable quiz drafts are kept.</p>
        <ActionForm action={deleteEngagement} label="Delete engagement" secondary confirmMessage={`Permanently delete ${engagement.data.title} and all its sessions, materials, assignments, submissions, and study plans? Client accounts will be kept.`}>
          <input type="hidden" name="id" value={id} />
        </ActionForm>
      </section>
    </div>
  );
}
