import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { assignmentEngagements, lessonContext, reusableQuizzes } from '../data';
import { QuizEditor } from '../editor';
import { PublishForm } from '../publish-form';
import { dueDate, scoreLabel } from '@/lib/quizzes/format';
import type { AssignmentSummary, Quiz, SubmissionSummary } from '@/lib/quizzes/types';

type PublishedAssignment = Omit<AssignmentSummary, 'submissions'> & {
  engagements: { title: string } | null;
  assignment_students: { student_id: string }[];
  submissions: (SubmissionSummary & { people: { name: string } | null })[];
};

export default async function EditQuizPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { db } = await requireRole('tutor');
  const [{ id }, { session: sessionId }] = await Promise.all([params, searchParams]);
  const [quizResult, library, lesson, engagements, assignmentsResult] = await Promise.all([
    db.from('quizzes').select('*').eq('id', id).maybeSingle(),
    reusableQuizzes(db, id),
    lessonContext(db, sessionId),
    assignmentEngagements(db),
    db.from('assignments').select('id,title,engagement_id,due_at,published_at,engagements(title),assignment_students(student_id),submissions(id,submitted_at,score,total,pending_count,people!submissions_student_id_fkey(name))').eq('quiz_id', id).order('published_at', { ascending: false }).returns<PublishedAssignment[]>(),
  ]);
  if (!quizResult.data) notFound();
  if (assignmentsResult.error) throw new Error('Published assignments could not be loaded.');
  const quiz = quizResult.data as Quiz;
  const assignments = assignmentsResult.data ?? [];
  return (
    <div className="stack">
      <header className="page-intro">
        <Link className="muted" href="/portal/tutor/quizzes">← All quizzes</Link>
        <h1>{quiz.title}</h1>
        <p>Edit the draft, then publish it as practice for a student or group.</p>
        {assignments.length > 0 && <a href="#published-assignments">View published assignments</a>}
      </header>
      <QuizEditor id={quiz.id} sessionId={lesson?.id ?? null} initial={quiz} library={library} />
      <section className="panel stack">
        <h2>Publish saved draft</h2>
        <p className="muted">Save any edits before publishing. Each assignment keeps the questions and answers from the draft at publication.</p>
        {quiz.questions.length === 0 ? <p>Add and save at least one question to publish this quiz.</p> : engagements.length === 0 ? (
          <p>Add a student to an <Link href="/portal/tutor/engagements">engagement</Link>.</p>
        ) : (
          <PublishForm quizId={quiz.id} requestId={crypto.randomUUID()} engagements={engagements} initialEngagement={lesson?.engagementId ?? null} />
        )}
      </section>
      <section className="stack" id="published-assignments">
        <h2>Published assignments</h2>
        {assignments.length === 0 && <p className="muted">This quiz has no assignments yet.</p>}
        {assignments.map((assignment) => (
          <article className="panel stack" key={assignment.id}>
            <div>
              <h3>{assignment.title} · {assignment.engagements?.title ?? 'Engagement'}</h3>
              <p className="muted">
                {assignment.submissions.length} of {assignment.assignment_students.length} submitted{assignment.due_at && ` · Due ${dueDate(assignment.due_at)}`}
              </p>
            </div>
            {assignment.submissions.map((submission) => (
              <div className="row justify-between" key={submission.id}>
                <span>{submission.people?.name ?? 'Student'} · {scoreLabel(submission)}</span>
                <Link href={`/portal/tutor/quizzes/submissions/${submission.id}`}>Review submission</Link>
              </div>
            ))}
          </article>
        ))}
      </section>
    </div>
  );
}
