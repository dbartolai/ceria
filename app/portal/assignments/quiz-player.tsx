'use client';

import { useActionState, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown';
import type { AssignmentQuestion } from '@/lib/quizzes/types';
import { submitQuiz } from './actions';
import styles from './quiz.module.css';

export function QuizPlayer({ assignmentId, questions }: { assignmentId: string; questions: AssignmentQuestion[] }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [state, action, pending] = useActionState(submitQuiz.bind(null, assignmentId), {});
  const heading = useRef<HTMLDivElement>(null);
  const question = questions[step];
  const isLast = step === questions.length - 1;
  const complete = answers.every((answer) => Boolean(answer.trim()));

  function updateAnswer(value: string) {
    setAnswers((items) => items.map((answer, index) => index === step ? value : answer));
  }

  function goTo(index: number) {
    setStep(index);
    requestAnimationFrame(() => heading.current?.focus());
  }

  return (
    <form action={action} className="stack" onKeyDown={(event) => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'text') event.preventDefault();
    }}>
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <div className="stack">
        <label htmlFor="quiz-progress" className="muted">Question {step + 1} of {questions.length}</label>
        <progress id="quiz-progress" className={styles.progress} max={questions.length} value={step + 1} />
      </div>
      <section className={`panel stack ${styles.question}`} aria-labelledby="question-prompt">
        {question.topic && <p className="eyebrow">{question.topic}</p>}
        <div ref={heading} id="question-prompt" role="heading" aria-level={2} className="quiz-prompt" tabIndex={-1}><Markdown text={question.prompt} /></div>
        {question.kind === 'multiple-choice' ? (
          <div role="radiogroup" aria-label="Choose your answer" className={styles.choices}>
            {question.choices.map((choice, index) => (
              <label className={styles.choice} key={choice}>
                <input type="radio" name="current-choice" value={choice} checked={answers[step] === choice} onChange={() => updateAnswer(choice)} />
                <span className={styles.choiceLetter}>{String.fromCharCode(65 + index)}.</span>
                <Markdown text={choice} />
              </label>
            ))}
          </div>
        ) : (
          <label>
            Your answer
            {question.kind === 'short-answer' ? (
              <textarea rows={4} value={answers[step]} maxLength={4000} onChange={(event) => updateAnswer(event.target.value)} />
            ) : (
              <input type="text" inputMode="decimal" value={answers[step]} maxLength={4000} onChange={(event) => updateAnswer(event.target.value)} aria-describedby="numeric-answer-hint" />
            )}
          </label>
        )}
        {question.kind === 'numeric' && <p id="numeric-answer-hint" className="muted">Enter a number. If you write an expression, your tutor will review it.</p>}
      </section>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      <div className="row justify-between">
        <button type="button" className="button secondary" disabled={step === 0 || pending} onClick={() => goTo(step - 1)}>Previous question</button>
        {isLast ? (
          <button className="button" disabled={!complete || pending}>{pending ? 'Submitting…' : 'Submit quiz'}</button>
        ) : (
          <button type="button" className="button" disabled={!answers[step]?.trim()} onClick={() => goTo(step + 1)}>Next question</button>
        )}
      </div>
    </form>
  );
}
