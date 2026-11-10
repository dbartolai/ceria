'use client';

import { useActionState, useState } from 'react';
import { PromptPanel } from '@/lib/ai/prompt-panel';
import { importQuiz, quizPrompt } from '@/lib/quizzes/content';
import { questionKinds, questionLabels, type Question, type QuestionKind, type QuizDraft } from '@/lib/quizzes/types';
import { saveQuiz } from './actions';

export type ReusableQuiz = { id: string; title: string; questions: Question[] };
type EditorQuestion = Question & { editorId: string; toleranceInput: string };

function toEditor(question: Question, editorId: string): EditorQuestion {
  return { ...question, editorId, toleranceInput: String(question.tolerance) };
}

function blankQuestion(): EditorQuestion {
  return toEditor({ kind: 'multiple-choice', prompt: '', topic: '', choices: ['', ''], answer: '', explanation: '', tolerance: 0 }, crypto.randomUUID());
}

export function QuizEditor({ id, sessionId, initial, context, library }: {
  id: string | null;
  sessionId: string | null;
  initial: QuizDraft;
  context: string;
  library: ReusableQuiz[];
}) {
  const [state, action, pending] = useActionState(saveQuiz.bind(null, id, sessionId), {});
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [questions, setQuestions] = useState(() => initial.questions.map((question, index) => toEditor(question, String(index))));
  const [academicContext, setAcademicContext] = useState(context);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<{ error?: string; success?: string }>({});
  const [reuse, setReuse] = useState('');

  function updateQuestion(editorId: string, update: Partial<EditorQuestion>) {
    setQuestions((items) => items.map((question) => question.editorId === editorId ? { ...question, ...update } : question));
  }

  function applyImport() {
    try {
      const imported = importQuiz(importText);
      setTitle(imported.title);
      setDescription(imported.description);
      setQuestions(imported.questions.map((question) => toEditor(question, crypto.randomUUID())));
      setImportStatus({ success: 'Draft loaded. Review each answer and explanation before saving.' });
    } catch (error) {
      setImportStatus({ error: error instanceof Error ? error.message : 'The draft could not be imported.' });
    }
  }

  function addReusedQuestion() {
    const [quizId, index] = reuse.split(':');
    const selected = library.find((quiz) => quiz.id === quizId)?.questions[Number(index)];
    if (selected) setQuestions((items) => [...items, toEditor(selected, crypto.randomUUID())]);
    setReuse('');
  }

  function changeKind(question: EditorQuestion, kind: QuestionKind) {
    updateQuestion(question.editorId, { kind, choices: kind === 'multiple-choice' ? ['', ''] : [], answer: '', toleranceInput: '0' });
  }

  const draft = {
    title,
    description,
    questions: questions.map((question) => ({
      kind: question.kind,
      prompt: question.prompt,
      topic: question.topic,
      choices: question.choices,
      answer: question.answer,
      explanation: question.explanation,
      tolerance: Number(question.toleranceInput),
    })),
  };

  return (
    <div className="stack">
      <details className="panel">
        <summary>Generate a prompt or import a quiz</summary>
        <div className="stack mt-4">
          <label>
            Academic context
            <textarea rows={4} value={academicContext} onChange={(event) => setAcademicContext(event.target.value)} placeholder="Topics, exam format, and preferred question types" />
          </label>
          <p className="muted">Review this context for identifying details before copying it into ChatGPT.</p>
          <PromptPanel prompt={quizPrompt(academicContext)} />
          <label>
            Paste quiz JSON
            <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={5} />
          </label>
          <p className="muted">Loading a draft replaces the fields in this editor. Save any edits you want to keep first.</p>
          <div><button type="button" className="button secondary" onClick={applyImport} disabled={!importText.trim()}>Load draft</button></div>
          {importStatus.error && <p className="notice error" role="alert">{importStatus.error}</p>}
          {importStatus.success && <p className="notice" role="status">{importStatus.success}</p>}
        </div>
      </details>
      <form className="stack" action={action}>
        <input name="draft" type="hidden" value={JSON.stringify(draft)} />
        <section className="panel stack">
          <label>Quiz title<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Instructions <span className="muted">(optional)</span><textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        </section>
        {questions.map((question, index) => (
          <fieldset className="panel stack" key={question.editorId}>
            <legend className="eyebrow">Question {index + 1}</legend>
            <div className="form-grid">
              <label>
                Question type
                <select value={question.kind} onChange={(event) => changeKind(question, event.target.value as QuestionKind)}>
                  {questionKinds.map((kind) => <option key={kind} value={kind}>{questionLabels[kind]}</option>)}
                </select>
              </label>
              <label>Topic<input maxLength={100} value={question.topic} onChange={(event) => updateQuestion(question.editorId, { topic: event.target.value })} /></label>
            </div>
            <label>Question prompt<textarea required rows={3} maxLength={3000} value={question.prompt} onChange={(event) => updateQuestion(question.editorId, { prompt: event.target.value })} /></label>
            {question.kind === 'multiple-choice' ? (
              <>
                {question.choices.map((choice, optionIndex) => (
                  <div className="row" key={optionIndex}>
                    <label className="flex-1">
                      Choice {String.fromCharCode(65 + optionIndex)}
                      <input required maxLength={500} value={choice} onChange={(event) => {
                        const value = event.target.value;
                        const choices = question.choices.map((item, position) => position === optionIndex ? value : item);
                        updateQuestion(question.editorId, { choices, answer: choice === question.answer ? value : question.answer });
                      }} />
                    </label>
                    {question.choices.length > 2 && (
                      <button className="button secondary" type="button" aria-label={`Remove choice ${String.fromCharCode(65 + optionIndex)}`} onClick={() => {
                        const choices = question.choices.filter((_, position) => position !== optionIndex);
                        updateQuestion(question.editorId, { choices, answer: choice === question.answer ? '' : question.answer });
                      }}>Remove</button>
                    )}
                  </div>
                ))}
                {question.choices.length < 8 && <div><button type="button" className="button secondary" onClick={() => updateQuestion(question.editorId, { choices: [...question.choices, ''] })}>Add choice</button></div>}
                <label>
                  Correct choice
                  <select required value={question.answer} onChange={(event) => updateQuestion(question.editorId, { answer: event.target.value })}>
                    <option value="">Choose the correct answer</option>
                    {question.choices.map((choice, position) => choice.trim() && <option key={position} value={choice}>{String.fromCharCode(65 + position)} · {choice}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <label>Correct answer<input required maxLength={question.kind === 'numeric' ? 50 : 1000} value={question.answer} onChange={(event) => updateQuestion(question.editorId, { answer: event.target.value })} /></label>
            )}
            {question.kind === 'numeric' && (
              <label>
                Accepted margin of error
                <input type="number" min="0" step="any" value={question.toleranceInput} onChange={(event) => updateQuestion(question.editorId, { toleranceInput: event.target.value })} />
              </label>
            )}
            <label>Explanation<textarea required rows={3} maxLength={4000} value={question.explanation} onChange={(event) => updateQuestion(question.editorId, { explanation: event.target.value })} /></label>
            <div><button type="button" className="button secondary" onClick={() => setQuestions((items) => items.filter((item) => item.editorId !== question.editorId))}>Remove question {index + 1}</button></div>
          </fieldset>
        ))}
        <div className="row">
          <button type="button" className="button secondary" disabled={questions.length >= 60} onClick={() => setQuestions((items) => [...items, blankQuestion()])}>Add question</button>
        </div>
        {library.length > 0 && (
          <div className="row">
            <label className="flex-1">
              Reuse a saved question
              <select value={reuse} onChange={(event) => setReuse(event.target.value)}>
                <option value="">Choose a question</option>
                {library.map((quiz) => (
                  <optgroup key={quiz.id} label={quiz.title}>
                    {quiz.questions.map((question, index) => <option key={index} value={`${quiz.id}:${index}`}>{question.prompt.slice(0, 120)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" className="button secondary" disabled={!reuse || questions.length >= 60} onClick={addReusedQuestion}>Add saved question</button>
          </div>
        )}
        {state.error && <p className="notice error" role="alert">{state.error}</p>}
        {state.success && <p className="notice" role="status">{state.success}</p>}
        <div><button className="button" disabled={pending}>{pending ? 'Saving…' : 'Save draft'}</button></div>
      </form>
    </div>
  );
}
