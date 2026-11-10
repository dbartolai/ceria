import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { Quiz } from '@/lib/quizzes/types';
import { questionCount } from './data';

type PendingReview = {
  id: string;
  pending_count: number;
  people: { name: string } | null;
  assignments: { title: string } | null;
};

export default async function TutorQuizzesPage() {
  const { db } = await requireRole('tutor');
  const [drafts, reviews] = await Promise.all([
    db.from('quizzes').select('*').order('updated_at', { ascending: false }).returns<Quiz[]>(),
    db.from('submissions').select('id,pending_count,people!submissions_student_id_fkey(name),assignments!submissions_assignment_id_fkey(title)').gt('pending_count', 0).order('submitted_at').returns<PendingReview[]>(),
  ]);
  if (drafts.error || reviews.error) throw new Error('Quiz drafts and reviews could not be loaded.');
  return (
    <div className="stack">
      <header className="page-intro">
        <h1>Quizzes</h1>
        <p>Prepare practice and review submitted work.</p>
        <div><Link className="button" href="/portal/tutor/quizzes/new">New quiz</Link></div>
      </header>
      {reviews.data.length > 0 && (
        <section className="panel stack">
          <h2>Awaiting review</h2>
          {reviews.data.map((submission) => (
            <div className="row justify-between" key={submission.id}>
              <div>
                <strong>{submission.people?.name ?? 'Student'} · {submission.assignments?.title ?? 'Quiz'}</strong>
                <p className="muted">{submission.pending_count} {submission.pending_count === 1 ? 'answer' : 'answers'} to grade</p>
              </div>
              <Link href={`/portal/tutor/quizzes/submissions/${submission.id}`}>Review submission</Link>
            </div>
          ))}
        </section>
      )}
      <section className="stack">
        <h2>Saved quizzes</h2>
        {drafts.data.length === 0 ? <p className="panel muted">Create a quiz to prepare practice for a student or group.</p> : (
          <div className="grid gap-3">
            {drafts.data.map((quiz) => (
              <article className="panel row justify-between" key={quiz.id}>
                <div>
                  <h3><Link href={`/portal/tutor/quizzes/${quiz.id}`}>{quiz.title}</Link></h3>
                  <p className="muted">{questionCount(quiz.questions)} · Updated {formatDate(quiz.updated_at)}</p>
                </div>
                <Link className="button secondary" href={`/portal/tutor/quizzes/${quiz.id}`}>Open quiz</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
