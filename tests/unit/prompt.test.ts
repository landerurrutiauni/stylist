import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../../server/core/config.ts';
import { createCloudflareRunner, createGeminiRunner, findImage, outputSize, previewPrompt } from '../../server/core/preview.ts';
import { createHandler } from '../../server/core/handler.ts';
import { describeAnswers, SYSTEM_PROMPT } from '../../server/core/prompt.ts';
import { MemoryRateLimiter, SupabaseRateLimiter, clientAddress, hashKey } from '../../server/core/rateLimit.ts';
import { CATALOG } from '../../shared/catalog/styles.ts';
import { ANSWERS, fakeJpeg, fakePng } from './helpers.ts';

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
    view: 'front' as const,
    styleId: 'lob',
    variantName: 'Lob recto a la clavícula',
    instructions: 'Largo a la clavícula, línea recta.',
    texture: 'curly' as const,
  };

  it('describes the new cut first, in plain English, and keeps the person as they are', () => {
    const prompt = previewPrompt(input);
    expect(prompt.split('\n')[0]).toBe(
      'Change the hairstyle of the person in this photo to a long bob (lob): hair reaching the collarbones, deep side parting, soft waves and light layers, no fringe.',
    );
    expect(prompt).toContain('The hair reaches the collarbones.');
    expect(prompt).toContain("The hair has the person's natural curly texture.");
    expect(prompt).toContain('Keep the same person');
    // The small FLUX model gets no Spanish jargon; Gemini gets the brief as extra detail.
    expect(prompt).not.toContain('Lob recto a la clavícula');
    expect(previewPrompt(input, 'google')).toContain('Salon brief, in Spanish: Largo a la clavícula, línea recta.');
  });

  it('makes drastic changes explicit: a buzz cut removes the long hair and ignores texture', () => {
    const prompt = previewPrompt({ ...input, styleId: 'buzz-cut', variantName: 'Rapado al 3', texture: 'wavy' });
    expect(prompt).toContain('a buzz cut: all the hair clipped very short and even');
    expect(prompt).toContain('Remove all longer hair.');
    expect(prompt).not.toContain('texture');
  });

  it('asks for the side view when editing the profile photo', () => {
    const prompt = previewPrompt({ ...input, view: 'profile', styleId: 'man-bun' });
    expect(prompt).toMatch(/^This is a side-view \(profile\) photo of a person\. Change their hairstyle to long hair tied up in a bun/);
    expect(prompt).toContain('keeping the profile pose');
  });

  it('has a visual description for every cut in the catalogue', () => {
    for (const style of CATALOG) expect(style.look.length, style.id).toBeGreaterThan(40);
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

describe('free hairstyle preview with Cloudflare Workers AI', () => {
  const CF = { CLOUDFLARE_ACCOUNT_ID: 'acc123', CLOUDFLARE_API_TOKEN: 'cf-token' };
  const small = { mime: 'image/jpeg' as const, base64: Buffer.from(fakeJpeg(410, 512)).toString('base64') };
  const input = {
    image: small,
    view: 'front' as const,
    styleId: 'man-bun',
    variantName: 'Moño alto',
    instructions: 'Recoger en la coronilla.',
    texture: 'wavy' as const,
  };

  it('prefers Cloudflare, can be forced to Google and is off without credentials', () => {
    expect(readConfig(CF).imageProvider).toBe('cloudflare');
    expect(readConfig({ ...CF, GEMINI_API_KEY: 'g' }).imageProvider).toBe('cloudflare');
    expect(readConfig({ ...CF, GEMINI_API_KEY: 'g', IMAGE_PROVIDER: 'google' }).imageProvider).toBe('google');
    expect(readConfig({ GEMINI_API_KEY: 'g' }).imageProvider).toBe('google');
    expect(readConfig({ CLOUDFLARE_ACCOUNT_ID: 'only-account' }).imageProvider).toBeNull();
  });

  it('tells the browser which service edits the photo and how big to send it', async () => {
    const handle = createHandler({ env: { ...CF, ALLOWED_ORIGINS: 'https://app.test' } });
    const health = await (await handle(new Request('https://api.test/health'))).json();
    expect(health).toMatchObject({
      preview: 'available',
      previewProvider: 'cloudflare',
      previewModel: '@cf/black-forest-labs/flux-2-klein-4b',
      previewMaxSide: 512,
    });
    expect(JSON.stringify(health)).not.toContain('cf-token');
  });

  it('keeps the photo proportions in the output size', () => {
    expect(outputSize(410, 512)).toEqual({ width: 608, height: 768 });
    expect(outputSize(512, 512)).toEqual({ width: 768, height: 768 });
  });

  it('sends the photo and prompt as multipart and reads the image back', async () => {
    const png = Buffer.from(fakePng(608, 768)).toString('base64');
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ success: true, result: { image: png } }));
    vi.stubGlobal('fetch', fetch);
    const result = await createCloudflareRunner(readConfig(CF))(input, new AbortController().signal);
    expect(result).toEqual({ mime: 'image/png', data: png, model: '@cf/black-forest-labs/flux-2-klein-4b' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/black-forest-labs/flux-2-klein-4b');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer cf-token');
    const form = init.body as FormData;
    expect(form.get('prompt')).toContain('Change the hairstyle of the person in this photo to long hair tied up in a bun');
    expect(form.get('input_image_0')).toBeInstanceOf(Blob);
    expect([form.get('width'), form.get('height')]).toEqual(['608', '768']);
  });

  it('accepts a raw image response too', async () => {
    vi.stubGlobal('fetch', async () => new Response(fakeJpeg(608, 768), { headers: { 'content-type': 'image/jpeg' } }));
    const result = await createCloudflareRunner(readConfig(CF))(input, new AbortController().signal);
    expect(result.mime).toBe('image/jpeg');
  });

  it('refuses photos over 512 px before calling the service', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const big = { ...input, image: { mime: 'image/jpeg' as const, base64: Buffer.from(fakeJpeg(1200, 1500)).toString('base64') } };
    await expect(createCloudflareRunner(readConfig(CF))(big, new AbortController().signal)).rejects.toMatchObject({ code: 'preview_failed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, 'provider_auth'],
    [429, { success: false, errors: [{ code: 3040, message: 'Capacity temporarily exceeded' }] }, 'provider_rate_limited'],
    [
      400,
      { success: false, errors: [{ code: 4006, message: 'you have used up your daily free allocation of 10,000 neurons' }] },
      'provider_rate_limited',
    ],
    [500, { success: false, errors: [] }, 'provider_unavailable'],
    [400, { success: false, errors: [{ code: 5006, message: 'bad input' }] }, 'preview_failed'],
  ])('maps HTTP %i to a safe error', async (status, body, code) => {
    vi.stubGlobal('fetch', async () => Response.json(body, { status }));
    const error = await createCloudflareRunner(readConfig(CF))(input, new AbortController().signal).catch((problem: unknown) => problem);
    expect(error).toMatchObject({ code });
    expect(String((error as Error).message)).not.toContain('neurons');
  });
});
