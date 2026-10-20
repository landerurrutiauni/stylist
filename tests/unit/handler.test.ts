import { describe, expect, it, vi } from 'vitest';
import { createHandler, type HandlerDeps } from '../../server/core/handler.ts';
import { ModelError, type ModelRunner } from '../../server/core/model.ts';
import type { PreviewRunner } from '../../server/core/preview.ts';
import { MemoryRateLimiter } from '../../server/core/rateLimit.ts';
import { analysisEnvelopeSchema } from '../../shared/schema/analysis.ts';
import { liveOutput, unusableOutput } from '../fixtures/analysis.ts';
import { analyzeForm, ANSWERS, events, fakeJpeg, fakePng, ORIGIN, post } from './helpers.ts';

const ENV = { ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173` };

/** A model that streams the given text in a few chunks, like the SDK does. */
function textRunner(text: string, stopReason: string | null = 'end_turn'): ModelRunner {
  return async (_input, hooks) => {
    hooks.onStart();
    const size = Math.ceil(text.length / 4);
    for (let i = 0; i < text.length; i += size) hooks.onText(text.slice(i, i + size), false);
    return { text, stopReason, model: 'claude-test-model' };
  };
}

function handler(deps: Partial<HandlerDeps> = {}) {
  return createHandler({ env: ENV, runner: textRunner(JSON.stringify(liveOutput())), newId: () => 'id-1', ...deps });
}

describe('health and CORS', () => {
  it('reports missing keys without exposing anything secret', async () => {
    const handle = createHandler({ env: ENV });
    const response = await handle(new Request('https://api.folia.test/health', { headers: { origin: ORIGIN } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, analysis: 'missing_api_key', model: null, preview: 'missing_api_key', previewModel: null });
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports the configured model when a key is present', async () => {
    const handle = createHandler({ env: { ...ENV, ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-x' } });
    const body = await (await handle(new Request('https://api.folia.test/health'))).json();
    expect(body).toMatchObject({ analysis: 'available', model: 'claude-x' });
    expect(JSON.stringify(body)).not.toContain('sk-test');
  });

  it('rejects origins outside the allowlist', async () => {
    const response = await handler()(new Request('https://api.folia.test/health', { headers: { origin: 'https://evil.example' } }));
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect((await response.json()).code).toBe('origin_not_allowed');
  });

  it('answers preflight requests for allowed origins only', async () => {
    const ok = await handler()(new Request('https://api.folia.test/analyze', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-methods')).toContain('POST');
    const bad = await handler()(new Request('https://api.folia.test/analyze', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(bad.status).toBe(403);
  });

  it('requires an Origin header on analysis requests by default', async () => {
    const response = await handler()(post('/analyze', analyzeForm(), {}));
    expect(response.status).toBe(403);
  });

  it('returns 404 for unknown paths and 405 for wrong methods', async () => {
    expect((await handler()(new Request('https://api.folia.test/nope', { headers: { origin: ORIGIN } }))).status).toBe(404);
    expect((await handler()(new Request('https://api.folia.test/analyze', { headers: { origin: ORIGIN } }))).status).toBe(405);
  });
});

describe('analysis requests', () => {
  it('streams stages, progress and a valid result', async () => {
    const log = vi.fn();
    const response = await handler({ log })(post('/analyze', analyzeForm()));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const list = await events(response);
    const stages = list.filter((event) => event.type === 'stage').map((event) => event.stage);
    expect(stages).toEqual(['received', 'observing', 'writing', 'validating']);
    const progress = list.filter((event) => event.type === 'progress').map((event) => event.recommendations as number);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(liveOutput().recommendations.length);
    const result = list.at(-1)!;
    expect(result.type).toBe('result');
    const envelope = analysisEnvelopeSchema.parse(result.analysis);
    expect(envelope).toMatchObject({ id: 'id-1', mode: 'live', model: 'claude-test-model' });
    // Logs carry no answers, text or image data.
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('rapados');
    expect(logged).not.toContain('base64');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'analysis_ok' }));
  });

  it('passes both photos and the described answers to the model', async () => {
    const runner = vi.fn(textRunner(JSON.stringify(liveOutput())));
    await events(await handler({ runner })(post('/analyze', analyzeForm({ refinement: 'Más flequillos' }))));
    const input = runner.mock.calls[0]![0];
    expect(input.frontal.mime).toBe('image/jpeg');
    expect(input.profile.base64.length).toBeGreaterThan(10);
    expect(input.answersText).toContain('Más flequillos');
    expect(input.answersText).toContain('Nada de rapados');
  });

  it('accepts unusable photos with no recommendations', async () => {
    const list = await events(await handler({ runner: textRunner(JSON.stringify(unusableOutput())) })(post('/analyze', analyzeForm())));
    expect(list.at(-1)!.type).toBe('result');
  });

  it('answers 503 missing_api_key when no key is configured', async () => {
    const response = await createHandler({ env: ENV })(post('/analyze', analyzeForm()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'missing_api_key', retryable: false });
  });

  it.each([
    ['missing consent', analyzeForm({ consent: null }), 400, 'consent_required'],
    ['missing frontal photo', analyzeForm({ frontal: null }), 422, 'invalid_image'],
    ['missing profile photo', analyzeForm({ profile: null }), 422, 'invalid_image'],
    ['not an image', analyzeForm({ frontal: new Blob(['GIF89a not really an image at all']) }), 415, 'unsupported_type'],
    ['photo too small', analyzeForm({ profile: new Blob([fakePng(300, 300)]) }), 422, 'invalid_image'],
    ['photo too large', analyzeForm({ frontal: new Blob([fakeJpeg(1200, 1500, 4.5 * 1024 * 1024)]) }), 413, 'image_too_large'],
    ['incomplete answers', analyzeForm({ answers: { ...ANSWERS, texture: undefined } }), 400, 'invalid_request'],
    ['answers that are not JSON', analyzeForm({ answers: '{nope' }), 400, 'invalid_request'],
    ['unknown option', analyzeForm({ answers: { ...ANSWERS, expression: 'male' } }), 400, 'invalid_request'],
  ])('rejects %s', async (_name, form, status, code) => {
    const runner = vi.fn(textRunner('{}'));
    const response = await handler({ runner })(post('/analyze', form));
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
    expect(runner).not.toHaveBeenCalled();
  });

  it('names the photo a field error is about', async () => {
    const response = await handler()(post('/analyze', analyzeForm({ profile: null })));
    expect((await response.json()).field).toBe('profile');
  });

  it('rejects non-multipart bodies', async () => {
    const response = await handler()(post('/analyze', JSON.stringify({ answers: ANSWERS }), { origin: ORIGIN, 'content-type': 'application/json' }));
    expect(response.status).toBe(400);
  });

  it('rejects declared bodies over the size limit before reading them', async () => {
    const request = new Request('https://api.folia.test/analyze', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-length': String(20 * 1024 * 1024) },
      body: 'x',
    });
    expect((await handler()(request)).status).toBe(413);
  });

  it.each([
    ['text that is not JSON', textRunner('Lo siento, no puedo'), 'invalid_model_response'],
    ['JSON with the wrong structure', textRunner(JSON.stringify({ recommendations: 'ninguna' })), 'invalid_model_response'],
    [
      'output that fails the audit',
      textRunner(JSON.stringify({ ...liveOutput(), recommendations: [liveOutput().recommendations[0], liveOutput().recommendations[0]] })),
      'invalid_model_response',
    ],
    [
      'a styleId outside the catalogue',
      textRunner(JSON.stringify(liveOutput()).replace('"textured-crop"', '"invented-cut"')),
      'invalid_model_response',
    ],
    ['a refusal', textRunner('', 'refusal'), 'refused'],
    ['a truncated answer', textRunner('{"imageCheck":', 'max_tokens'), 'truncated'],
  ])('turns %s into an error event', async (_name, runner, code) => {
    const list = await events(await handler({ runner })(post('/analyze', analyzeForm())));
    const last = list.at(-1)!;
    expect(last).toMatchObject({ type: 'error', code });
    expect(list.some((event) => event.type === 'result')).toBe(false);
  });

  it('passes provider errors through as safe error events', async () => {
    const runner: ModelRunner = async () => {
      throw new ModelError('provider_unavailable', 'Anthropic no está disponible ahora mismo.', true);
    };
    const list = await events(await handler({ runner })(post('/analyze', analyzeForm())));
    expect(list.at(-1)).toMatchObject({ type: 'error', code: 'provider_unavailable', retryable: true });
  });

  it('hides unexpected exceptions behind a generic message', async () => {
    const runner: ModelRunner = async () => {
      throw new Error('secret stack detail sk-ant-xyz');
    };
    const list = await events(await handler({ runner })(post('/analyze', analyzeForm())));
    expect(list.at(-1)).toMatchObject({ type: 'error', code: 'internal' });
    expect(JSON.stringify(list)).not.toContain('sk-ant');
  });
});

describe('rate limiting', () => {
  it('limits analyses per client and hour, with Retry-After', async () => {
    const handle = handler({ env: { ...ENV, RATE_LIMIT_PER_HOUR: '2' }, limiter: new MemoryRateLimiter() });
    const request = () => post('/analyze', analyzeForm(), { origin: ORIGIN, 'x-forwarded-for': '203.0.113.7' });
    expect((await handle(request())).status).toBe(200);
    expect((await handle(request())).status).toBe(200);
    const third = await handle(request());
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await third.json()).code).toBe('rate_limited');
    // Another client still gets through.
    const other = await handle(post('/analyze', analyzeForm(), { origin: ORIGIN, 'x-forwarded-for': '198.51.100.2' }));
    expect(other.status).toBe(200);
  });

  it('stops everyone at the daily limit', async () => {
    const handle = handler({ env: { ...ENV, DAILY_ANALYSIS_LIMIT: '1' }, limiter: new MemoryRateLimiter() });
    expect((await handle(post('/analyze', analyzeForm(), { origin: ORIGIN, 'x-forwarded-for': '203.0.113.1' }))).status).toBe(200);
    const blocked = await handle(post('/analyze', analyzeForm(), { origin: ORIGIN, 'x-forwarded-for': '203.0.113.2' }));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe('daily_limit');
  });
});

describe('preview requests', () => {
  function previewForm(overrides: Record<string, string | Blob | null> = {}) {
    const form = new FormData();
    const values: Record<string, string | Blob | null> = {
      frontal: new Blob([fakeJpeg(1200, 1500)], { type: 'image/jpeg' }),
      styleId: 'lob',
      variantName: 'Lob recto a la clavícula',
      instructions: 'Largo a la clavícula, línea recta, sin capas.',
      texture: 'wavy',
      consent: 'accepted',
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) if (value !== null) form.append(key, value);
    return form;
  }

  const runner: PreviewRunner = async () => ({ mime: 'image/jpeg', data: 'AAAA', model: 'image-test' });

  it('is unavailable without an image key', async () => {
    const response = await handler()(post('/preview', previewForm()));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('preview_unavailable');
  });

  it('returns the generated image', async () => {
    const spy = vi.fn(runner);
    const response = await handler({ previewRunner: spy })(post('/preview', previewForm()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 'preview', styleId: 'lob', mime: 'image/jpeg', data: 'AAAA', model: 'image-test' });
    expect(spy.mock.calls[0]![0]).toMatchObject({ styleId: 'lob', texture: 'wavy' });
  });

  it.each([
    ['without consent', { consent: null }, 'consent_required'],
    ['for an unknown cut', { styleId: 'nope' }, 'invalid_request'],
    ['without a photo', { frontal: null }, 'invalid_image'],
    ['with a file that is not an image', { frontal: new Blob(['hello world, not an image']) }, 'unsupported_type'],
  ])('rejects a preview %s', async (_name, overrides, code) => {
    const spy = vi.fn(runner);
    const response = await handler({ previewRunner: spy })(post('/preview', previewForm(overrides)));
    expect((await response.json()).code).toBe(code);
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps provider failures to status codes', async () => {
    const failing: PreviewRunner = async () => {
      throw new ModelError('provider_rate_limited', 'Demasiadas peticiones.', true);
    };
    const response = await handler({ previewRunner: failing })(post('/preview', previewForm()));
    expect(response.status).toBe(429);
  });

  it('limits previews per hour', async () => {
    const handle = handler({ env: { ...ENV, PREVIEW_PER_HOUR: '1' }, previewRunner: runner, limiter: new MemoryRateLimiter() });
    expect((await handle(post('/preview', previewForm()))).status).toBe(200);
    expect((await handle(post('/preview', previewForm()))).status).toBe(429);
  });
});
