import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Markdown } from '@/components/markdown';
import { requireRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { dueDate, scoreLabel } from '@/lib/quizzes/format';
import { AnswerReview } from '@/lib/quizzes/review';
import type { AssignmentQuestion, AssignmentSummary, SubmissionAnswer } from '@/lib/quizzes/types';
import { QuizPlayer } from '../quiz-player';
import styles from '../quiz.module.css';

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireRole('student');
  const { id } = await params;
  const [assignmentResult, questionsResult] = await Promise.all([
    db.from('assignments').select('id,title,description,engagement_id,due_at,published_at,submissions(id,submitted_at,score,total,pending_count)').eq('id', id).maybeSingle().overrideTypes<AssignmentSummary & { description: string }, { merge: false }>(),
    db.from('assignment_questions').select('position,kind,prompt,topic,choices').eq('assignment_id', id).order('position').returns<AssignmentQuestion[]>(),
  ]);
  if (!assignmentResult.data) notFound();
  if (questionsResult.error) throw new Error('This quiz could not be loaded.');
  const assignment = assignmentResult.data;
  const questions = questionsResult.data;
  const submission = assignment.submissions[0];
  const answersResult = submission && await db.from('submission_answers').select('*').eq('submission_id', submission.id).order('position').returns<SubmissionAnswer[]>();
  if (answersResult?.error) throw new Error('Your quiz review could not be loaded.');
  return (
    <div className={`${styles.practice} stack`}>
      <header className="page-intro">
        <Link className="muted" href="/portal/assignments">← All assignments</Link>
        <h1>{assignment.title}</h1>
        {assignment.description && <Markdown text={assignment.description} />}
        {assignment.due_at && !submission && <p className="muted">Due {dueDate(assignment.due_at)}</p>}
      </header>
      {submission ? (
        <section className="stack">
          <div className="panel stack">
            <p className="eyebrow">Submitted {formatDate(submission.submitted_at)}</p>
            <h2>Review your answers</h2>
            <p className="tabular-nums">{scoreLabel(submission)}</p>
          </div>
          {answersResult?.data?.map((answer) => {
            const question = questions.find((item) => item.position === answer.position);
            return question && <AnswerReview key={answer.position} question={question} answer={answer} />;
          })}
        </section>
      ) : questions.length > 0 ? <QuizPlayer assignmentId={id} questions={questions} /> : <p className="panel">There are no questions in this assignment.</p>}
    </div>
  );
}
