import type { ReactNode } from 'react';
import { MathText } from '@/components/math';
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
      <h3><MathText text={question.prompt} /></h3>
      <div className="stack">
        <div><strong>Submitted answer</strong><p className="whitespace-pre-wrap"><MathText text={answer.response} /></p></div>
        <div><strong>{question.kind === 'short-answer' ? 'Sample answer' : 'Correct answer'}</strong><p><MathText text={answer.correct_answer} /></p></div>
        <div><strong>Explanation</strong><p className="whitespace-pre-wrap"><MathText text={answer.explanation} /></p></div>
        {answer.feedback && <div><strong>Tutor feedback</strong><p className="whitespace-pre-wrap"><MathText text={answer.feedback} /></p></div>}
      </div>
      {children}
    </article>
  );
}
