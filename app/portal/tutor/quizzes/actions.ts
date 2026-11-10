'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { manualContentProvider } from '@/lib/ai/manual';
import { parseQuizDraft } from '@/lib/quizzes/content';
import type { QuizDraft } from '@/lib/quizzes/types';

export type QuizActionState = { error?: string; success?: string };

export async function saveQuiz(id: string | null, sessionId: string | null, _state: QuizActionState, form: FormData): Promise<QuizActionState> {
  const { db } = await requireRole('tutor');
  let draft: QuizDraft;
  try {
    draft = manualContentProvider.parse(String(form.get('draft') ?? ''), { parse: parseQuizDraft });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Check the quiz fields.' };
  }
  const values = { ...draft, updated_at: new Date().toISOString() };
  const { data, error } = id
    ? await db.from('quizzes').update(values).eq('id', id).select('id').single()
    : await db.from('quizzes').insert(values).select('id').single();
  if (error) return { error: 'The draft could not be saved. Try again.' };
  revalidatePath('/portal/tutor/quizzes');
  if (id) return { success: 'Draft saved.' };
  const query = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
  redirect(`/portal/tutor/quizzes/${data.id}${query}`);
}

export async function publishQuiz(quizId: string, requestId: string, _state: QuizActionState, form: FormData): Promise<QuizActionState> {
  const { db } = await requireRole('tutor');
  const engagementId = String(form.get('engagement') ?? '');
  const recipient = String(form.get('recipient') ?? '');
  const date = String(form.get('due') ?? '');
  if (!engagementId || !recipient) return { error: 'Choose an engagement and recipient.' };
  const due = date ? new Date(`${date}T23:59:59Z`) : null;
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== date)) {
    return { error: 'Enter a valid due date.' };
  }
  const { error } = await db.rpc('publish_quiz_assignment', {
    p_quiz_id: quizId,
    p_engagement_id: engagementId,
    p_student_ids: recipient === 'all' ? null : [recipient],
    p_due_at: due?.toISOString() ?? null,
    p_request_id: requestId,
  });
  if (error) return { error: error.code === '22023' ? error.message : 'The quiz could not be published. Try again.' };
  revalidatePath(`/portal/tutor/quizzes/${quizId}`);
  revalidatePath('/portal/tutor/quizzes');
  revalidatePath('/portal/assignments');
  return { success: 'Assignment published. Students were notified in their portal.' };
}

export async function gradeAnswer(submissionId: string, position: number, _state: QuizActionState, form: FormData): Promise<QuizActionState> {
  const { db } = await requireRole('tutor');
  const grade = form.get('grade');
  const feedback = String(form.get('feedback') ?? '').trim();
  if (grade !== 'correct' && grade !== 'incorrect') return { error: 'Choose a grade.' };
  if (feedback.length > 4000) return { error: 'Use 4,000 characters or fewer for feedback.' };
  const { error } = await db.rpc('grade_quiz_answer', {
    p_submission_id: submissionId,
    p_position: position,
    p_correct: grade === 'correct',
    p_feedback: feedback,
  });
  if (error) return { error: 'The grade could not be saved. Try again.' };
  revalidatePath(`/portal/tutor/quizzes/submissions/${submissionId}`);
  revalidatePath('/portal/tutor/quizzes');
  revalidatePath('/portal/assignments');
  return { success: 'Grade saved.' };
}
