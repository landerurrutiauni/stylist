import { getStyle } from '../../shared/catalog/styles.ts';
import { TEXTURES, type Texture } from '../../shared/schema/answers.ts';
import type { ErrorBody } from '../../shared/schema/events.ts';
import { textureLabels } from '../../shared/labels.ts';
import { ACCEPTED_FORMATS, detectFormat, IMAGE_LIMITS, sniffImage } from '../../shared/imageSniff.ts';
import type { ServerConfig } from './config.ts';
import { ModelError, type ModelImage } from './model.ts';

/**
 * The hairstyle preview: the person's own frontal photo edited by an image
 * model so only the hair changes. Claude analyses but does not generate
 * images, so this step uses Google's Gemini API (Nano Banana image models),
 * called from the server with a key the browser never sees. Each preview is
 * requested explicitly by the person, after a consent that names Google.
 *
 * Requests set `store: false` so Google does not keep the interaction object;
 * Google's abuse monitoring still applies (see docs/PRIVACY.md).
 */

export interface PreviewInput {
  image: ModelImage;
  styleId: string;
  variantName: string;
  instructions: string;
  texture: Texture | null;
}

export interface PreviewResult {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
  model: string;
}

export type PreviewRunner = (input: PreviewInput, signal: AbortSignal) => Promise<PreviewResult>;

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export function previewPrompt(input: PreviewInput): string {
  const style = getStyle(input.styleId);
  const texture = input.texture && input.texture !== 'unsure' ? textureLabels[input.texture].label.toLowerCase() : null;
  return [
    'Edit this photo of a real person. Change ONLY the hairstyle.',
    `New haircut: "${input.variantName}"${style ? ` (base cut: ${style.name}; ${style.summary})` : ''}.`,
    `Salon brief, in Spanish: ${input.instructions}`,
    texture
      ? `The person's natural hair texture is ${texture} (Spanish word); keep that texture.`
      : "Keep the person's natural hair texture as seen in the photo.",
    "Keep the person's natural hair colour.",
    'Keep everything else exactly as it is: the same person and identity, face shape and every facial feature, skin tone and skin texture, eyes, eyebrows, facial hair, expression, head position and angle, body, clothing, lighting, camera framing and background.',
    'Do not beautify, slim, reshape or retouch the face. Do not add makeup, accessories, text, logos or borders.',
    'Photorealistic, natural light, same aspect ratio as the original photo.',
  ].join('\n');
}

interface ImagePart {
  type?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  inlineData?: { data?: string; mimeType?: string };
}

/** Finds the first image in an Interactions (or legacy generateContent) response. */
export function findImage(body: unknown): { data: string; mime: string } | null {
  const stack: unknown[] = [body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    const part = node as ImagePart;
    if (part.type === 'image' && typeof part.data === 'string' && part.data.length > 0) {
      return { data: part.data, mime: part.mime_type ?? part.mimeType ?? 'image/png' };
    }
    if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')) {
      return { data: part.inlineData.data, mime: part.inlineData.mimeType };
    }
    for (const value of Object.values(node)) stack.push(value);
  }
  return null;
}

export function createGeminiRunner(config: ServerConfig): PreviewRunner {
  return async (input, signal) => {
    let response: Response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: { 'x-goog-api-key': config.geminiApiKey ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.imageModel,
          store: false,
          input: [
            { type: 'image', mime_type: input.image.mime, data: input.image.base64 },
            { type: 'text', text: previewPrompt(input) },
          ],
          response_format: { type: 'image', mime_type: 'image/jpeg' },
        }),
        signal,
      });
    } catch {
      if (signal.aborted) throw new ModelError('provider_timeout', 'La vista previa tardó demasiado.', true);
      throw new ModelError('provider_unavailable', 'No se pudo conectar con el servicio de imágenes.', true);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ModelError('provider_auth', 'El servidor no puede autenticarse con el servicio de imágenes.', false);
    }
    if (response.status === 429) {
      throw new ModelError('provider_rate_limited', 'El servicio de imágenes está recibiendo demasiadas peticiones.', true);
    }
    if (response.status >= 500) {
      throw new ModelError('provider_unavailable', 'El servicio de imágenes no está disponible ahora mismo.', true);
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ModelError('preview_failed', 'El servicio de imágenes rechazó la petición.', false);
    }
    const image = findImage(body);
    if (!image) {
      throw new ModelError('preview_failed', 'El servicio de imágenes no devolvió ninguna imagen para esta foto.', true);
    }
    // Trust the bytes, not the declared type.
    const head = Uint8Array.from(atob(image.data.slice(0, 64)), (char) => char.charCodeAt(0));
    const format = detectFormat(head);
    const mime = (format ? ACCEPTED_FORMATS[format] : image.mime) as PreviewResult['mime'];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      throw new ModelError('preview_failed', 'El servicio de imágenes devolvió un formato inesperado.', true);
    }
    return { mime, data: image.data, model: config.imageModel };
  };
}

// ------------------------------------------------------------- request

export interface ValidPreview {
  input: PreviewInput;
}

const fail = (code: ErrorBody['code'], message: string): { ok: false; error: ErrorBody } => ({
  ok: false,
  error: { type: 'error', code, message, retryable: false },
});

export async function readPreviewUpload(request: Request): Promise<{ ok: true; value: PreviewInput } | { ok: false; error: ErrorBody }> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    return fail('invalid_request', 'La petición debe enviarse como multipart/form-data.');
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('invalid_request', 'No se pudo leer el formulario enviado.');
  }
  if (form.get('consent') !== 'accepted') {
    return fail('consent_required', 'Hace falta aceptar el envío de la foto al servicio de imágenes.');
  }
  const styleId = form.get('styleId');
  if (typeof styleId !== 'string' || !getStyle(styleId)) return fail('invalid_request', 'Corte desconocido.');
  const variantName = form.get('variantName');
  const instructions = form.get('instructions');
  if (typeof variantName !== 'string' || variantName.trim().length === 0 || variantName.length > 120) {
    return fail('invalid_request', 'Falta el nombre del corte.');
  }
  if (typeof instructions !== 'string' || instructions.length > 2000) {
    return fail('invalid_request', 'Las indicaciones del corte no son válidas.');
  }
  const rawTexture = form.get('texture');
  const texture = typeof rawTexture === 'string' && (TEXTURES as readonly string[]).includes(rawTexture) ? (rawTexture as Texture) : null;

  const file = form.get('frontal');
  if (!(file instanceof Blob) || file.size === 0) return fail('invalid_image', 'Falta la foto frontal.');
  if (file.size > IMAGE_LIMITS.maxUploadBytes) return fail('image_too_large', 'La foto frontal es demasiado grande.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) return fail('unsupported_type', 'La foto frontal no es un JPEG, PNG ni WebP válido.');
  if (Math.min(sniffed.width, sniffed.height) < IMAGE_LIMITS.minShortSide) return fail('invalid_image', 'La foto frontal es demasiado pequeña.');

  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    ok: true,
    value: {
      image: { mime: sniffed.mime as ModelImage['mime'], base64: btoa(binary) },
      styleId,
      variantName: variantName.trim(),
      instructions: instructions.trim(),
      texture,
    },
  };
}
