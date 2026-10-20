import { z } from 'zod';

/**
 * Questionnaire answers. Shared by the browser (form state, review screen)
 * and the server (request validation, prompt building), so both sides agree
 * on every allowed value.
 */

export const EXPRESSIONS = ['masculine', 'feminine', 'androgynous', 'mixed', 'all'] as const;
export const TEXTURES = ['straight', 'wavy', 'curly', 'coily', 'unsure'] as const;
export const DENSITIES = ['fine', 'medium', 'thick', 'unsure'] as const;
export const CONSIDERATIONS = ['receding_hairline', 'thinner_crown', 'cowlicks', 'frizz', 'sensitive_scalp'] as const;
export const CURRENT_LENGTHS = ['very_short', 'short', 'medium', 'long'] as const;
export const MAINTENANCE = ['under5', '5to10', '10to20', 'over20'] as const;
export const AESTHETICS = [
  'classic',
  'minimal',
  'elegant',
  'modern',
  'natural',
  'urban',
  'alternative',
  'romantic',
  'bold',
  'professional',
  'trend',
] as const;
export const TOOLS = ['blowdryer', 'flat_iron', 'curling_iron', 'hold_products', 'curl_cream', 'texturizer', 'none'] as const;
export const ROUTINES = ['learn', 'simple'] as const;
export const GOALS = [
  'highlight_features',
  'more_volume',
  'less_volume',
  'explore_fringe',
  'professional_image',
  'soften_areas',
  'gentle_change',
  'low_maintenance',
] as const;

export type Expression = (typeof EXPRESSIONS)[number];
export type Texture = (typeof TEXTURES)[number];
export type Density = (typeof DENSITIES)[number];
export type Consideration = (typeof CONSIDERATIONS)[number];
export type CurrentLength = (typeof CURRENT_LENGTHS)[number];
export type Maintenance = (typeof MAINTENANCE)[number];
export type Aesthetic = (typeof AESTHETICS)[number];
export type Tool = (typeof TOOLS)[number];
export type Routine = (typeof ROUTINES)[number];
export type Goal = (typeof GOALS)[number];

/** Free text limits, in characters. The UI shows the same numbers. */
export const TEXT_LIMITS = {
  considerationsNote: 300,
  imageNote: 400,
  avoidNote: 600,
  freeNote: 800,
} as const;

/** Removes control characters and collapses runs of whitespace. */
export function cleanText(value: string): string {
  return (
    value
      // Control characters are exactly what this strips.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

const note = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform(cleanText)
    .pipe(z.string().max(max));

const uniqueList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .refine((list) => new Set(list).size === list.length, 'Valores repetidos');

export const answersSchema = z.object({
  expression: z.enum(EXPRESSIONS),
  texture: z.enum(TEXTURES),
  density: z.enum(DENSITIES),
  considerations: uniqueList(CONSIDERATIONS).default([]),
  considerationsNote: note(TEXT_LIMITS.considerationsNote).default(''),
  currentLength: z.enum(CURRENT_LENGTHS),
  maintenance: z.enum(MAINTENANCE),
  aesthetics: uniqueList(AESTHETICS).default([]),
  imageNote: note(TEXT_LIMITS.imageNote).default(''),
  tools: uniqueList(TOOLS)
    .default([])
    .refine((list) => !(list.includes('none') && list.length > 1), 'Ninguna herramienta excluye el resto'),
  routine: z.enum(ROUTINES).nullable().default(null),
  goals: uniqueList(GOALS).default([]),
  avoidNote: note(TEXT_LIMITS.avoidNote).default(''),
  freeNote: note(TEXT_LIMITS.freeNote).default(''),
});

export type Answers = z.output<typeof answersSchema>;

/** Answers while the questionnaire is being filled: required fields may still be empty. */
export type DraftAnswers = Omit<Answers, 'expression' | 'texture' | 'density' | 'currentLength' | 'maintenance'> & {
  expression: Expression | null;
  texture: Texture | null;
  density: Density | null;
  currentLength: CurrentLength | null;
  maintenance: Maintenance | null;
};

// emptyDraft lives in draft.ts so the landing page can start a session without loading zod.
export { emptyDraft } from './draft.ts';

/** Refinement text sent with a regeneration request ("menos mantenimiento, más flequillos"). */
export const REFINEMENT_LIMIT = 400;
export const refinementSchema = note(REFINEMENT_LIMIT).default('');
