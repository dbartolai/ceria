import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { TutorIntro } from "@/lib/tutor/ui";
import { MaterialForm } from "./form";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ engagement?: string; session?: string }> }) {
  const params = await searchParams;
  const { db } = await requireRole("tutor");
  const results = await Promise.all([
    db.from("engagements").select("id,title").order("title"),
    db.from("materials").select("id,title,published_at,engagement_id").order("title"),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [engagements, materials] = results;
  const selected = engagements.data?.find((item) => item.id === params.engagement);
  const titles = new Map(engagements.data?.map((item) => [item.id, item.title]));
  let students: { id: string; name: string }[] = [];
  let sessions: { id: string; label: string; participants: string[] }[] = [];

  if (selected) {
    const detail = await Promise.all([
      db.from("engagement_students").select("student_id").eq("engagement_id", selected.id),
      db.from("people").select("id,name").eq("role", "student").order("name"),
      db.from("sessions").select("id,title,starts_at").eq("engagement_id", selected.id).order("starts_at", { ascending: false }),
      db.from("session_students").select("session_id,student_id").eq("engagement_id", selected.id),
    ]);
    for (const result of detail) if (result.error) throw result.error;
    const [enrollments, people, sessionRows, roster] = detail;
    const enrolled = new Set(enrollments.data?.map((row) => row.student_id));
    students = people.data?.filter((person) => enrolled.has(person.id)) ?? [];
    sessions = sessionRows.data?.map((session) => ({
      id: session.id,
      label: `${session.title} · ${formatDateTime(session.starts_at)}`,
      participants: roster.data?.filter((row) => row.session_id === session.id).map((row) => row.student_id) ?? [],
    })) ?? [];
  }

  return (
    <div className="stack">
      <TutorIntro title="Learning materials" description="Draft lesson plans and handouts, then share approved materials with students." />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.25fr]">
        <section className="panel stack self-start">
          <h2>Material library</h2>
          {!materials.data?.length && <p className="muted">No learning materials yet.</p>}
          {!!materials.data?.length && <ul className="divide-y divide-[var(--border)]">
            {materials.data.map((item) => (
              <li className="py-3" key={item.id}>
                <Link href={`/portal/tutor/materials/${item.id}`}>{item.title}</Link>
                <p className="muted text-sm">{titles.get(item.engagement_id)} · {item.published_at ? "Published" : "Draft"}</p>
              </li>
            ))}
          </ul>}
        </section>
        <section className="panel stack">
          <h2>New material</h2>
          {selected ? <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/portal/tutor/engagements/${selected.id}`}>{selected.title}</Link>
              <Link className="muted text-sm" href="/portal/tutor/materials">Change engagement</Link>
            </div>
            <MaterialForm key={`${selected.id}-${params.session ?? ""}`} engagementId={selected.id} students={students} sessions={sessions}
              sessionId={sessions.find((item) => item.id === params.session)?.id} />
          </> : engagements.data?.length ? (
            <form action="/portal/tutor/materials" className="stack">
              <label htmlFor="material-engagement">Engagement</label>
              <select id="material-engagement" name="engagement" required defaultValue="">
                <option value="" disabled>Choose an engagement</option>
                {engagements.data.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              <div><button className="button secondary">Continue</button></div>
            </form>
          ) : <Link href="/portal/tutor/engagements">Create an engagement first</Link>}
        </section>
      </div>
    </div>
  );
}
