import {
  errorBodySchema,
  healthSchema,
  previewResponseSchema,
  streamEventSchema,
  type ErrorCode,
  type Health,
  type Stage,
} from '../../shared/schema/events.ts';
import type { AnalysisEnvelope } from '../../shared/schema/analysis.ts';
import type { Answers, Texture } from '../../shared/schema/answers.ts';

/**
 * Talks to the FOLIA API. Only the API's public URL is known to the browser
 * (VITE_API_BASE_URL); the Anthropic key stays on the server.
 */

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
export const apiConfigured = API_BASE.length > 0;

/** Errors the browser can meet on top of the server's own codes. */
export type ClientErrorCode = ErrorCode | 'offline' | 'network' | 'not_configured' | 'cancelled' | 'timeout' | 'bad_response';

export class ApiError extends Error {
  constructor(
    public readonly code: ClientErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly field?: 'frontal' | 'profile',
  ) {
    super(message);
  }
}

export async function checkHealth(signal?: AbortSignal): Promise<Health> {
  if (!apiConfigured) throw new ApiError('not_configured', 'Esta publicación no tiene configurado el servidor de análisis.', false);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/health`, { signal: signal ?? AbortSignal.timeout(8000) });
  } catch {
    throw networkError();
  }
  if (!response.ok) throw await errorFrom(response);
  const parsed = healthSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ApiError('bad_response', 'El servidor respondió con un formato inesperado.', true);
  return parsed.data;
}

function networkError(): ApiError {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ApiError('offline', 'No hay conexión a Internet.', true);
  }
  return new ApiError('network', 'No se ha podido contactar con el servidor de análisis.', true);
}

async function errorFrom(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const parsed = errorBodySchema.safeParse(body);
  if (parsed.success) return new ApiError(parsed.data.code, parsed.data.message, parsed.data.retryable, parsed.data.field);
  if (response.status === 429) return new ApiError('rate_limited', 'Demasiadas peticiones. Espera un poco.', true);
  if (response.status >= 500) return new ApiError('provider_unavailable', 'El servidor de análisis no está disponible.', true);
  return new ApiError('bad_response', `El servidor respondió con un error (${response.status}).`, false);
}

export interface AnalyzeInput {
  frontal: Blob;
  profile: Blob;
  answers: Answers;
  refinement: string;
}

export interface AnalyzeHooks {
  onStage(stage: Stage): void;
  onProgress(recommendations: number): void;
}

const TIMEOUT_MS = 200_000;

export async function analyze(input: AnalyzeInput, hooks: AnalyzeHooks, signal: AbortSignal): Promise<AnalysisEnvelope> {
  if (!apiConfigured) throw new ApiError('not_configured', 'Esta publicación no tiene configurado el servidor de análisis.', false);

  const form = new FormData();
  form.append('frontal', input.frontal, 'frontal.jpg');
  form.append('profile', input.profile, 'perfil.jpg');
  form.append('answers', JSON.stringify(input.answers));
  form.append('refinement', input.refinement);
  form.append('consent', 'accepted');

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeout]);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form, signal: combined });
  } catch {
    if (signal.aborted) throw new ApiError('cancelled', 'Has cancelado el análisis.', true);
    if (timeout.aborted) throw new ApiError('timeout', 'El análisis ha tardado demasiado.', true);
    throw networkError();
  }
  if (!response.ok) throw await errorFrom(response);
  if (!response.body) throw new ApiError('bad_response', 'El servidor no devolvió ningún contenido.', true);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += value;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch {
          throw new ApiError('bad_response', 'El servidor envió datos que no se pueden leer.', true);
        }
        const event = streamEventSchema.safeParse(raw);
        if (!event.success) throw new ApiError('invalid_model_response', 'El resultado recibido no tiene la estructura esperada.', true);
        switch (event.data.type) {
          case 'stage':
            hooks.onStage(event.data.stage);
            break;
          case 'progress':
            hooks.onProgress(event.data.recommendations);
            break;
          case 'result':
            return event.data.analysis;
          case 'error':
            throw new ApiError(event.data.code, event.data.message, event.data.retryable, event.data.field);
          case 'ping':
            break;
        }
      }
      if (done) break;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal.aborted) throw new ApiError('cancelled', 'Has cancelado el análisis.', true);
    if (timeout.aborted) throw new ApiError('timeout', 'El análisis ha tardado demasiado.', true);
    throw networkError();
  } finally {
    reader.cancel().catch(() => {});
  }
  throw new ApiError('bad_response', 'La conexión se cerró antes de recibir el resultado.', true);
}

export interface PreviewInput {
  /** The photo to edit: the frontal one or the profile one. */
  photo: Blob;
  view: 'front' | 'profile';
  styleId: string;
  variantName: string;
  instructions: string;
  texture: Texture | null;
}

export interface PreviewImage {
  blob: Blob;
  model: string;
}

/** Asks the server for an AI-edited version of one photo (frontal or profile) with this cut. */
export async function requestPreview(input: PreviewInput, signal: AbortSignal): Promise<PreviewImage> {
  if (!apiConfigured) throw new ApiError('not_configured', 'Esta publicación no tiene configurado el servidor.', false);
  const form = new FormData();
  form.append('photo', input.photo, input.view === 'profile' ? 'perfil.jpg' : 'frontal.jpg');
  form.append('view', input.view);
  form.append('styleId', input.styleId);
  form.append('variantName', input.variantName);
  form.append('instructions', input.instructions);
  if (input.texture) form.append('texture', input.texture);
  form.append('consent', 'accepted');

  const timeout = AbortSignal.timeout(120_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/preview`, { method: 'POST', body: form, signal: AbortSignal.any([signal, timeout]) });
  } catch {
    if (signal.aborted) throw new ApiError('cancelled', 'Has cancelado la vista previa.', true);
    if (timeout.aborted) throw new ApiError('timeout', 'La vista previa ha tardado demasiado.', true);
    throw networkError();
  }
  if (!response.ok) throw await errorFrom(response);
  const parsed = previewResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ApiError('bad_response', 'El servidor devolvió una imagen no válida.', true);
  const binary = atob(parsed.data.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: parsed.data.mime }), model: parsed.data.model };
}
