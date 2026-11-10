'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';

export async function submitQuiz(assignmentId: string, _state: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const { db } = await requireRole('student');
  let answers: unknown;
  try {
    answers = JSON.parse(String(form.get('answers') ?? ''));
  } catch {
    return { error: 'Enter a response for each question.' };
  }
  if (!Array.isArray(answers) || answers.length > 60 || answers.some((answer) => typeof answer !== 'string' || answer.length > 4000)) {
    return { error: 'Enter a response for each question (up to 4,000 characters).' };
  }
  const { error } = await db.rpc('submit_quiz', { p_assignment_id: assignmentId, p_answers: answers });
  if (error) return { error: ['42501', '22023'].includes(error.code) ? error.message : 'Your answers could not be submitted. Try again.' };
  revalidatePath('/portal');
  revalidatePath('/portal/assignments');
  redirect(`/portal/assignments/${assignmentId}`);
}
