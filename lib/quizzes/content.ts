import { questionKinds, type Question, type QuizDraft } from './types';

const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,2})?$/i;

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label} must be an object.`);
  return input as Record<string, unknown>;
}

function text(input: unknown, label: string, max: number, required = false) {
  if (input === undefined) {
    if (required) throw new Error(`${label} is required.`);
    return '';
  }
  if (typeof input !== 'string') throw new Error(`${label} must be text.`);
  const value = input.trim();
  if (required && !value) throw new Error(`${label} is required.`);
  if (value.length > max) throw new Error(`${label} must use ${max.toLocaleString('en-US')} characters or fewer.`);
  return value;
}

function parseQuestion(input: unknown, index: number): Question {
  const label = `Question ${index + 1}`;
  const item = record(input, label);
  const kind = questionKinds.find((kind) => kind === item.kind);
  if (!kind) throw new Error(`${label} needs a supported question type.`);
  const prompt = text(item.prompt, `${label} prompt`, 3000, true);
  const topic = text(item.topic, `${label} topic`, 100);
  const answer = text(item.answer, `${label} correct answer`, 1000, true);
  const explanation = text(item.explanation, `${label} explanation`, 4000, true);
  const choices = item.choices ?? [];
  if (!Array.isArray(choices)) throw new Error(`${label} choices must be a list.`);
  if (kind === 'multiple-choice' && (choices.length < 2 || choices.length > 8)) {
    throw new Error(`${label} needs two to eight choices.`);
  }
  const options = choices.map((choice, position) => text(choice, `${label} choice ${position + 1}`, 500, true));
  if (kind === 'multiple-choice' && (new Set(options).size !== options.length || !options.includes(answer))) {
    throw new Error(`${label} needs distinct choices and a correct answer that matches one choice.`);
  }
  if (kind !== 'multiple-choice' && options.length) throw new Error(`${label} choices are only for multiple choice.`);
  if (kind === 'numeric' && (answer.length > 50 || !numericPattern.test(answer))) {
    throw new Error(`${label} needs a decimal or scientific notation answer.`);
  }
  const tolerance = item.tolerance ?? 0;
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error(`${label} tolerance must be a nonnegative number.`);
  }
  return { kind, prompt, topic, answer, explanation, choices: options, tolerance: kind === 'numeric' ? tolerance : 0 };
}

export function parseQuizDraft(input: unknown, requireQuestions = false): QuizDraft {
  const draft = record(input, 'The quiz');
  const title = text(draft.title, 'Quiz title', 160, true);
  const description = text(draft.description, 'Quiz instructions', 2000);
  if (!Array.isArray(draft.questions) || draft.questions.length > 60) {
    throw new Error('A quiz can contain up to 60 questions.');
  }
  if (requireQuestions && draft.questions.length === 0) throw new Error('Include at least one question.');
  return { title, description, questions: draft.questions.map(parseQuestion) };
}

export function parseQuizJson(input: string, requireQuestions = false) {
  const trimmed = input.trim();
  if (trimmed.length > 900_000) throw new Error('The import is too large. Split it into smaller drafts.');
  const json = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
  let draft: unknown;
  try {
    draft = JSON.parse(json);
  } catch {
    throw new Error('Paste valid quiz JSON and try again.');
  }
  return parseQuizDraft(draft, requireQuestions);
}

export function importQuiz(input: string) {
  return parseQuizJson(input, true);
}
