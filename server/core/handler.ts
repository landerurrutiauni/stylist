import { analysisOutputSchema, auditAnalysis, type AnalysisEnvelope } from '../../shared/schema/analysis.ts';
import type { ErrorBody, Health, StreamEvent } from '../../shared/schema/events.ts';
import { IMAGE_LIMITS } from '../../shared/imageSniff.ts';
import { readConfig, type Env, type ServerConfig } from './config.ts';
import { createAnthropicRunner, ModelError, type ModelRunner } from './model.ts';
import { createPreviewRunner, previewMaxSide, previewModelName, readPreviewUpload, type PreviewRunner } from './preview.ts';
import { describeAnswers } from './prompt.ts';
import { clientAddress, hashKey, MemoryRateLimiter, type RateLimiter } from './rateLimit.ts';
import { readUpload } from './upload.ts';

/**
 * The FOLIA API as a plain `(Request) => Promise<Response>` function. It runs
 * unchanged on Node (server/node), on Supabase Edge Functions (server/supabase)
 * and in tests.
 *
 *   GET  …/health   whether real analysis and previews are available
 *   POST …/analyze  multipart: frontal, profile, answers, consent, refinement
 *   POST …/preview  multipart: frontal, styleId, variantName, instructions, texture, consent
 */

export interface HandlerDeps {
  env: Env;
  runner?: ModelRunner;
  previewRunner?: PreviewRunner;
  limiter?: RateLimiter;
  /** Structured log line without personal data. */
  log?: (entry: Record<string, string | number | boolean>) => void;
  now?: () => Date;
  newId?: () => string;
}

const MAX_BODY_BYTES = 9 * 1024 * 1024;
const PING_MS = 10_000;

function corsHeaders(origin: string | null, config: ServerConfig): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && config.allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'content-type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(body: unknown, status: number, cors: Record<string, string>, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...cors, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

function errorResponse(error: ErrorBody, status: number, cors: Record<string, string>, extra?: Record<string, string>) {
  return json(error, status, cors, extra);
}

const STATUS: Partial<Record<ErrorBody['code'], number>> = {
  invalid_request: 400,
  consent_required: 400,
  invalid_image: 422,
  unsupported_type: 415,
  image_too_large: 413,
  payload_too_large: 413,
};

/** Counts finished recommendations in partial JSON, for honest progress. */
function countRecommendations(text: string): number {
  const start = text.indexOf('"recommendations"');
  if (start < 0) return 0;
  return (text.slice(start).match(/"styleId"\s*:/g) ?? []).length;
}

export function createHandler(deps: HandlerDeps) {
  const config = readConfig(deps.env);
  const runner = deps.runner ?? (config.apiKey ? createAnthropicRunner(config) : null);
  const previewRunner = deps.previewRunner ?? createPreviewRunner(config);
  const limiter = deps.limiter ?? new MemoryRateLimiter();
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  async function limited(scope: 'analysis' | 'preview', request: Request, cors: Record<string, string>): Promise<Response | null> {
    const perHour = scope === 'analysis' ? config.perHour : config.previewPerHour;
    const perDay = scope === 'analysis' ? config.perDay : config.previewPerDay;
    const client = await hashKey(clientAddress(request), config.hashSalt);
    const hourly = await limiter.hit(`${scope}:ip:${client}`, perHour, 3600);
    if (!hourly.allowed) {
      log({ event: 'rate_limited', scope, window: 'hour' });
      const what = scope === 'analysis' ? 'análisis' : 'vistas previas';
      return errorResponse(
        {
          type: 'error',
          code: 'rate_limited',
          message: `Has alcanzado el límite de ${perHour} ${what} por hora. Vuelve a intentarlo más tarde.`,
          retryable: true,
        },
        429,
        cors,
        { 'Retry-After': String(hourly.retryAfter) },
      );
    }
    const day = now().toISOString().slice(0, 10);
    const daily = await limiter.hit(`${scope}:day:${day}`, perDay, 86_400);
    if (!daily.allowed) {
      log({ event: 'rate_limited', scope, window: 'day' });
      return errorResponse(
        { type: 'error', code: 'daily_limit', message: 'FOLIA ha alcanzado el máximo de hoy. Vuelve a intentarlo mañana.', retryable: true },
        429,
        cors,
        { 'Retry-After': String(daily.retryAfter) },
      );
    }
    return null;
  }

  async function handlePreview(request: Request, origin: string | null, cors: Record<string, string>): Promise<Response> {
    if (request.method !== 'POST') {
      return errorResponse({ type: 'error', code: 'invalid_request', message: 'Método no permitido.', retryable: false }, 405, cors, {
        Allow: 'POST, OPTIONS',
      });
    }
    if (!origin && config.requireOrigin) {
      return errorResponse({ type: 'error', code: 'origin_not_allowed', message: 'Falta la cabecera Origin.', retryable: false }, 403, cors);
    }
    if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
      return errorResponse({ type: 'error', code: 'payload_too_large', message: 'La petición es demasiado grande.', retryable: false }, 413, cors);
    }
    if (!previewRunner) {
      return errorResponse(
        {
          type: 'error',
          code: 'preview_unavailable',
          message: 'La vista previa con IA no está disponible: el servidor no tiene configurado el servicio de imágenes.',
          retryable: false,
        },
        503,
        cors,
      );
    }
    const blocked = await limited('preview', request, cors);
    if (blocked) return blocked;

    const upload = await readPreviewUpload(request);
    if (!upload.ok) {
      log({ event: 'preview_rejected', code: upload.error.code });
      return errorResponse(upload.error, STATUS[upload.error.code] ?? 400, cors);
    }
    const started = Date.now();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), config.previewTimeoutMs);
    request.signal?.addEventListener('abort', () => abort.abort());
    try {
      const result = await previewRunner(upload.value, abort.signal);
      log({ event: 'preview_ok', ms: Date.now() - started });
      return json(
        { type: 'preview', styleId: upload.value.styleId, view: upload.value.view, mime: result.mime, data: result.data, model: result.model },
        200,
        cors,
      );
    } catch (error) {
      const failure = error instanceof ModelError ? error : new ModelError('preview_failed', 'No se pudo generar la vista previa.', true);
      log({ event: 'preview_failed', code: failure.code, ms: Date.now() - started });
      const status = failure.code === 'provider_rate_limited' ? 429 : failure.code === 'provider_timeout' ? 504 : 502;
      return errorResponse({ type: 'error', code: failure.code, message: failure.message, retryable: failure.retryable }, status, cors);
    } finally {
      clearTimeout(timeout);
    }
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, config);
    const path = url.pathname.replace(/\/+$/, '');

    if (origin && !config.allowedOrigins.includes(origin)) {
      return errorResponse(
        { type: 'error', code: 'origin_not_allowed', message: 'Este origen no puede usar la API de FOLIA.', retryable: false },
        403,
        cors,
      );
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...BASE_HEADERS, ...cors } });

    if (path.endsWith('/health') && request.method === 'GET') {
      const health: Health = {
        ok: true,
        analysis: runner ? 'available' : 'missing_api_key',
        model: runner ? config.model : null,
        preview: previewRunner ? 'available' : 'missing_api_key',
        previewModel: previewRunner ? previewModelName(config) : null,
        previewProvider: previewRunner ? config.imageProvider : null,
        previewMaxSide: previewMaxSide(config),
        limits: { maxImageBytes: IMAGE_LIMITS.maxUploadBytes, perHour: config.perHour, previewsPerHour: config.previewPerHour },
      };
      return json(health, 200, cors);
    }

    if (path.endsWith('/preview')) return handlePreview(request, origin, cors);

    if (!path.endsWith('/analyze')) {
      return errorResponse({ type: 'error', code: 'invalid_request', message: 'Ruta no encontrada.', retryable: false }, 404, cors);
    }
    if (request.method !== 'POST') {
      return errorResponse({ type: 'error', code: 'invalid_request', message: 'Método no permitido.', retryable: false }, 405, cors, {
        Allow: 'POST, OPTIONS',
      });
    }
    if (!origin && config.requireOrigin) {
      return errorResponse({ type: 'error', code: 'origin_not_allowed', message: 'Falta la cabecera Origin.', retryable: false }, 403, cors);
    }

    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) {
      return errorResponse({ type: 'error', code: 'payload_too_large', message: 'La petición es demasiado grande.', retryable: false }, 413, cors);
    }

    if (!runner) {
      return errorResponse(
        {
          type: 'error',
          code: 'missing_api_key',
          message: 'El análisis real no está disponible: el servidor no tiene configurada la clave de Anthropic.',
          retryable: false,
        },
        503,
        cors,
      );
    }

    const blocked = await limited('analysis', request, cors);
    if (blocked) return blocked;

    const upload = await readUpload(request);
    if (!upload.ok) {
      log({ event: 'rejected', code: upload.error.code });
      return errorResponse(upload.error, STATUS[upload.error.code] ?? 400, cors);
    }

    const started = Date.now();
    const encoder = new TextEncoder();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), config.timeoutMs + 5000);

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (event: StreamEvent) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            open = false;
          }
        };
        const ping = setInterval(() => send({ type: 'ping' }), PING_MS);
        send({ type: 'stage', stage: 'received' });

        let partial = '';
        let reported = 0;
        let writing = false;
        try {
          const result = await runner(
            {
              frontal: upload.value.frontal,
              profile: upload.value.profile,
              answersText: describeAnswers(upload.value.answers, upload.value.refinement),
            },
            {
              onStart: () => send({ type: 'stage', stage: 'observing' }),
              onText: (delta, reset) => {
                if (reset) {
                  partial = '';
                  reported = 0;
                }
                if (!writing) {
                  writing = true;
                  send({ type: 'stage', stage: 'writing' });
                }
                partial += delta;
                const count = countRecommendations(partial);
                if (count !== reported) {
                  reported = count;
                  send({ type: 'progress', recommendations: count });
                }
              },
            },
            abort.signal,
          );

          send({ type: 'stage', stage: 'validating' });
          if (result.stopReason === 'refusal') {
            throw new ModelError('refused', 'El modelo no ha podido completar este análisis. Prueba con otras fotos.', false);
          }
          if (result.stopReason === 'max_tokens') {
            throw new ModelError('truncated', 'La respuesta del modelo quedó incompleta.', true);
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.text);
          } catch {
            throw new ModelError('invalid_model_response', 'La respuesta del modelo no tenía un formato válido.', true);
          }
          const output = analysisOutputSchema.safeParse(parsed);
          if (!output.success) {
            throw new ModelError('invalid_model_response', 'La respuesta del modelo no cumple la estructura esperada.', true);
          }
          const problems = auditAnalysis(output.data);
          if (problems.length > 0) {
            log({ event: 'audit_failed', problems: problems.length });
            throw new ModelError('invalid_model_response', 'La respuesta del modelo no supera las comprobaciones de FOLIA.', true);
          }
          const analysis: AnalysisEnvelope = {
            id: newId(),
            createdAt: now().toISOString(),
            mode: 'live',
            model: result.model,
            output: output.data,
          };
          send({ type: 'result', analysis });
          log({ event: 'analysis_ok', ms: Date.now() - started, recommendations: output.data.recommendations.length, bytes: upload.value.bytes });
        } catch (error) {
          const failure = error instanceof ModelError ? error : new ModelError('internal', 'Error inesperado durante el análisis.', true);
          log({ event: 'analysis_failed', code: failure.code, ms: Date.now() - started });
          send({ type: 'error', code: failure.code, message: failure.message, retryable: failure.retryable });
        } finally {
          clearInterval(ping);
          clearTimeout(timeout);
          if (open) {
            open = false;
            controller.close();
          }
        }
      },
      cancel() {
        abort.abort();
        clearTimeout(timeout);
      },
    });

    return new Response(body, {
      status: 200,
      headers: { ...BASE_HEADERS, ...cors, 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    });
  };
}
