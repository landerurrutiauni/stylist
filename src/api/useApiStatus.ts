import { useEffect, useState } from 'react';
import { ApiError, apiConfigured, checkHealth } from './client.ts';

export type ApiStatus =
  | { state: 'checking' }
  | { state: 'available'; model: string | null; preview: boolean; previewModel: string | null }
  | { state: 'missing_api_key'; preview: boolean; previewModel: string | null }
  | { state: 'not_configured' }
  | { state: 'unreachable'; message: string };

let cached: Promise<ApiStatus> | null = null;

function load(): Promise<ApiStatus> {
  if (!apiConfigured) return Promise.resolve({ state: 'not_configured' });
  cached ??= checkHealth()
    .then<ApiStatus>((health) =>
      health.analysis === 'available'
        ? { state: 'available', model: health.model, preview: health.preview === 'available', previewModel: health.previewModel }
        : { state: 'missing_api_key', preview: health.preview === 'available', previewModel: health.previewModel },
    )
    .catch((error: unknown) => {
      cached = null;
      return { state: 'unreachable', message: error instanceof ApiError ? error.message : 'No se ha podido comprobar el servidor.' };
    });
  return cached;
}

/** Whether a real analysis can run, checked once per page load. */
export function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>(apiConfigured ? { state: 'checking' } : { state: 'not_configured' });
  useEffect(() => {
    let alive = true;
    void load().then((result) => {
      if (alive) setStatus(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export const STATUS_TEXT: Record<Exclude<ApiStatus['state'], 'available' | 'checking'>, string> = {
  not_configured: 'Esta publicación no tiene configurado el servidor de análisis, así que el análisis real con IA no está disponible.',
  missing_api_key:
    'El servidor de análisis está en marcha, pero no tiene configurada la clave de Anthropic, así que el análisis real no está disponible.',
  unreachable: 'No se ha podido contactar con el servidor de análisis.',
};

/** Whether hairstyle previews can be generated, and with which model. */
export function previewStatus(status: ApiStatus): { available: boolean; model: string | null; checking: boolean } {
  if (status.state === 'checking') return { available: false, model: null, checking: true };
  if (status.state === 'available' || status.state === 'missing_api_key')
    return { available: status.preview, model: status.previewModel, checking: false };
  return { available: false, model: null, checking: false };
}
