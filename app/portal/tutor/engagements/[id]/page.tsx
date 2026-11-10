import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ActionForm } from "@/lib/tutor/action-form";
import { Field, SettingsFields, TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { addEnrollment, removeEnrollment, updateEnrollment } from "../actions";
import { EngagementForm } from "../form";

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const results = await Promise.all([
    db.from("engagements").select("id,title,kind,description,settings").eq("id", id).maybeSingle(),
    db.from("engagement_students").select("student_id,settings").eq("engagement_id", id),
    db.from("people").select("id,name,settings").eq("role", "student").order("name"),
    db.from("sessions").select("id,title,starts_at,status").eq("engagement_id", id).order("starts_at", { ascending: false }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [engagement, enrollment, people, sessions] = results;
  if (!engagement.data) notFound();
  const settings = new Map(enrollment.data?.map((row) => [row.student_id, row.settings]));
  const roster = people.data?.filter((person) => settings.has(person.id)) ?? [];
  const candidates = people.data?.filter((person) => !settings.has(person.id)) ?? [];

  return (
    <div className="stack">
      <TutorIntro title={engagement.data.title} description={engagement.data.description} back={{ href: "/portal/tutor/engagements", label: "Engagements" }}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/portal/tutor/sessions?engagement=${id}`} className="button">Schedule a session</Link>
          <Link href={`/portal/tutor/materials?engagement=${id}`} className="button secondary">Add learning material</Link>
        </div>
      </TutorIntro>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="stack">
          <section className="panel stack">
            <h2>Students</h2>
            {!roster.length && <p className="muted">Add the first student to start scheduling.</p>}
            {roster.map((student) => (
              <details key={student.id} className="border-b border-[var(--border)] pb-3">
                <summary>{student.name}</summary>
                <div className="stack mt-4">
                  <Link href={`/portal/tutor/clients/${student.id}`}>View profile</Link>
                  <ActionForm action={updateEnrollment} label="Save student preferences">
                    <input name="engagement_id" type="hidden" value={id} />
                    <input name="student_id" type="hidden" value={student.id} />
                    <SettingsFields prefix={student.id} settings={settings.get(student.id)} />
                  </ActionForm>
                  <ActionForm action={removeEnrollment} label="Remove from engagement" secondary>
                    <input name="engagement_id" type="hidden" value={id} />
                    <input name="student_id" type="hidden" value={student.id} />
                  </ActionForm>
                </div>
              </details>
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
                <Link href={`/portal/tutor/sessions/${session.id}`}>{session.title}</Link>
                <p className="muted text-sm">{formatDateTime(session.starts_at)} · {session.status}</p>
              </div>
            ))}
          </section>
        </div>
        <section className="panel stack self-start">
          <h2>Edit engagement</h2>
          <EngagementForm engagement={engagement.data} />
        </section>
      </div>
    </div>
  );
}
