import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { lessonContext, reusableQuizzes } from '../data';
import { QuizEditor } from '../editor';

export default async function NewQuizPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { db } = await requireRole('tutor');
  const { session: sessionId } = await searchParams;
  const [lesson, library] = await Promise.all([lessonContext(db, sessionId), reusableQuizzes(db)]);
  return (
    <div className="stack">
      <header className="page-intro">
        <Link className="muted" href={lesson ? `/portal/tutor/sessions/${lesson.id}` : '/portal/tutor/quizzes'}>← {lesson ? 'Back to session' : 'All quizzes'}</Link>
        <h1>New quiz</h1>
        <p>Write questions, reuse a saved question, or import an editable draft.</p>
      </header>
      <QuizEditor id={null} sessionId={lesson?.id ?? null} initial={{ title: '', description: '', questions: [] }} library={library} />
    </div>
  );
}
