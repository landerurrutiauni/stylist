import { getStyle, type CatalogStyle } from '../../shared/catalog/styles.ts';
import type { AnalysisEnvelope, FactorKey, Recommendation } from '../../shared/schema/analysis.ts';
import type { Aesthetic } from '../../shared/schema/answers.ts';
import { aestheticLabels, difficultyShort, type Difficulty, type LengthCategory } from '../../shared/labels.ts';
import { band, compatibility, FACTOR_LABELS, type Band } from '../../shared/scoring.ts';

export interface Item {
  rec: Recommendation;
  style: CatalogStyle;
  length: LengthCategory;
  score: number;
  band: Band;
}

/** Factors not evaluated in this analysis (the demo has no facial analysis). */
export const skippedFactors = (analysis: AnalysisEnvelope): FactorKey[] => (analysis.mode === 'demo' ? ['features'] : []);

export function itemsOf(analysis: AnalysisEnvelope): Item[] {
  const skip = skippedFactors(analysis);
  return analysis.output.recommendations.flatMap((rec) => {
    const style = getStyle(rec.styleId);
    if (!style) return [];
    const score = compatibility(rec.factors, skip);
    return [{ rec, style, length: style.length, score, band: band(score) }];
  });
}

export type MaintenanceFilter = 'any' | '5' | '10' | '20';
export type DifficultyFilter = 'any' | Difficulty;

export interface Filters {
  length: LengthCategory;
  maintenance: MaintenanceFilter;
  aesthetic: Aesthetic | 'any';
  difficulty: DifficultyFilter;
  favorites: boolean;
}

export function applyFilters(items: Item[], filters: Filters, favorites: string[]): Item[] {
  return items
    .filter((item) => item.length === filters.length)
    .filter((item) => filters.maintenance === 'any' || item.rec.dailyMinutes <= Number(filters.maintenance))
    .filter((item) => filters.aesthetic === 'any' || item.rec.aesthetics.includes(filters.aesthetic))
    .filter((item) => filters.difficulty === 'any' || item.rec.difficulty === filters.difficulty)
    .filter((item) => !filters.favorites || favorites.includes(item.rec.styleId))
    .sort((a, b) => b.score - a.score);
}

export function countByLength(items: Item[]): Record<LengthCategory, number> {
  return {
    short: items.filter((item) => item.length === 'short').length,
    medium: items.filter((item) => item.length === 'medium').length,
    long: items.filter((item) => item.length === 'long').length,
  };
}

export function aestheticsIn(items: Item[]): Aesthetic[] {
  const set = new Set<Aesthetic>();
  for (const item of items) item.rec.aesthetics.forEach((aesthetic) => set.add(aesthetic));
  return [...set].sort((a, b) => aestheticLabels[a].localeCompare(aestheticLabels[b], 'es'));
}

const cadence = (style: CatalogStyle) =>
  style.cadence[0] === style.cadence[1] ? `${style.cadence[0]} semanas` : `${style.cadence[0]}–${style.cadence[1]} semanas`;

export const cadenceText = cadence;

/** Plain-language differences between two recommendations, built from their data. */
export function differences(a: Item, b: Item, skip: FactorKey[]): string[] {
  const out: string[] = [];
  const nameA = a.rec.variantName;
  const nameB = b.rec.variantName;
  if (a.score !== b.score) {
    const [hi, lo] = a.score > b.score ? [a, b] : [b, a];
    out.push(`${hi.rec.variantName} tiene una compatibilidad estimada mayor (${hi.score} frente a ${lo.score}).`);
  }
  for (const key of Object.keys(FACTOR_LABELS) as FactorKey[]) {
    if (skip.includes(key)) continue;
    const diff = a.rec.factors[key].rating - b.rec.factors[key].rating;
    if (Math.abs(diff) >= 2) {
      const better = diff > 0 ? a : b;
      out.push(`En «${FACTOR_LABELS[key].toLowerCase()}» encaja mejor ${better.rec.variantName}: ${better.rec.factors[key].reason}`);
    }
  }
  const minutes = a.rec.dailyMinutes - b.rec.dailyMinutes;
  if (minutes !== 0) {
    out.push(`${minutes > 0 ? nameA : nameB} pide unos ${Math.abs(minutes)} minutos más al día.`);
  }
  if (a.rec.difficulty !== b.rec.difficulty) {
    out.push(
      `Dificultad de peinado: ${difficultyShort[a.rec.difficulty].toLowerCase()} en ${nameA}, ${difficultyShort[b.rec.difficulty].toLowerCase()} en ${nameB}.`,
    );
  }
  if (a.style.cadence[1] !== b.style.cadence[1]) {
    out.push(`Mantener la forma: cada ${cadence(a.style)} con ${nameA}; cada ${cadence(b.style)} con ${nameB}.`);
  }
  if (a.length !== b.length) {
    out.push('Son longitudes distintas: pasar de una a otra cambia el tiempo de crecimiento o lo que hay que cortar.');
  }
  const onlyA = a.rec.products.filter((product) => !b.rec.products.includes(product));
  const onlyB = b.rec.products.filter((product) => !a.rec.products.includes(product));
  if (onlyA.length) out.push(`Solo ${nameA} necesita: ${onlyA.join(', ').toLowerCase()}.`);
  if (onlyB.length) out.push(`Solo ${nameB} necesita: ${onlyB.join(', ').toLowerCase()}.`);
  return out;
}
