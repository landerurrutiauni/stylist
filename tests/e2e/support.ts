import { expect, type Page, type Request, type Route } from '@playwright/test';
import type { AnalysisEnvelope } from '../../shared/schema/analysis.ts';
import { fakeJpegBase64 } from './images.ts';
import { liveEnvelope } from '../fixtures/analysis.ts';
import { sniffImage } from '../../shared/imageSniff.ts';

export const API = 'https://api.folia.test';
export const FIXTURES = 'tests/fixtures/generated';

type Health = 'available' | 'missing_api_key' | 'no_preview' | 'down' | 'error';

export interface AnalyzeReply {
  /** NDJSON events to stream back; strings are sent as raw lines. */
  events?: (object | string)[];
  /** A plain HTTP error instead of a stream. */
  status?: number;
  body?: object;
  /** Drop the connection. */
  abort?: boolean;
  delayMs?: number;
}

export interface MockOptions {
  health?: Health;
  /** The image service the health check reports (Cloudflare by default, as deployed). */
  previewProvider?: 'cloudflare' | 'google';
  /** One reply per analysis request, in order; the last one repeats. */
  analyze?: AnalyzeReply[];
  preview?: { status?: number; body?: object; delayMs?: number };
}

export interface ApiLog {
  analyze: Request[];
  preview: Request[];
  /** Every request that left the page for another origin. */
  external: string[];
}

export const resultEvents = (analysis: AnalysisEnvelope = liveEnvelope()) => [
  { type: 'stage', stage: 'received' },
  { type: 'stage', stage: 'observing' },
  { type: 'stage', stage: 'writing' },
  { type: 'progress', recommendations: 3 },
  { type: 'progress', recommendations: analysis.output.recommendations.length },
  { type: 'stage', stage: 'validating' },
  { type: 'result', analysis },
];

const cors = (request: Request) => ({
  'access-control-allow-origin': request.headers()['origin'] ?? '*',
  vary: 'Origin',
  'cache-control': 'no-store',
});

async function fulfillJson(route: Route, status: number, body: object) {
  await route.fulfill({ status, contentType: 'application/json', headers: cors(route.request()), body: JSON.stringify(body) });
}

/** Stands in for the FOLIA API. Nothing in these tests reaches a real server. */
export async function mockApi(page: Page, options: MockOptions = {}): Promise<ApiLog> {
  const log: ApiLog = { analyze: [], preview: [], external: [] };
  const replies = options.analyze ?? [{ events: resultEvents() }];
  const health = options.health ?? 'available';

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost') log.external.push(url.origin);
  });

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/health')) {
      if (health === 'down') return route.abort('connectionrefused');
      if (health === 'error') return fulfillJson(route, 500, { message: 'boom' });
      const analysis = health === 'missing_api_key' ? 'missing_api_key' : 'available';
      const preview = health === 'available' ? 'available' : 'missing_api_key';
      return fulfillJson(route, 200, {
        ok: true,
        analysis,
        model: analysis === 'available' ? 'claude-test-model' : null,
        preview,
        previewModel: preview === 'available' ? 'image-test-model' : null,
        previewProvider: preview === 'available' ? (options.previewProvider ?? 'cloudflare') : null,
        previewMaxSide: (options.previewProvider ?? 'cloudflare') === 'cloudflare' ? 512 : 1600,
        limits: { maxImageBytes: 4194304, perHour: 6, previewsPerHour: 10 },
      });
    }
    if (path.endsWith('/analyze')) {
      const reply = replies[Math.min(log.analyze.length, replies.length - 1)]!;
      log.analyze.push(request);
      if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      if (reply.abort) return route.abort('failed').catch(() => {});
      if (reply.status) return fulfillJson(route, reply.status, reply.body ?? {});
      return route
        .fulfill({
          status: 200,
          contentType: 'application/x-ndjson; charset=utf-8',
          headers: cors(request),
          body: (reply.events ?? []).map((event) => (typeof event === 'string' ? event : JSON.stringify(event))).join('\n') + '\n',
        })
        .catch(() => {});
    }
    if (path.endsWith('/preview')) {
      log.preview.push(request);
      const preview = options.preview ?? {};
      if (preview.delayMs) await new Promise((resolve) => setTimeout(resolve, preview.delayMs));
      if (preview.status) return fulfillJson(route, preview.status, preview.body ?? {});
      const styleId = /name="styleId"\r\n\r\n([^\r]+)/.exec(request.postDataBuffer()?.toString('latin1') ?? '')?.[1] ?? 'lob';
      return fulfillJson(route, 200, { type: 'preview', styleId, mime: 'image/jpeg', data: fakeJpegBase64(), model: 'image-test-model' });
    }
    return fulfillJson(route, 404, { type: 'error', code: 'invalid_request', message: 'Ruta no encontrada.', retryable: false });
  });
  return log;
}

/** Reads a text field of a multipart request body. */
export function formField(request: Request, name: string): string | null {
  const body = request.postDataBuffer()?.toString('latin1') ?? '';
  const match = new RegExp(`name="${name}"(?:; filename="[^"]*")?\\r\\n(?:Content-Type: [^\\r]+\\r\\n)?\\r\\n([\\s\\S]*?)\\r\\n--`).exec(body);
  return match ? Buffer.from(match[1]!, 'latin1').toString('utf8') : null;
}

/** Fails the test on any page error or console error. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    // A refused connection is expected when a test takes the API down.
    if (message.type() === 'error' && !/Failed to load resource|net::ERR_/.test(message.text())) errors.push(message.text());
  });
  return errors;
}

export async function uploadPhotos(page: Page, frontal = `${FIXTURES}/frontal.jpg`, profile = `${FIXTURES}/profile.jpg`) {
  await page.getByTestId('input-frontal').setInputFiles(frontal);
  await page.getByTestId('input-profile').setInputFiles(profile);
  await expect(page.getByTestId('slot-frontal').locator('img')).toBeVisible();
  await expect(page.getByTestId('slot-profile').locator('img')).toBeVisible();
}

/** Photos, consent for the real analysis, and on to the first question. */
export async function startLive(page: Page) {
  await page.goto('estudio/fotos');
  await uploadPhotos(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/consentimiento$/);
  await page.getByRole('checkbox', { name: /Acepto que FOLIA envíe mis dos fotos/ }).check();
  await page.getByRole('button', { name: 'Aceptar y seguir' }).click();
  await expect(page).toHaveURL(/cuestionario\/estilos$/);
}

/** Photos, then demo mode: nothing is sent. */
export async function startDemo(page: Page) {
  await page.goto('estudio/fotos');
  await uploadPhotos(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /modo demostración/ }).click();
  await expect(page).toHaveURL(/cuestionario\/estilos$/);
}

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

/** Answers the five required questions and skips the optional ones. */
export async function answerRequired(page: Page) {
  await page.getByRole('radio', { name: /^Todas las categorías/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Ondulado/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Densidad media/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Medio/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Entre 5 y 10/ }).check();
  await next(page);
  for (let i = 0; i < 3; i++) await page.getByRole('link', { name: 'Omitir' }).click();
  await page.getByRole('link', { name: 'Omitir' }).click();
  await expect(page).toHaveURL(/revision$/);
}

/** Answers every question, optional ones included. */
export async function answerAll(page: Page) {
  await page.getByRole('radio', { name: /^Todas las categorías/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Ondulado/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Grueso o muy denso/ }).check();
  await page.getByRole('checkbox', { name: 'Remolinos' }).check();
  await page.getByLabel('Algo más sobre tu pelo (opcional)').fill('Tengo un remolino en la coronilla.');
  await next(page);
  await page.getByRole('radio', { name: /^Medio/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Menos de 5 minutos/ }).check();
  await next(page);
  await page.getByRole('checkbox', { name: 'Natural' }).check();
  await page.getByRole('checkbox', { name: 'Moderno' }).check();
  await page.getByLabel('¿Qué imagen quieres proyectar o qué estilos te inspiran?').fill('Algo cuidado pero sin esfuerzo.');
  await next(page);
  await page.getByRole('checkbox', { name: 'Secador' }).check();
  await page.getByRole('checkbox', { name: 'Cremas para rizos' }).check();
  await page.getByRole('radio', { name: 'Prefiero mantenerla sencilla' }).check();
  await next(page);
  await page.getByRole('checkbox', { name: 'Probar un flequillo' }).check();
  await page.getByLabel(/Cortes que no te gustan/).fill('Nada de rapados al cero.');
  await next(page);
  await page.getByLabel('Comentario libre').fill('Trabajo de cara al público.');
  await page.getByRole('button', { name: 'Revisar respuestas' }).click();
  await expect(page).toHaveURL(/revision$/);
}

/** From the photos screen to the results of a real (mocked) analysis. */
export async function reachLiveResults(page: Page) {
  await startLive(page);
  await answerRequired(page);
  await page.getByRole('button', { name: 'Analizar mis fotos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu ficha de estilo' })).toBeVisible();
}

export const cards = (page: Page) => page.getByTestId('recommendation');

/** Whether the page can scroll sideways (it must not). */
export const overflowsX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

/** Whether an object URL still points at an image (CSP blocks fetch() on blob:, so load it as an image). */
export const loads = (page: Page, url: string) =>
  page.evaluate(
    (src) =>
      new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = src;
      }),
    url,
  );

/** Pixel size of the image sent in a multipart field, read from its bytes. */
export function uploadedImageSize(request: Request, name: string) {
  const body = request.postDataBuffer() ?? Buffer.alloc(0);
  const marker = Buffer.from(`name="${name}"`);
  const start = body.indexOf(marker);
  if (start < 0) return null;
  const dataStart = body.indexOf(Buffer.from('\r\n\r\n'), start) + 4;
  return sniffImage(new Uint8Array(body.subarray(dataStart, dataStart + 65536)));
}
