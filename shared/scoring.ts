import type { FactorKey, Recommendation } from './schema/analysis.ts';

/**
 * Estimated compatibility is computed here, never typed by the model: the
 * model rates five factors from 0 to 4 with a reason each, and this formula
 * turns them into a 0–100 figure. The figure is rounded to steps of 5 because
 * the ratings behind it are coarse; showing 83 would claim a precision the
 * method does not have.
 */

export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  features: 0.3,
  hair: 0.25,
  preferences: 0.2,
  routine: 0.15,
  goals: 0.1,
};

export const FACTOR_LABELS: Record<FactorKey, string> = {
  features: 'Rasgos observables',
  hair: 'Tipo de cabello',
  preferences: 'Tus preferencias',
  routine: 'Rutina y mantenimiento',
  goals: 'Objetivos y restricciones',
};

export type Factors = Record<FactorKey, { rating: 0 | 1 | 2 | 3 | 4; reason: string }>;

/**
 * @param skip factors that were not evaluated (the demo has no facial
 *   analysis); their weight is shared out among the others.
 */
export function compatibility(factors: Factors, skip: FactorKey[] = []): number {
  let total = 0;
  let weight = 0;
  for (const key of Object.keys(FACTOR_WEIGHTS) as FactorKey[]) {
    if (skip.includes(key)) continue;
    total += FACTOR_WEIGHTS[key] * factors[key].rating * 25;
    weight += FACTOR_WEIGHTS[key];
  }
  if (weight === 0) return 0;
  return Math.round(total / weight / 5) * 5;
}

export type Band = 'high' | 'medium' | 'exploratory';

export function band(score: number): Band {
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'exploratory';
}

export const BAND_LABELS: Record<Band, string> = {
  high: 'Compatibilidad alta',
  medium: 'Compatibilidad media',
  exploratory: 'Opción exploratoria',
};

export function scoreRecommendation(rec: Recommendation, skip: FactorKey[] = []) {
  const score = compatibility(rec.factors, skip);
  return { score, band: band(score) };
}
