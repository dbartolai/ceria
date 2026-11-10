import { manualContentProvider } from '@/lib/ai/manual';
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

export function importQuiz(input: string) {
  return manualContentProvider.parse(input, { parse: (value) => parseQuizDraft(value, true) });
}

export function quizPrompt(context: string) {
  return manualContentProvider.buildPrompt({
    task: 'Draft a tutoring practice quiz that checks understanding of the academic topics below.',
    context,
    guidance: [
      'Use question kinds "multiple-choice", "short-answer", and "numeric" as appropriate. Include a topic and an explanation of the reasoning for every question.',
      'For multiple choice, supply two to eight distinct choices and copy the exact correct choice to answer. For other types, leave choices empty.',
      'Use a string for every answer. Numeric answers should be decimals or scientific notation. Supply a nonnegative numeric tolerance only where rounding is appropriate. Use $...$ for inline mathematics and $$...$$ for display mathematics in prompts and explanations.',
    ],
    format: {
      title: 'Linear equations',
      description: 'Solve for the unknown.',
      questions: [{
        kind: 'multiple-choice', topic: 'Solving equations', prompt: 'What is $x$ if $2x = 6$?',
        choices: ['$2$', '$3$', '$4$'], answer: '$3$', explanation: 'Divide both sides by $2$.', tolerance: 0,
      }],
    },
  });
}
