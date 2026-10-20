import type { DraftAnswers } from './answers.ts';

/** A questionnaire with nothing answered yet. Kept free of zod so the main bundle stays small. */
export const emptyDraft = (): DraftAnswers => ({
  expression: null,
  texture: null,
  density: null,
  considerations: [],
  considerationsNote: '',
  currentLength: null,
  maintenance: null,
  aesthetics: [],
  imageNote: '',
  tools: [],
  routine: null,
  goals: [],
  avoidNote: '',
  freeNote: '',
});
