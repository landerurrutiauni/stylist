import { getStyle, type FigureSpec } from '../../shared/catalog/styles.ts';
import { TEXTURES, type Texture } from '../../shared/schema/answers.ts';
import type { ErrorBody } from '../../shared/schema/events.ts';
import { ACCEPTED_FORMATS, detectFormat, IMAGE_LIMITS, sniffImage } from '../../shared/imageSniff.ts';
import type { ServerConfig } from './config.ts';
import { ModelError, type ModelImage } from './model.ts';

/**
 * The hairstyle preview: the person's own frontal photo edited by an image
 * model so only the hair changes. Claude analyses but does not generate
 * images, so this step uses an image model, called from the server with
 * credentials the browser never sees:
 *
 * - Cloudflare Workers AI with FLUX.2 [klein] (default): free daily
 *   allocation; Cloudflare does not keep inputs or outputs after the request
 *   and does not train on them. Input photos must be at most 512 px.
 * - Google's Gemini API (Nano Banana): paid image models. Requests set
 *   `store: false`; Google's abuse monitoring still applies.
 *
 * Each preview is requested explicitly by the person, after a consent that
 * names the service (see docs/PRIVACY.md).
 */

export type PreviewView = 'front' | 'profile';

export interface PreviewInput {
  image: ModelImage;
  /** Which photo this is: the frontal one or the profile one. */
  view: PreviewView;
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

const LENGTH_HINT: Record<FigureSpec['length'], string> = {
  crown: 'Very short hair: nothing longer than a few centimetres, the ears, temples and back of the neck fully visible. Remove all longer hair.',
  ear: 'Short hair: no hair falls below the ears. Remove all longer hair.',
  cheek: 'The longest hair reaches the cheekbones and nothing touches the shoulders.',
  jaw: 'The hair ends at the jawline and nothing reaches the shoulders.',
  chin: 'The hair ends at the chin and nothing reaches the shoulders.',
  nape: 'The hair ends at the nape of the neck and nothing reaches the shoulders.',
  shoulder: 'The hair reaches the shoulders.',
  collarbone: 'The hair reaches the collarbones.',
  chest: 'Long hair reaching the chest.',
  back: 'Very long hair reaching the back.',
};

const TEXTURE_WORDS: Record<Exclude<Texture, 'unsure'>, string> = {
  straight: 'straight',
  wavy: 'wavy',
  curly: 'curly',
  coily: 'tightly coiled',
};

/**
 * The instruction for the image model: short, in English, the new cut first
 * and how much hair must go, so a small model does not keep the old hair.
 * Gemini also gets the personalised Spanish brief; FLUX does not read it well.
 */
export function previewPrompt(input: PreviewInput, provider: 'cloudflare' | 'google' = 'cloudflare'): string {
  const style = getStyle(input.styleId);
  const look = style?.look ?? input.variantName;
  const lines = [
    input.view === 'profile'
      ? `This is a side-view (profile) photo of a person. Change their hairstyle to ${look}. Show the new haircut from the side, keeping the profile pose.`
      : `Change the hairstyle of the person in this photo to ${look}.`,
  ];
  if (style && !style.figure.bun) lines.push(LENGTH_HINT[style.figure.length]);
  // Texture only matters once the hair is long enough to show it, and only when the cut does not set it.
  const shortCut = style && (style.figure.length === 'crown' || style.figure.length === 'ear');
  const cutSetsTexture = style && (style.figure.texture === 'curly' || style.figure.texture === 'coily' || style.figure.texture === 'braids');
  if (input.texture && input.texture !== 'unsure' && !shortCut && !cutSetsTexture) {
    lines.push(`The hair has the person's natural ${TEXTURE_WORDS[input.texture]} texture.`);
  }
  lines.push(
    "Keep the person's natural hair colour.",
    'Keep the same person: the same face, facial features, skin, facial hair, expression, head pose, clothing, background and lighting. Change only the hair.',
    'Photorealistic photograph.',
  );
  if (provider === 'google') {
    lines.push(`Personalised name of the cut, in Spanish: "${input.variantName}". Salon brief, in Spanish: ${input.instructions}`);
  }
  return lines.join('\n');
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
            { type: 'text', text: previewPrompt(input, 'google') },
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

const CLOUDFLARE_ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts';

/** Longest side of the photo the browser sends: Cloudflare's FLUX.2 takes inputs up to 512 px. */
export function previewMaxSide(config: ServerConfig): number {
  return config.imageProvider === 'cloudflare' ? 512 : IMAGE_LIMITS.maxLongSide;
}

export function previewModelName(config: ServerConfig): string | null {
  if (config.imageProvider === 'cloudflare') return config.cloudflareImageModel;
  if (config.imageProvider === 'google') return config.imageModel;
  return null;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Output size: the input's proportions, 768 px on the long side, in steps of 16. */
export function outputSize(width: number, height: number): { width: number; height: number } {
  const scale = 768 / Math.max(width, height);
  const round = (value: number) => Math.max(256, Math.round((value * scale) / 16) * 16);
  return { width: round(width), height: round(height) };
}

export function createCloudflareRunner(config: ServerConfig): PreviewRunner {
  return async (input, signal) => {
    const bytes = Uint8Array.from(atob(input.image.base64), (char) => char.charCodeAt(0));
    const size = sniffImage(bytes);
    if (!size || Math.max(size.width, size.height) > 512) {
      throw new ModelError('preview_failed', 'La foto para la simulación debe medir como máximo 512 px por lado.', false);
    }
    const form = new FormData();
    form.append('prompt', previewPrompt(input, 'cloudflare'));
    form.append('input_image_0', new Blob([bytes], { type: input.image.mime }), 'frontal.jpg');
    const out = outputSize(size.width, size.height);
    form.append('width', String(out.width));
    form.append('height', String(out.height));

    let response: Response;
    try {
      response = await fetch(`${CLOUDFLARE_ENDPOINT}/${config.cloudflareAccountId}/ai/run/${config.cloudflareImageModel}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.cloudflareApiToken ?? ''}` },
        body: form,
        signal,
      });
    } catch {
      if (signal.aborted) throw new ModelError('provider_timeout', 'La vista previa tardó demasiado.', true);
      throw new ModelError('provider_unavailable', 'No se pudo conectar con el servicio de imágenes.', true);
    }

    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.startsWith('image/')) {
      const data = new Uint8Array(await response.arrayBuffer());
      const format = detectFormat(data);
      if (!format) throw new ModelError('preview_failed', 'El servicio de imágenes devolvió un formato inesperado.', true);
      return { mime: ACCEPTED_FORMATS[format] as PreviewResult['mime'], data: base64(data), model: config.cloudflareImageModel };
    }

    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      result?: { image?: string };
      errors?: { code?: number; message?: string }[];
    } | null;
    const detail = (body?.errors ?? []).map((error) => `${error.code ?? ''} ${error.message ?? ''}`).join(' ');
    if (response.status === 401 || response.status === 403) {
      throw new ModelError('provider_auth', 'El servidor no puede autenticarse con el servicio de imágenes.', false);
    }
    if (response.status === 429 || /neuron|allocation|quota|rate limit/i.test(detail)) {
      throw new ModelError('provider_rate_limited', 'Se ha agotado la cuota gratuita de simulaciones de hoy. Vuelve a intentarlo mañana.', true);
    }
    if (response.status >= 500) {
      throw new ModelError('provider_unavailable', 'El servicio de imágenes no está disponible ahora mismo.', true);
    }
    const image = body?.result?.image;
    if (!response.ok || !image) {
      throw new ModelError('preview_failed', 'El servicio de imágenes no devolvió ninguna imagen para esta foto.', response.ok);
    }
    const head = Uint8Array.from(atob(image.slice(0, 64)), (char) => char.charCodeAt(0));
    const format = detectFormat(head);
    if (!format) throw new ModelError('preview_failed', 'El servicio de imágenes devolvió un formato inesperado.', true);
    return { mime: ACCEPTED_FORMATS[format] as PreviewResult['mime'], data: image, model: config.cloudflareImageModel };
  };
}

/** The configured image service, or null when none is set up. */
export function createPreviewRunner(config: ServerConfig): PreviewRunner | null {
  if (config.imageProvider === 'cloudflare') return createCloudflareRunner(config);
  if (config.imageProvider === 'google') return createGeminiRunner(config);
  return null;
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

  const rawView = form.get('view');
  if (rawView !== null && rawView !== 'front' && rawView !== 'profile') return fail('invalid_request', 'Vista desconocida.');
  const view: PreviewView = rawView === 'profile' ? 'profile' : 'front';
  const label = view === 'profile' ? 'de perfil' : 'frontal';
  // `photo` carries the picture; older clients sent the frontal one as `frontal`.
  const file = form.get('photo') ?? (view === 'front' ? form.get('frontal') : null);
  if (!(file instanceof Blob) || file.size === 0) return fail('invalid_image', `Falta la foto ${label}.`);
  if (file.size > IMAGE_LIMITS.maxUploadBytes) return fail('image_too_large', `La foto ${label} es demasiado grande.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) return fail('unsupported_type', `La foto ${label} no es un JPEG, PNG ni WebP válido.`);
  // Previews may use a reduced copy of the photo (512 px for Cloudflare).
  if (Math.min(sniffed.width, sniffed.height) < 256) return fail('invalid_image', `La foto ${label} es demasiado pequeña.`);

  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    ok: true,
    value: {
      image: { mime: sniffed.mime as ModelImage['mime'], base64: btoa(binary) },
      view,
      styleId,
      variantName: variantName.trim(),
      instructions: instructions.trim(),
      texture,
    },
  };
}
