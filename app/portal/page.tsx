import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { CalendarLink, SessionMeta } from "@/components/session-card";
import { requirePerson } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { dueDate } from "@/lib/quizzes/format";
import { getAssignments, getLinkedStudents, getRecaps, getSessions, partitionSessions } from "@/lib/portal-data";

export default async function Portal() {
  const { person, db } = await requirePerson();
  if (person.role === "tutor") redirect("/portal/tutor");
  const student = person.role === "student";
  const [sessions, assignments, linked, recaps] = await Promise.all([
    getSessions(db),
    student ? getAssignments(db) : [],
    student ? [] : getLinkedStudents(db),
    student ? [] : getRecaps(db, "guardian"),
  ]);
  const { upcoming } = partitionSessions(sessions);
  const nextSession = upcoming[0];
  const outstanding = assignments.filter((assignment) => !assignment.submissions.length);

  return <>
    <header className="portal-hero">
      <p className="eyebrow">{student ? "Student portal" : "Guardian portal"}</p>
      <h1>{student ? "Your learning desk" : "Family portal"}</h1>
      <p className="muted">Welcome, {person.name}.</p>
    </header>
    <div className="dashboard-columns">
      <div className="stack-lg">
        <section aria-labelledby="next-session">
          <div className="row spread section-title"><h2 id="next-session">Next session</h2>
            <Link className="section-link" href="/portal/sessions">All sessions <ArrowRight size={15} aria-hidden /></Link>
          </div>
          {nextSession ? <article className="panel session-card stack">
            {nextSession.engagements && <p className="eyebrow">{nextSession.engagements.title}</p>}
            <h3>{nextSession.title}</h3>
            <SessionMeta session={nextSession} />
            <CalendarLink id={nextSession.id} />
          </article> : <p className="empty">There are no upcoming sessions on your schedule.</p>}
        </section>
        {student ? <section aria-labelledby="practice">
          <div className="row spread section-title"><h2 id="practice">Practice</h2>
            <Link className="section-link" href="/portal/assignments">All assignments <ArrowRight size={15} aria-hidden /></Link>
          </div>
          {outstanding.length ? <div className="panel rule-list">
            {outstanding.slice(0, 5).map((assignment) => <div className="row spread" key={assignment.id}>
              <div><h3>{assignment.title}</h3><small className="muted">
                {assignment.due_at ? `Due ${dueDate(assignment.due_at)}` : "No due date"}
              </small></div>
              <Link className="button secondary" href={`/portal/assignments/${assignment.id}`}>Open quiz</Link>
            </div>)}
          </div> : <p className="empty">You have no outstanding assignments.</p>}
        </section> : <section aria-labelledby="latest-recaps">
          <div className="row spread section-title"><h2 id="latest-recaps">Recent recaps</h2></div>
          {recaps.length ? <div className="panel rule-list">
            {recaps.slice(0, 3).map((recap) => <div className="row spread" key={recap.id}>
              <div><h3>{sessions.find((session) => session.id === recap.session_id)?.title ?? "Session recap"}</h3>
                <small className="muted">{formatDate(recap.published_at)}</small></div>
              <Link className="section-link" href={`/portal/sessions#recap-${recap.id}`}>Read recap <ArrowRight size={15} aria-hidden /></Link>
            </div>)}
          </div> : <p className="empty">Published recaps will appear here after your sessions.</p>}
        </section>}
      </div>
      <aside className="stack-lg">
        {student ? <>
          <section className="panel stack">
            <h2>Learning record</h2>
            <div className="metric-row">
              <div><strong>{sessions.filter((session) => session.status === "completed").length}</strong><small className="muted">Sessions completed</small></div>
              <div><strong>{assignments.filter((assignment) => assignment.submissions.length).length}</strong><small className="muted">Assignments completed</small></div>
            </div>
            <Link className="section-link" href="/portal/progress">View progress <ArrowRight size={15} aria-hidden /></Link>
          </section>
          <Link className="panel resource-link" href="/portal/materials"><BookOpen size={21} aria-hidden />
            <div><h3>Learning materials</h3><small className="muted">Handouts and notes from your tutor</small></div>
            <ArrowRight size={16} aria-hidden />
          </Link>
        </> : <>
          <section className="panel stack"><h2>Students</h2>
            {linked.length ? <ul className="rule-list">{linked.map((child) => <li key={child.id}>{child.name}</li>)}</ul>
              : <p className="muted">Your tutor can link students to this account.</p>}
          </section>
          <section className="panel stack"><h2>Billing</h2>
            <p className="muted">View invoices, payment status, and payment options.</p>
            <Link className="section-link" href="/portal/billing">Open billing <ArrowRight size={15} aria-hidden /></Link>
          </section>
        </>}
      </aside>
    </div>
  </>;
}
