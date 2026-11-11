import type { SupabaseClient } from '@supabase/supabase-js';
import type { Question } from '@/lib/quizzes/types';
import type { ReusableQuiz } from './editor';
import type { AssignmentEngagement } from './publish-form';

export async function reusableQuizzes(db: SupabaseClient, excluded?: string): Promise<ReusableQuiz[]> {
  const { data, error } = await db.from('quizzes').select('id,title,questions').order('title');
  if (error) throw new Error('Saved quizzes could not be loaded.');
  return (data ?? []).filter((quiz) => quiz.id !== excluded && quiz.questions.length > 0);
}

export async function lessonContext(db: SupabaseClient, sessionId?: string) {
  if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return null;
  const { data: session, error: sessionError } = await db.from('sessions').select('id,engagement_id').eq('id', sessionId).maybeSingle();
  if (sessionError) throw new Error('The session context could not be loaded.');
  if (!session) return null;
  return { id: session.id, engagementId: session.engagement_id };
}

export async function assignmentEngagements(db: SupabaseClient): Promise<AssignmentEngagement[]> {
  const [engagements, enrollments, students] = await Promise.all([
    db.from('engagements').select('id,title').order('title'),
    db.from('engagement_students').select('engagement_id,student_id'),
    db.from('people').select('id,name').eq('role', 'student').order('name'),
  ]);
  if (engagements.error || enrollments.error || students.error) throw new Error('Engagements could not be loaded.');
  return engagements.data.map((engagement) => {
    const memberships = new Set(enrollments.data.filter((item) => item.engagement_id === engagement.id).map((item) => item.student_id));
    const eligible = students.data.filter((student) => memberships.has(student.id));
    return { id: engagement.id, title: engagement.title, students: eligible.map(({ id, name }) => ({ id, name })) };
  }).filter((engagement) => engagement.students.length > 0);
}

export function questionCount(questions: Question[]) {
  return `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`;
}
