import { describe, expect, it } from 'vitest';
import { getStyle } from '../../shared/catalog/styles.ts';
import { analysisEnvelopeSchema, auditAnalysis } from '../../shared/schema/analysis.ts';
import type { Answers } from '../../shared/schema/answers.ts';
import { demoAnalysis, SAMPLE_ANSWERS } from '../../src/demo/engine.ts';
import { faceIssues, issuesFor, measure, THRESHOLDS } from '../../src/images/quality.ts';
import { applyFilters, countByLength, differences, itemsOf, skippedFactors, type Filters } from '../../src/lib/results.ts';
import { liveEnvelope } from '../fixtures/analysis.ts';
import { ANSWERS } from './helpers.ts';

describe('demo mode', () => {
  it('produces a valid, clearly labelled analysis that never claims to have seen the photos', () => {
    const analysis = demoAnalysis(SAMPLE_ANSWERS);
    expect(analysisEnvelopeSchema.safeParse(analysis).success).toBe(true);
    expect(auditAnalysis(analysis.output)).toEqual([]);
    expect(analysis.mode).toBe('demo');
    expect(analysis.model).toBeNull();
    expect(analysis.output.face.observations).toEqual([]);
    expect(analysis.output.face.shape.estimate).toBe('indeterminate');
    expect(analysis.output.limitations.join(' ')).toMatch(/no se han enviado ni analizado/);
    for (const rec of analysis.output.recommendations) expect(rec.factors.features.reason).toMatch(/no se ha|no evaluado|demostración/i);
  });

  it('leaves the facial factor out of the score', () => {
    expect(skippedFactors(demoAnalysis(SAMPLE_ANSWERS))).toEqual(['features']);
    expect(skippedFactors(liveEnvelope())).toEqual([]);
  });

  it.each(['masculine', 'feminine', 'androgynous'] as const)('only proposes %s cuts when those are asked for', (expression) => {
    const analysis = demoAnalysis({ ...SAMPLE_ANSWERS, expression });
    expect(analysis.output.recommendations.length).toBeGreaterThan(0);
    for (const rec of analysis.output.recommendations) expect(getStyle(rec.styleId)!.expressions).toContain(expression);
  });

  it('offers short, medium and long options and respects the declared texture', () => {
    const answers: Answers = { ...SAMPLE_ANSWERS, texture: 'coily' };
    const analysis = demoAnalysis(answers);
    const lengths = new Set(analysis.output.recommendations.map((rec) => getStyle(rec.styleId)!.length));
    expect(lengths).toEqual(new Set(['short', 'medium', 'long']));
    for (const rec of analysis.output.recommendations) expect(getStyle(rec.styleId)!.textures).toContain('coily');
  });

  it('varies parting and fringe within a length', () => {
    const analysis = demoAnalysis({ ...SAMPLE_ANSWERS, expression: 'all' });
    for (const length of ['short', 'medium', 'long'] as const) {
      const shapes = analysis.output.recommendations
        .map((rec) => getStyle(rec.styleId)!)
        .filter((style) => style.length === length)
        .map((style) => `${style.figure.part}/${style.figure.fringe}`);
      expect(new Set(shapes).size, length).toBe(shapes.length);
    }
  });

  it('changes with the answers', () => {
    const quick = demoAnalysis({ ...ANSWERS, maintenance: 'under5', aesthetics: ['minimal'] });
    const slow = demoAnalysis({ ...ANSWERS, maintenance: 'over20', aesthetics: ['romantic', 'elegant'] });
    expect(quick.output.recommendations.map((rec) => rec.styleId)).not.toEqual(slow.output.recommendations.map((rec) => rec.styleId));
  });
});

describe('results', () => {
  const items = itemsOf(liveEnvelope());
  const base: Filters = { length: 'short', maintenance: 'any', aesthetic: 'any', difficulty: 'any', favorites: false };

  it('groups by length', () => {
    expect(countByLength(items)).toEqual({ short: 2, medium: 2, long: 2 });
  });

  it('filters by time, aesthetic, difficulty and favourites, best score first', () => {
    expect(applyFilters(items, base, []).map((item) => item.rec.styleId)).toEqual(['textured-crop', 'side-part']);
    expect(applyFilters(items, { ...base, maintenance: '5' }, []).map((item) => item.rec.styleId)).toEqual(['textured-crop']);
    expect(applyFilters(items, { ...base, aesthetic: 'classic' }, []).map((item) => item.rec.styleId)).toEqual(['side-part']);
    expect(applyFilters(items, { ...base, length: 'long', difficulty: 'high' }, []).map((item) => item.rec.styleId)).toEqual(['long-layers']);
    expect(applyFilters(items, { ...base, favorites: true }, ['side-part']).map((item) => item.rec.styleId)).toEqual(['side-part']);
  });

  it('explains differences between two cuts from their data', () => {
    const [a, b] = items;
    const lines = differences(a!, b!, []);
    expect(lines.join(' ')).toContain('compatibilidad estimada mayor');
    expect(lines.join(' ')).toContain('minutos más al día');
  });
});

describe('photo quality checks', () => {
  const flat = (value: number, size = 32) => new Float32Array(size * size).fill(value);
  const checker = (size = 32) => Float32Array.from({ length: size * size }, (_, i) => (((i % size) + Math.floor(i / size)) % 2 ? 230 : 40));

  it('blocks very dark and washed-out photos', () => {
    expect(issuesFor(measure(flat(10), 32, 32)).find((issue) => issue.code === 'dark')?.severity).toBe('block');
    expect(issuesFor(measure(flat(250), 32, 32)).find((issue) => issue.code === 'bright')?.severity).toBe('block');
  });

  it('warns about blurred or flat photos and passes sharp ones', () => {
    const blurred = issuesFor(measure(flat(120), 32, 32));
    expect(blurred.map((issue) => issue.code)).toEqual(expect.arrayContaining(['blurry', 'flat']));
    expect(blurred.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(issuesFor(measure(checker(), 32, 32))).toEqual([]);
    expect(measure(checker(), 32, 32).sharpness).toBeGreaterThan(THRESHOLDS.warnBlurry);
  });

  it('reads face detector results', () => {
    const box = { x: 100, y: 100, width: 300, height: 400 };
    expect(faceIssues('frontal', [], 1000, 1200).map((issue) => issue.code)).toEqual(['no_face']);
    expect(faceIssues('profile', [], 1000, 1200)).toEqual([]);
    expect(faceIssues('frontal', [box, box], 1000, 1200).map((issue) => issue.code)).toEqual(['many_faces']);
    expect(faceIssues('frontal', [{ ...box, x: 0 }], 1000, 1200).map((issue) => issue.code)).toEqual(['cropped']);
    expect(faceIssues('frontal', [box], 1000, 1200)).toEqual([]);
  });
});
