import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export default async function TutorHome() {
  const { db } = await requireRole("tutor");
  const now = new Date().toISOString();
  const results = await Promise.all([
    db.from("sessions").select("id,title,starts_at,duration_minutes")
      .eq("status", "scheduled").gte("starts_at", now).order("starts_at").limit(4),
    db.from("sessions").select("id,title,starts_at")
      .eq("status", "completed").order("starts_at", { ascending: false }).limit(4),
    db.from("people").select("id", { count: "exact", head: true }).eq("role", "student"),
    db.from("recaps").select("id", { count: "exact", head: true }).is("published_at", null),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [upcoming, completed, students, drafts] = results;
  const [next, ...later] = upcoming.data ?? [];

  return (
    <>
      <header className="portal-hero">
        <p className="eyebrow">Tutor workspace</p>
        <h1>Studio overview</h1>
        <p className="muted">Manage upcoming lessons and pick up where you left off.</p>
        <div className="row mt-5">
          <Link className="button" href="/portal/tutor/sessions">Schedule a session <ArrowRight size={16} aria-hidden /></Link>
          <Link className="button secondary" href="/portal/tutor/clients">Manage clients</Link>
        </div>
      </header>
      <div className="dashboard-columns">
        <div className="stack-lg">
          <section>
            <h2 className="section-title">Upcoming sessions</h2>
            {next ? <div className="panel session-card stack">
              <div className="row"><CalendarDays size={17} aria-hidden /><time dateTime={next.starts_at}>{formatDateTime(next.starts_at)}</time></div>
              <h3>{next.title}</h3>
              <p className="muted text-sm">{next.duration_minutes} minutes</p>
              <Link className="section-link" href={`/portal/tutor/sessions/${next.id}`}>Open session <ArrowRight size={15} aria-hidden /></Link>
            </div> : <p className="empty">No sessions on the calendar.</p>}
            {!!later.length && <ul className="rule-list mt-4">
              {later.map((session) => (
                <li key={session.id} className="row spread">
                  <Link href={`/portal/tutor/sessions/${session.id}`}>{session.title}</Link>
                  <time className="muted text-sm" dateTime={session.starts_at}>{formatDateTime(session.starts_at)}</time>
                </li>
              ))}
            </ul>}
          </section>
          <section className="panel stack">
            <h2>Recent lessons</h2>
            {!completed.data?.length ? <p className="muted">Completed sessions will appear here for follow-up.</p> : <ul className="rule-list">
              {completed.data.map((session) => (
                <li key={session.id} className="row spread">
                  <Link href={`/portal/tutor/sessions/${session.id}`}>{session.title}</Link>
                  <time className="muted text-sm" dateTime={session.starts_at}>{formatDateTime(session.starts_at)}</time>
                </li>
              ))}
            </ul>}
          </section>
        </div>
        <section className="panel stack">
          <h2>At a glance</h2>
          <div className="metric-row">
            <div><strong>{students.count ?? 0}</strong><Link href="/portal/tutor/clients">Students</Link></div>
            <div><strong>{drafts.count ?? 0}</strong><Link href="/portal/tutor/sessions">Recap drafts</Link></div>
          </div>
          <hr />
          <nav className="stack" aria-label="Tutor shortcuts">
            <Link className="section-link" href="/portal/tutor/quizzes">Review quizzes <ArrowRight size={15} aria-hidden /></Link>
            <Link className="section-link" href="/portal/tutor/materials">Open learning materials <ArrowRight size={15} aria-hidden /></Link>
            <Link className="section-link" href="/portal/tutor/billing">Manage billing <ArrowRight size={15} aria-hidden /></Link>
          </nav>
        </section>
      </div>
    </>
  );
}
