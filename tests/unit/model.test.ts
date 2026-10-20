import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../../server/core/config.ts';
import { createAnthropicRunner, ModelError } from '../../server/core/model.ts';
import { liveOutput } from '../fixtures/analysis.ts';

/**
 * The real Anthropic runner against a stubbed `fetch`: checks the request the
 * SDK sends (model, adaptive thinking, structured output, both images, cached
 * system prompt) and how the streamed answer is read back. No network.
 */

function sse(events: object[]): Response {
  const body = events.map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
}

const start = (model = 'claude-opus-5-5') => ({
  type: 'message_start',
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 1 },
  },
});

const textBlock = (index: number, chunks: string[]) => [
  { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
  ...chunks.map((text) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })),
  { type: 'content_block_stop', index },
];

const end = (stop = 'end_turn') => [
  { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 50 } },
  { type: 'message_stop' },
];

const IMAGE = { mime: 'image/jpeg' as const, base64: '/9j/4AAQSkZJRgABAQ' };
const INPUT = { frontal: IMAGE, profile: { ...IMAGE, mime: 'image/png' as const }, answersText: 'Textura capilar declarada: Ondulado' };

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: () => Response) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('Anthropic runner', () => {
  it('sends a multimodal, structured, streamed request', async () => {
    const json = JSON.stringify(liveOutput());
    const fetch = stubFetch(() => sse([start(), ...textBlock(0, [json.slice(0, 100), json.slice(100)]), ...end()]));
    const runner = createAnthropicRunner(readConfig({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_MODEL: 'claude-opus-5-5' }));
    const hooks = { onStart: vi.fn(), onText: vi.fn() };
    const result = await runner(INPUT, hooks, new AbortController().signal);

    expect(result).toEqual({ text: json, stopReason: 'end_turn', model: 'claude-opus-5-5' });
    expect(hooks.onStart).toHaveBeenCalledTimes(1);
    expect(hooks.onText).toHaveBeenCalledTimes(2);

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toMatch(/\/v1\/messages\?beta=true$/);
    const headers = new Headers(init!.headers);
    expect(headers.get('x-api-key')).toBe('sk-ant-test');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema' } },
      fallbacks: 'default',
    });
    expect(body.max_tokens).toBe(24000);
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const content = body.messages[0].content;
    expect(content.filter((block: { type: string }) => block.type === 'image')).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE.base64 } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMAGE.base64 } },
    ]);
    expect(content.at(-1).text).toContain('Ondulado');
    // The schema keeps the catalogue as a real enum.
    expect(JSON.stringify(body.output_config.format.schema)).toContain('"enum":["buzz-cut"');
  });

  it('can turn server-side fallbacks off', async () => {
    const fetch = stubFetch(() => sse([start(), ...textBlock(0, ['{}']), ...end()]));
    const runner = createAnthropicRunner(readConfig({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_FALLBACKS: 'off' }));
    await runner(INPUT, { onStart() {}, onText() {} }, new AbortController().signal);
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect(body.fallbacks).toBeUndefined();
  });

  it('keeps only the text written after a fallback block', async () => {
    stubFetch(() =>
      sse([
        start(),
        ...textBlock(0, ['{"partial":']),
        {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'fallback',
            from: { model: 'claude-opus-5-5' },
            to: { model: 'claude-opus-5' },
            trigger: { type: 'refusal', category: null },
          },
        },
        { type: 'content_block_stop', index: 1 },
        ...textBlock(2, ['{"ok":', 'true}']),
        ...end(),
      ]),
    );
    const runner = createAnthropicRunner(readConfig({ ANTHROPIC_API_KEY: 'k' }));
    const resets: boolean[] = [];
    const result = await runner(INPUT, { onStart() {}, onText: (_delta, reset) => resets.push(reset) }, new AbortController().signal);
    expect(result.text).toBe('{"ok":true}');
    expect(resets).toEqual([false, true, false]);
  });

  it('reports the stop reason so refusals and truncation can be handled', async () => {
    stubFetch(() => sse([start(), ...textBlock(0, ['{"imageCheck":']), ...end('max_tokens')]));
    const runner = createAnthropicRunner(readConfig({ ANTHROPIC_API_KEY: 'k' }));
    const result = await runner(INPUT, { onStart() {}, onText() {} }, new AbortController().signal);
    expect(result.stopReason).toBe('max_tokens');
  });

  it.each([
    [401, 'provider_auth'],
    [429, 'provider_rate_limited'],
    [400, 'invalid_request'],
    [529, 'provider_unavailable'],
  ])('maps HTTP %i to %s', async (status, code) => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'detail' } }), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const runner = createAnthropicRunner({ ...readConfig({ ANTHROPIC_API_KEY: 'k' }) });
    const error = await runner(INPUT, { onStart() {}, onText() {} }, new AbortController().signal).catch((problem: unknown) => problem);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).code).toBe(code);
    // Provider details never reach the browser.
    expect((error as ModelError).message).not.toContain('detail');
  });
});
