'use client';

import { useActionState, useState } from 'react';
import type { SubmissionAnswer } from '@/lib/quizzes/types';
import { gradeAnswer } from '../../actions';

export function GradeForm({ submissionId, answer }: { submissionId: string; answer: SubmissionAnswer }) {
  const [state, action, pending] = useActionState(gradeAnswer.bind(null, submissionId, answer.position), {});
  const [grade, setGrade] = useState(answer.outcome === 'pending' ? '' : answer.outcome);
  const [feedback, setFeedback] = useState(answer.feedback);
  return (
    <form action={action}>
      <fieldset className="stack">
        <legend className="eyebrow">Question {answer.position} grade</legend>
        <label>
          Grade
          <select name="grade" required value={grade} onChange={(event) => setGrade(event.target.value)}>
            <option value="">Choose a grade</option>
            <option value="correct">Correct</option>
            <option value="incorrect">Incorrect</option>
          </select>
        </label>
        <label>Feedback <span className="muted">(optional)</span><textarea name="feedback" maxLength={4000} rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
        {state.error && <p className="notice error" role="alert">{state.error}</p>}
        {state.success && <p className="notice" role="status">{state.success}</p>}
        <div><button className="button secondary" disabled={pending || !grade}>{pending ? 'Saving…' : 'Save grade'}</button></div>
      </fieldset>
    </form>
  );
}
