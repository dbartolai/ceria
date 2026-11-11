'use client';

import { useActionState, useState } from 'react';
import { publishQuiz } from './actions';

export type AssignmentEngagement = { id: string; title: string; students: { id: string; name: string }[] };

export function PublishForm({ quizId, requestId, engagements, initialEngagement }: {
  quizId: string;
  requestId: string;
  engagements: AssignmentEngagement[];
  initialEngagement: string | null;
}) {
  const [state, action, pending] = useActionState(publishQuiz.bind(null, quizId, requestId), {});
  const [engagementId, setEngagementId] = useState(engagements.find((item) => item.id === initialEngagement)?.id ?? '');
  const engagement = engagements.find((item) => item.id === engagementId);
  return (
    <form className="stack" action={action}>
      <div className="form-grid">
        <label>
          Engagement
          <select name="engagement" required value={engagementId} onChange={(event) => setEngagementId(event.target.value)}>
            <option value="">Choose an engagement</option>
            {engagements.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.students.map(student => student.name).join(", ")}</option>)}
          </select>
        </label>
        <label>
          Recipient
          <select name="recipient" required disabled={!engagement} key={engagementId} defaultValue="all">
            <option value="all">All enrolled students{engagement && ` (${engagement.students.length})`}</option>
            {engagement?.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>
        </label>
        <label>Due date <span className="muted">(optional)</span><input type="date" name="due" /></label>
      </div>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.success && <p className="notice" role="status">{state.success}</p>}
      <div><button className="button" disabled={!engagement || pending}>{pending ? 'Publishing…' : 'Publish assignment'}</button></div>
    </form>
  );
}
