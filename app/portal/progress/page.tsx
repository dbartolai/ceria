import type { Metadata } from "next";
import Link from "next/link";
import { sessionLabel } from "@/lib/sessions";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getAssignments, getEnrollments, getRecaps, getSessions } from "@/lib/portal-data";
import { resolveSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const { db, person } = await requireRole("student");
  const [sessions, assignments, enrollments, recaps] = await Promise.all([
    getSessions(db), getAssignments(db), getEnrollments(db), getRecaps(db, "student"),
  ]);
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const submissions = assignments.flatMap((assignment) => assignment.submissions.map((submission) => ({ assignment, submission })))
    .sort((a, b) => b.submission.submitted_at.localeCompare(a.submission.submitted_at));
  const topics = recaps.filter((recap) => recap.topics.trim());
  const plans = enrollments.flatMap((row) => row.engagements ? [{
    engagement: row.engagements, settings: resolveSettings(row.engagements.settings, person.settings, row.settings),
  }] : []).filter(({ settings }) => settings.goals || (settings.roadmaps && settings.milestones));

  return <>
    <header className="page-intro"><h1>Progress</h1><p>Your completed work and goals for upcoming lessons.</p></header>
    <div className="stack-lg">
      <div className="panel metric-row content-column">
        <div><strong>{completedSessions.length}</strong><span className="muted">Sessions completed</span></div>
        <div><strong>{submissions.length}</strong><span className="muted">Assignments completed</span></div>
      </div>
      {(plans.length > 0 || (enrollments.length === 0 && person.settings.goals)) && <section className="stack content-column">
        <h2>Learning goals</h2>
        {!plans.length && <p className="panel prose-copy">{person.settings.goals}</p>}
        {plans.map(({ engagement, settings }) => <article key={engagement.id} className="panel stack">
          <h3>{engagement.title}</h3>
          {settings.goals && <p className="prose-copy">{settings.goals}</p>}
          {settings.roadmaps && settings.milestones && <div><h4>Roadmap milestones</h4><p className="prose-copy">{settings.milestones}</p></div>}
        </article>)}
      </section>}
      <section className="stack content-column"><h2>Quiz history</h2>
        {submissions.length > 0 ? <div className="panel rule-list">
          {submissions.map(({ assignment, submission }) => <div className="row spread" key={submission.id}>
            <div><h3>{assignment.title}</h3><small className="muted">{formatDate(submission.submitted_at)} · {submission.pending_count
              ? "Review pending" : `${submission.score} / ${submission.total}`}</small></div>
            <Link className="section-link" href={`/portal/assignments/${assignment.id}`}>Review results</Link>
          </div>)}
        </div> : <p className="empty">Completed quizzes will appear here.</p>}
      </section>
      <section className="stack content-column"><h2>Topics covered</h2>
        {topics.length > 0 ? <ul className="panel rule-list">{topics.map((recap) => <li key={recap.id}>
          <h3>{sessionLabel(sessions.find((session) => session.id === recap.session_id))}</h3>
          <p className="prose-copy">{recap.topics}</p>
        </li>)}</ul> : <p className="empty">Topics from approved session recaps will appear here.</p>}
      </section>
    </div>
  </>;
}
