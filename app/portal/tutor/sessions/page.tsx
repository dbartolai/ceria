import Link from "next/link";
import type { TutorSessionRow } from "@/lib/sessions";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { engagementLabel, tutorEngagements } from "@/lib/tutor/engagements";
import { TutorIntro } from "@/lib/tutor/ui";
import { SessionForm } from "./form";

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ engagement?: string }> }) {
  const { engagement } = await searchParams;
  const { db } = await requireRole("tutor");
  const results = await Promise.all([
    tutorEngagements(db).then(data => ({ data, error: null })),
    db.from("sessions").select("id,title,starts_at,duration_minutes,status,engagements(title),session_students(people(name,deleted_at))").order("starts_at", { ascending: false }).returns<TutorSessionRow[]>(),
    db.from("engagement_students").select("engagement_id,student_id"),
    db.from("people").select("id,name").eq("role", "student").is("deleted_at", null).order("name"),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [engagements, sessions, enrollments, people] = results;
  const selected = engagements.data?.find((item) => item.id === engagement);
  const memberIds = new Set(enrollments.data?.filter((row) => row.engagement_id === selected?.id).map((row) => row.student_id));
  const roster = people.data?.filter((person) => memberIds.has(person.id)) ?? [];
  const now = new Date().getTime();
  const upcoming = sessions.data?.filter((session) => session.status === "scheduled" && Date.parse(session.starts_at) >= now).reverse() ?? [];
  const upcomingIds = new Set(upcoming.map((session) => session.id));
  const history = sessions.data?.filter((session) => !upcomingIds.has(session.id)) ?? [];

  function renderSessions(items: NonNullable<typeof sessions.data>) {
    return items.map((session) => (
      <li key={session.id} className="py-3">
        <Link href={`/portal/tutor/sessions/${session.id}`}>{session.engagements?.title ?? "Session"}</Link>
        {session.title && <p>{session.title}</p>}
        <p className="muted text-sm">{session.session_students.flatMap(row => row.people && !row.people.deleted_at ? [row.people.name] : []).join(", ")}</p>
        <p className="muted text-sm">{formatDateTime(session.starts_at)} · {session.status}</p>
      </li>
    ));
  }

  return (
    <div className="stack">
      <TutorIntro title="Sessions" description="Schedule lessons and keep session follow-up in one place." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="panel stack self-start">
          <h2>Upcoming sessions</h2>
          {upcoming.length ? <ul className="divide-y divide-[var(--border)]">{renderSessions(upcoming)}</ul> : <p className="muted">No upcoming sessions.</p>}
          {!!history.length && <details>
            <summary>Session history</summary>
            <ul className="divide-y divide-[var(--border)]">{renderSessions(history)}</ul>
          </details>}
        </section>
        <section className="panel stack">
          <h2>Schedule a session</h2>
          {selected ? <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/portal/tutor/engagements/${selected.id}`}>{engagementLabel(selected)}</Link>
              <Link className="muted text-sm" href="/portal/tutor/sessions">Change engagement</Link>
            </div>
            {roster.length ? <SessionForm key={selected.id} engagementId={selected.id} roster={roster} selected={roster.map((student) => student.id)} />
              : <p className="muted">Enroll a student in this engagement before scheduling.</p>}
          </> : engagements.data?.length ? (
            <form action="/portal/tutor/sessions" className="stack">
              <label htmlFor="schedule-engagement">Engagement</label>
              <select id="schedule-engagement" name="engagement" defaultValue="" required>
                <option value="" disabled>Choose an engagement</option>
                {engagements.data.map((item) => <option key={item.id} value={item.id}>{engagementLabel(item)}</option>)}
              </select>
              <div><button className="button secondary">Continue</button></div>
            </form>
          ) : <Link href="/portal/tutor/engagements">Create an engagement first</Link>}
        </section>
      </div>
    </div>
  );
}
