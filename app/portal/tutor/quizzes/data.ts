import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSettings } from '@/lib/settings';
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
  const [notes, engagement, participants] = await Promise.all([
    db.from('session_notes').select('topics').eq('session_id', sessionId).is('student_id', null).maybeSingle(),
    db.from('engagements').select('settings').eq('id', session.engagement_id).single(),
    db.from('session_students').select('student_id').eq('session_id', sessionId),
  ]);
  if (notes.error || engagement.error || participants.error) throw new Error('The session context could not be loaded.');

  let topics = notes.data?.topics;
  let student = null;
  let enrollment = null;
  if (participants.data.length === 1) {
    const studentId = participants.data[0].student_id;
    const [studentResult, enrollmentResult, individualNotes] = await Promise.all([
      db.from('people').select('settings').eq('id', studentId).single(),
      db.from('engagement_students').select('settings').eq('engagement_id', session.engagement_id).eq('student_id', studentId).maybeSingle(),
      db.from('session_notes').select('topics').eq('session_id', sessionId).eq('student_id', studentId).maybeSingle(),
    ]);
    if (studentResult.error || enrollmentResult.error || individualNotes.error) throw new Error('The session context could not be loaded.');
    student = studentResult.data;
    enrollment = enrollmentResult.data;
    topics ||= individualNotes.data?.topics;
  }
  const settings = resolveSettings(engagement.data.settings, student?.settings, enrollment?.settings);
  const context = [
    topics && `Topics covered: ${topics}`,
    settings.testPrep && `Test preparation: ${settings.testPrep}`,
    settings.quizPreferences && `Quiz preferences: ${settings.quizPreferences}`,
  ].filter(Boolean).join('\n');
  return { id: session.id, engagementId: session.engagement_id, context };
}

export async function assignmentEngagements(db: SupabaseClient): Promise<AssignmentEngagement[]> {
  const [engagements, enrollments, students] = await Promise.all([
    db.from('engagements').select('id,title,settings').order('title'),
    db.from('engagement_students').select('engagement_id,student_id,settings'),
    db.from('people').select('id,name,settings').eq('role', 'student').order('name'),
  ]);
  if (engagements.error || enrollments.error || students.error) throw new Error('Engagements could not be loaded.');
  return engagements.data.map((engagement) => {
    const memberships = new Map(enrollments.data.filter((item) => item.engagement_id === engagement.id).map((item) => [item.student_id, item]));
    const eligible = students.data.filter((student) => {
      const enrollment = memberships.get(student.id);
      return enrollment && resolveSettings(engagement.settings, student.settings, enrollment.settings).quizzes;
    });
    return { id: engagement.id, title: engagement.title, students: eligible.map(({ id, name }) => ({ id, name })) };
  }).filter((engagement) => engagement.students.length > 0);
}

export function questionCount(questions: Question[]) {
  return `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`;
}
