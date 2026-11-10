import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { getAssignments } from '@/lib/portal-data';
import { dueDate, scoreLabel } from '@/lib/quizzes/format';
import type { AssignmentSummary } from '@/lib/quizzes/types';

export default async function AssignmentsPage() {
  const { db } = await requireRole('student');
  const assignments = await getAssignments(db);
  const upcoming = assignments.filter((assignment) => !assignment.submissions.length);
  const history = assignments.filter((assignment) => assignment.submissions.length > 0)
    .sort((a, b) => b.submissions[0].submitted_at.localeCompare(a.submissions[0].submitted_at));
  return (
    <div className="stack">
      <header className="page-intro">
        <h1>Assignments</h1>
        <p>Practice between sessions and revisit your answers.</p>
      </header>
      <section className="stack">
        <h2>To do</h2>
        {upcoming.length === 0 && <p className="panel muted">You’re up to date. New assignments will appear here.</p>}
        {upcoming.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}
      </section>
      <section className="stack">
        <h2>Submitted</h2>
        {history.length === 0 && <p className="panel muted">Your quiz results will appear here after you submit.</p>}
        {history.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}
      </section>
    </div>
  );
}

function AssignmentCard({ assignment }: { assignment: AssignmentSummary }) {
  const submission = assignment.submissions[0];
  const summary = submission ? scoreLabel(submission) : assignment.due_at ? `Due ${dueDate(assignment.due_at)}` : 'Ready to start';
  return (
    <article className="panel row justify-between">
      <div>
        <h3><Link href={`/portal/assignments/${assignment.id}`}>{assignment.title}</Link></h3>
        <p className="muted">{summary}</p>
      </div>
      <Link className="button secondary" href={`/portal/assignments/${assignment.id}`}>{submission ? 'Review answers' : 'Start quiz'}</Link>
    </article>
  );
}
