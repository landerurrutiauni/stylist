import { describe, expect, it } from 'vitest';
import { CATALOG, STYLE_IDS } from '../../shared/catalog/styles.ts';
import { detectFormat, IMAGE_LIMITS, sniffImage } from '../../shared/imageSniff.ts';
import { analysisOutputSchema, auditAnalysis } from '../../shared/schema/analysis.ts';
import { answersSchema, cleanText, emptyDraft, TEXT_LIMITS } from '../../shared/schema/answers.ts';
import { streamEventSchema } from '../../shared/schema/events.ts';
import { band, compatibility, type Factors } from '../../shared/scoring.ts';
import { styleCodeLabel } from '../../shared/labels.ts';
import { outputFormat } from '../../server/core/outputSchema.ts';
import { liveEnvelope, liveOutput, unusableOutput } from '../fixtures/analysis.ts';
import { ANSWERS, fakeJpeg, fakePng, fakeWebpVp8x } from './helpers.ts';

describe('image sniffing', () => {
  it('reads format and size from the bytes', () => {
    expect(sniffImage(fakeJpeg(1200, 1500))).toEqual({ format: 'jpeg', mime: 'image/jpeg', width: 1200, height: 1500 });
    expect(sniffImage(fakePng(640, 480))).toEqual({ format: 'png', mime: 'image/png', width: 640, height: 480 });
    expect(sniffImage(fakeWebpVp8x(1000, 800))).toEqual({ format: 'webp', mime: 'image/webp', width: 1000, height: 800 });
  });

  it('ignores the declared type and rejects other formats', () => {
    const gif = new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00');
    expect(detectFormat(gif)).toBeNull();
    const heic = Uint8Array.from([0, 0, 0, 0x18, ...new TextEncoder().encode('ftypheic'), 0, 0, 0, 0]);
    expect(detectFormat(heic)).toBeNull();
    expect(sniffImage(new Uint8Array(4))).toBeNull();
  });

  it('rejects a JPEG header without a frame', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it('keeps upload limits consistent', () => {
    expect(IMAGE_LIMITS.maxUploadBytes).toBeLessThan(IMAGE_LIMITS.maxInputBytes);
    expect(IMAGE_LIMITS.maxLongSide).toBeGreaterThan(IMAGE_LIMITS.minShortSide);
  });
});

describe('questionnaire answers', () => {
  it('accepts a complete set and fills optional defaults', () => {
    const parsed = answersSchema.parse({
      expression: 'androgynous',
      texture: 'curly',
      density: 'fine',
      currentLength: 'short',
      maintenance: 'under5',
    });
    expect(parsed).toMatchObject({ aesthetics: [], tools: [], routine: null, goals: [], freeNote: '' });
  });

  it('requires the five required answers', () => {
    expect(answersSchema.safeParse(emptyDraft()).success).toBe(false);
    for (const key of ['expression', 'texture', 'density', 'currentLength', 'maintenance'] as const) {
      expect(answersSchema.safeParse({ ...ANSWERS, [key]: null }).success).toBe(false);
    }
  });

  it('has no gender field: styles to explore are a free choice', () => {
    expect(Object.keys(answersSchema.shape)).not.toContain('gender');
    expect(answersSchema.safeParse({ ...ANSWERS, expression: 'mixed' }).success).toBe(true);
  });

  it('rejects repeated values, "none" with tools and overlong notes', () => {
    expect(answersSchema.safeParse({ ...ANSWERS, aesthetics: ['natural', 'natural'] }).success).toBe(false);
    expect(answersSchema.safeParse({ ...ANSWERS, tools: ['none', 'blowdryer'] }).success).toBe(false);
    expect(answersSchema.safeParse({ ...ANSWERS, freeNote: 'a'.repeat(TEXT_LIMITS.freeNote + 1) }).success).toBe(false);
  });

  it('cleans control characters from free text', () => {
    expect(cleanText('hola\u0000\u0007 mundo\n')).toBe('hola mundo');
  });
});

describe('compatibility', () => {
  const factors = (features: number, hair: number, preferences: number, routine: number, goals: number): Factors => ({
    features: { rating: features as 0, reason: '' },
    hair: { rating: hair as 0, reason: '' },
    preferences: { rating: preferences as 0, reason: '' },
    routine: { rating: routine as 0, reason: '' },
    goals: { rating: goals as 0, reason: '' },
  });

  it('weights the five factors and rounds to steps of five', () => {
    expect(compatibility(factors(4, 4, 4, 4, 4))).toBe(100);
    expect(compatibility(factors(0, 0, 0, 0, 0))).toBe(0);
    expect(compatibility(factors(2, 2, 2, 2, 2))).toBe(50);
    // 0.3*75 + 0.25*100 + 0.2*50 + 0.15*75 + 0.1*25 = 71.25 → 70
    expect(compatibility(factors(3, 4, 2, 3, 1))).toBe(70);
    for (let i = 0; i < 50; i++) expect(compatibility(factors(i % 5, (i * 3) % 5, (i * 7) % 5, i % 3, i % 2)) % 5).toBe(0);
  });

  it('shares out the weight of factors that were not evaluated', () => {
    expect(compatibility(factors(0, 4, 4, 4, 4), ['features'])).toBe(100);
    expect(compatibility(factors(4, 0, 0, 0, 0), ['features'])).toBe(0);
  });

  it('names bands without calling anything a beauty score', () => {
    expect(band(80)).toBe('high');
    expect(band(60)).toBe('medium');
    expect(band(40)).toBe('exploratory');
  });
});

describe('analysis output', () => {
  it('accepts the reference output and passes the audit', () => {
    expect(analysisOutputSchema.parse(liveOutput())).toBeTruthy();
    expect(auditAnalysis(liveOutput())).toEqual([]);
    expect(auditAnalysis(unusableOutput())).toEqual([]);
  });

  it('flags duplicates, thin rationales and inconsistent photo checks', () => {
    const output = liveOutput();
    const first = output.recommendations[0]!;
    expect(auditAnalysis({ ...output, recommendations: [first, first] })).toContain(`duplicate style ${first.styleId}`);
    expect(auditAnalysis({ ...output, recommendations: [{ ...first, rationale: 'Te queda bien.' }] })).toContain(
      `rationale too short for ${first.styleId}`,
    );
    expect(auditAnalysis({ ...unusableOutput(), recommendations: [first] })).toContain('recommendations for unusable photos');
    expect(auditAnalysis({ ...output, recommendations: [] })).toContain('no recommendations for usable photos');
  });

  it('rejects styles outside the catalogue and ratings outside 0–4', () => {
    const output = liveOutput();
    const bad = { ...output, recommendations: [{ ...output.recommendations[0]!, styleId: 'made-up' }] };
    expect(analysisOutputSchema.safeParse(bad).success).toBe(false);
    const rec = output.recommendations[0]!;
    const rating = { ...output, recommendations: [{ ...rec, factors: { ...rec.factors, hair: { rating: 7, reason: '' } } }] };
    expect(analysisOutputSchema.safeParse(rating).success).toBe(false);
  });

  it('validates stream events end to end', () => {
    expect(streamEventSchema.safeParse({ type: 'result', analysis: liveEnvelope() }).success).toBe(true);
    expect(streamEventSchema.safeParse({ type: 'stage', stage: 'thinking' }).success).toBe(false);
    expect(streamEventSchema.safeParse({ type: 'error', code: 'internal', message: 'x', retryable: true }).success).toBe(true);
  });
});

describe('JSON schema sent to the model', () => {
  const format = outputFormat(analysisOutputSchema);
  const text = JSON.stringify(format.schema);

  it('keeps enums as enums and closes every object', () => {
    expect(format.type).toBe('json_schema');
    expect(text).toContain(JSON.stringify(STYLE_IDS));
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const value = node as Record<string, unknown>;
      if (value.type === 'object') {
        expect(value.additionalProperties).toBe(false);
        expect(Object.keys(value.properties as object).sort()).toEqual([...(value.required as string[])].sort());
      }
      Object.values(value).forEach(walk);
    };
    walk(format.schema);
  });

  it('leaves out keywords structured outputs do not support', () => {
    expect(text).not.toMatch(/"(minLength|maxLength|minimum|maximum|maxItems|pattern|format)":/);
  });
});

describe('catalogue', () => {
  it('has unique ids and options at every length for every style code', () => {
    expect(new Set(STYLE_IDS).size).toBe(CATALOG.length);
    for (const expression of ['masculine', 'feminine', 'androgynous'] as const) {
      for (const length of ['short', 'medium', 'long'] as const) {
        const styles = CATALOG.filter((style) => style.length === length && style.expressions.includes(expression));
        expect(styles.length, `${expression} ${length}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('keeps masculine and feminine long cuts apart', () => {
    const long = CATALOG.filter((style) => style.length === 'long');
    const masculine = long.filter((style) => style.expressions.includes('masculine'));
    const feminine = long.filter((style) => style.expressions.includes('feminine'));
    expect(masculine.length).toBeGreaterThanOrEqual(5);
    expect(feminine.length).toBeGreaterThanOrEqual(5);
    // Only the protective braids are coded for both; every other long cut is built for one code.
    expect(masculine.filter((style) => feminine.includes(style)).map((style) => style.id)).toEqual(['box-braids']);
    expect(masculine.map((style) => style.id)).toEqual(expect.arrayContaining(['man-bun', 'long-shoulder', 'long-swept-back']));
  });

  it('offers middle parts, side parts and fringes at every length', () => {
    for (const length of ['short', 'medium', 'long'] as const) {
      const styles = CATALOG.filter((style) => style.length === length);
      expect(
        styles.some((style) => style.figure.part === 'center'),
        `${length} middle part`,
      ).toBe(true);
      expect(
        styles.some((style) => style.figure.part === 'side'),
        `${length} side part`,
      ).toBe(true);
      expect(
        styles.some((style) => style.figure.fringe === 'blunt'),
        `${length} blunt fringe`,
      ).toBe(true);
      expect(
        styles.some((style) => style.figure.fringe === 'curtain'),
        `${length} curtain fringe`,
      ).toBe(true);
    }
  });

  it('names style codes in words', () => {
    expect(styleCodeLabel(['masculine', 'feminine', 'androgynous'])).toBe('unisex');
    expect(styleCodeLabel(['androgynous', 'masculine'])).toBe('masculino / andrógino');
    expect(styleCodeLabel(['feminine'])).toBe('femenino');
  });

  it('covers every texture at every length', () => {
    for (const texture of ['straight', 'wavy', 'curly', 'coily'] as const) {
      for (const length of ['short', 'medium', 'long'] as const) {
        expect(
          CATALOG.some((style) => style.length === length && style.textures.includes(texture)),
          `${texture} ${length}`,
        ).toBe(true);
      }
    }
  });
});
