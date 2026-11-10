import { formatDate } from '@/lib/format';
import type { SubmissionSummary } from './types';

export function dueDate(value: string) {
  return formatDate(value.slice(0, 10));
}

export function scoreLabel(submission: SubmissionSummary) {
  const graded = submission.total - submission.pending_count;
  if (!submission.pending_count) return `${submission.score} of ${graded} correct`;
  const pending = `${submission.pending_count} awaiting review`;
  return graded ? `${submission.score} of ${graded} graded correct · ${pending}` : pending;
}
