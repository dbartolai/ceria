import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { scoreLabel } from '@/lib/quizzes/format';
import { AnswerReview } from '@/lib/quizzes/review';
import type { AssignmentQuestion, SubmissionAnswer, SubmissionSummary } from '@/lib/quizzes/types';
import { GradeForm } from './grade-form';

type TutorSubmission = SubmissionSummary & {
  assignment_id: string;
  assignments: { quiz_id: string; title: string } | null;
  people: { name: string } | null;
};

export default async function TutorSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireRole('tutor');
  const { id } = await params;
  const submission = await db.from('submissions')
    .select('id,assignment_id,score,total,pending_count,submitted_at,assignments!submissions_assignment_id_fkey(quiz_id,title),people!submissions_student_id_fkey(name)')
    .eq('id', id).maybeSingle().overrideTypes<TutorSubmission, { merge: false }>();
  if (!submission.data) notFound();
  const attempt = submission.data;
  const [answers, questions] = await Promise.all([
    db.from('submission_answers').select('*').eq('submission_id', id).order('position').returns<SubmissionAnswer[]>(),
    db.from('assignment_questions').select('position,kind,prompt,topic,choices').eq('assignment_id', attempt.assignment_id).order('position').returns<AssignmentQuestion[]>(),
  ]);
  if (answers.error || questions.error) throw new Error('This submission could not be loaded.');
  return (
    <div className="stack">
      <header className="page-intro">
        <Link className="muted" href={attempt.assignments ? `/portal/tutor/quizzes/${attempt.assignments.quiz_id}` : '/portal/tutor/quizzes'}>← Back to quiz</Link>
        <h1>{attempt.people?.name ?? 'Student'}’s submission</h1>
        <p>{attempt.assignments?.title ?? 'Quiz'} · {formatDate(attempt.submitted_at)}</p>
        <p className="tabular-nums">{scoreLabel(attempt)}</p>
      </header>
      {answers.data.map((answer) => {
        const question = questions.data.find((item) => item.position === answer.position);
        return question && (
          <AnswerReview key={answer.position} question={question} answer={answer}>
            {answer.outcome === 'pending' || question.kind === 'short-answer' ? (
              <GradeForm submissionId={id} answer={answer} />
            ) : (
              <details>
                <summary>Adjust grade</summary>
                <GradeForm submissionId={id} answer={answer} />
              </details>
            )}
          </AnswerReview>
        );
      })}
    </div>
  );
}
