import type { ReactNode } from 'react';
import { Markdown } from '@/components/markdown';
import type { AssignmentQuestion, SubmissionAnswer } from './types';

const outcomes = {
  correct: { label: 'Correct', className: 'status' },
  incorrect: { label: 'Missed', className: 'status warm' },
  pending: { label: 'Awaiting review', className: 'status neutral' },
};

export function AnswerReview({ question, answer, children }: { question: AssignmentQuestion; answer: SubmissionAnswer; children?: ReactNode }) {
  return (
    <article className="panel stack">
      <div className="row justify-between">
        <p className="eyebrow">Question {answer.position}{question.topic && ` · ${question.topic}`}</p>
        <span className={outcomes[answer.outcome].className}>{outcomes[answer.outcome].label}</span>
      </div>
      <div role="heading" aria-level={3} className="quiz-prompt"><Markdown text={question.prompt} /></div>
      <div className="stack">
        <div><strong>Submitted answer</strong><Markdown text={answer.response} /></div>
        <div><strong>{question.kind === 'short-answer' ? 'Sample answer' : 'Correct answer'}</strong><Markdown text={answer.correct_answer} /></div>
        <div><strong>Explanation</strong><Markdown text={answer.explanation} /></div>
        {answer.feedback && <div><strong>Tutor feedback</strong><Markdown text={answer.feedback} /></div>}
      </div>
      {children}
    </article>
  );
}
