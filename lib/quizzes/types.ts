export const questionKinds = ['multiple-choice', 'short-answer', 'numeric'] as const;
export type QuestionKind = typeof questionKinds[number];

export const questionLabels: Record<QuestionKind, string> = {
  'multiple-choice': 'Multiple choice',
  'short-answer': 'Short answer',
  numeric: 'Numeric',
};

export type Question = {
  kind: QuestionKind;
  prompt: string;
  topic: string;
  choices: string[];
  answer: string;
  explanation: string;
  tolerance: number;
};

export type QuizDraft = {
  title: string;
  description: string;
  questions: Question[];
};

export type Quiz = QuizDraft & { id: string; updated_at: string };

export type SubmissionSummary = {
  id: string;
  submitted_at: string;
  score: number;
  total: number;
  pending_count: number;
};

export type AssignmentSummary = {
  id: string;
  title: string;
  engagement_id: string;
  due_at: string | null;
  published_at: string;
  submissions: SubmissionSummary[];
};

export type AssignmentQuestion = Pick<Question, 'kind' | 'prompt' | 'topic' | 'choices'> & {
  position: number;
};

export type SubmissionAnswer = {
  position: number;
  response: string;
  outcome: 'correct' | 'incorrect' | 'pending';
  correct_answer: string;
  explanation: string;
  feedback: string;
};
