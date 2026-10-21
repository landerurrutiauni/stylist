import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../../server/core/config.ts';
import { createGeminiRunner, findImage, previewPrompt } from '../../server/core/preview.ts';
import { describeAnswers, SYSTEM_PROMPT } from '../../server/core/prompt.ts';
import { MemoryRateLimiter, SupabaseRateLimiter, clientAddress, hashKey } from '../../server/core/rateLimit.ts';
import { CATALOG } from '../../shared/catalog/styles.ts';
import { ANSWERS, fakeJpeg } from './helpers.ts';

afterEach(() => vi.unstubAllGlobals());

describe('analysis prompt', () => {
  it('states the rules that protect the person', () => {
    expect(SYSTEM_PROMPT).toMatch(/never infer/i);
    for (const word of ['gender', 'ethnicity', 'age', 'health', 'attractiveness']) expect(SYSTEM_PROMPT.toLowerCase()).toContain(word);
    expect(SYSTEM_PROMPT).toMatch(/Spanish/);
  });

  it('lists the whole catalogue so the model can only pick real cuts', () => {
    for (const style of CATALOG) expect(SYSTEM_PROMPT).toContain(style.id);
  });

  it('describes the shape of each cut and keeps codes apart', () => {
    expect(SYSTEM_PROMPT).toContain('shape: ends at shoulder | parting: none | fringe: none | combed back | worn in a bun');
    expect(SYSTEM_PROMPT).toMatch(/do not rename a feminine cut to make it pass as masculine/);
  });

  it('describes every answer, marks free text and adds the refinement', () => {
    const text = describeAnswers(ANSWERS, 'Más opciones con flequillo');
    expect(text).toContain('Ondulado');
    expect(text).toContain('«Nada de rapados al cero.»');
    expect(text).toContain('Comentario libre: sin respuesta');
    expect(text).toContain('«Más opciones con flequillo»');
    expect(describeAnswers(ANSWERS, '')).not.toContain('Ajuste pedido');
  });
});

describe('hairstyle preview', () => {
  const input = {
    image: { mime: 'image/jpeg' as const, base64: Buffer.from(fakeJpeg(1200, 1500)).toString('base64') },
    styleId: 'lob',
    variantName: 'Lob recto a la clavícula',
    instructions: 'Largo a la clavícula, línea recta.',
    texture: 'curly' as const,
  };

  it('asks to change only the hair and keep the person as they are', () => {
    const prompt = previewPrompt(input);
    expect(prompt).toContain('Change ONLY the hairstyle');
    expect(prompt).toMatch(/same person and identity/);
    expect(prompt).toMatch(/Do not beautify/);
    expect(prompt).toContain('Lob recto a la clavícula');
    expect(prompt).toContain('rizado');
  });

  it('finds images in Interactions and generateContent responses', () => {
    expect(
      findImage({
        outputs: [
          { type: 'text', text: 'ok' },
          { type: 'image', data: 'QUJD', mime_type: 'image/png' },
        ],
      }),
    ).toEqual({
      data: 'QUJD',
      mime: 'image/png',
    });
    expect(findImage({ candidates: [{ content: { parts: [{ inlineData: { data: 'WFla', mimeType: 'image/jpeg' } }] } }] })).toEqual({
      data: 'WFla',
      mime: 'image/jpeg',
    });
    expect(findImage({ outputs: [{ type: 'text', text: 'no image' }] })).toBeNull();
  });

  it('calls Gemini with store disabled and trusts the returned bytes', async () => {
    const jpeg = Buffer.from(fakeJpeg(800, 1000)).toString('base64');
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ outputs: [{ type: 'image', data: jpeg, mime_type: 'image/png' }] }),
    );
    vi.stubGlobal('fetch', fetch);
    const runner = createGeminiRunner(readConfig({ GEMINI_API_KEY: 'AIza-test', IMAGE_MODEL: 'image-model-x' }));
    const result = await runner(input, new AbortController().signal);
    expect(result).toEqual({ mime: 'image/jpeg', data: jpeg, model: 'image-model-x' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('AIza-test');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: 'image-model-x', store: false });
    expect(body.input[0]).toMatchObject({ type: 'image', mime_type: 'image/jpeg' });
  });

  it.each([
    [401, 'provider_auth'],
    [429, 'provider_rate_limited'],
    [503, 'provider_unavailable'],
    [400, 'preview_failed'],
  ])('maps Gemini HTTP %i to %s', async (status, code) => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'detail' } }, { status }));
    const runner = createGeminiRunner(readConfig({ GEMINI_API_KEY: 'k' }));
    await expect(runner(input, new AbortController().signal)).rejects.toMatchObject({ code });
  });

  it('fails clearly when no image comes back', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ outputs: [{ type: 'text', text: 'I cannot edit this photo.' }] }));
    const runner = createGeminiRunner(readConfig({ GEMINI_API_KEY: 'k' }));
    await expect(runner(input, new AbortController().signal)).rejects.toMatchObject({ code: 'preview_failed' });
  });
});

describe('rate limiter', () => {
  it('counts per key inside a window and resets after it', async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    expect((await limiter.hit('a', 2, 60)).allowed).toBe(true);
    expect((await limiter.hit('a', 2, 60)).allowed).toBe(true);
    const blocked = await limiter.hit('a', 2, 60);
    expect(blocked).toEqual({ allowed: false, retryAfter: 60 });
    expect((await limiter.hit('b', 2, 60)).allowed).toBe(true);
    now = 61_000;
    expect((await limiter.hit('a', 2, 60)).allowed).toBe(true);
  });

  it('uses the shared Postgres counter and survives its outage', async () => {
    const fetch = vi.fn(async () => Response.json([{ allowed: false, retry_after: 120 }]));
    vi.stubGlobal('fetch', fetch);
    const limiter = new SupabaseRateLimiter('https://db.example', 'service-key');
    expect(await limiter.hit('k', 5, 3600)).toEqual({ allowed: false, retryAfter: 120 });
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ p_key: 'k', p_limit: 5, p_window_seconds: 3600 });

    vi.stubGlobal('fetch', async () => {
      throw new Error('down');
    });
    expect((await new SupabaseRateLimiter('https://db.example', 'k').hit('k', 5, 3600)).allowed).toBe(true);
  });

  it('never keeps raw IP addresses', async () => {
    const request = new Request('https://x.test', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } });
    expect(clientAddress(request)).toBe('203.0.113.9');
    const hashed = await hashKey('203.0.113.9', 'salt');
    expect(hashed).toMatch(/^[0-9a-f]{32}$/);
    expect(hashed).not.toContain('203');
    expect(await hashKey('203.0.113.9', 'other')).not.toBe(hashed);
  });
});
