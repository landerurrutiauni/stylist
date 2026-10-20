import { answersSchema, refinementSchema, type Answers } from '../../shared/schema/answers.ts';
import type { ErrorBody } from '../../shared/schema/events.ts';
import { IMAGE_LIMITS, sniffImage } from '../../shared/imageSniff.ts';
import type { ModelImage } from './model.ts';

export interface ValidUpload {
  frontal: ModelImage;
  profile: ModelImage;
  answers: Answers;
  refinement: string;
  bytes: number;
}

type Field = 'frontal' | 'profile';

const fail = (code: ErrorBody['code'], message: string, field?: Field): { ok: false; error: ErrorBody } => ({
  ok: false,
  error: { type: 'error', code, message, retryable: false, ...(field ? { field } : {}) },
});

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const FIELD_NAMES: Record<Field, string> = { frontal: 'frontal', profile: 'de perfil' };

async function readImage(form: FormData, field: Field) {
  const value = form.get(field);
  if (!(value instanceof Blob)) return fail('invalid_image', `Falta la foto ${FIELD_NAMES[field]}.`, field);
  if (value.size === 0) return fail('invalid_image', `La foto ${FIELD_NAMES[field]} está vacía.`, field);
  if (value.size > IMAGE_LIMITS.maxUploadBytes) {
    return fail('image_too_large', `La foto ${FIELD_NAMES[field]} supera ${IMAGE_LIMITS.maxUploadBytes / 1024 / 1024} MB.`, field);
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    return fail('unsupported_type', `La foto ${FIELD_NAMES[field]} no es un JPEG, PNG ni WebP válido.`, field);
  }
  const shortSide = Math.min(sniffed.width, sniffed.height);
  if (shortSide < IMAGE_LIMITS.minShortSide) {
    return fail(
      'invalid_image',
      `La foto ${FIELD_NAMES[field]} es demasiado pequeña (mínimo ${IMAGE_LIMITS.minShortSide} px en el lado corto).`,
      field,
    );
  }
  if (Math.max(sniffed.width, sniffed.height) > IMAGE_LIMITS.maxDimension) {
    return fail('invalid_image', `La foto ${FIELD_NAMES[field]} supera ${IMAGE_LIMITS.maxDimension} px.`, field);
  }
  const image: ModelImage = { mime: sniffed.mime as ModelImage['mime'], base64: toBase64(bytes) };
  return { ok: true as const, image, size: bytes.length };
}

export async function readUpload(request: Request): Promise<{ ok: true; value: ValidUpload } | { ok: false; error: ErrorBody }> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    return fail('invalid_request', 'La petición debe enviarse como multipart/form-data.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('invalid_request', 'No se pudo leer el formulario enviado.');
  }

  if (form.get('consent') !== 'accepted') {
    return fail('consent_required', 'Hace falta aceptar el tratamiento de las fotos antes de analizarlas.');
  }

  const rawAnswers = form.get('answers');
  if (typeof rawAnswers !== 'string' || rawAnswers.length > 20_000) {
    return fail('invalid_request', 'Faltan las respuestas del cuestionario.');
  }
  let answersJson: unknown;
  try {
    answersJson = JSON.parse(rawAnswers);
  } catch {
    return fail('invalid_request', 'Las respuestas del cuestionario no tienen un formato válido.');
  }
  const answers = answersSchema.safeParse(answersJson);
  if (!answers.success) {
    return fail('invalid_request', 'Las respuestas del cuestionario están incompletas o no son válidas.');
  }

  const rawRefinement = form.get('refinement');
  const refinement = refinementSchema.safeParse(typeof rawRefinement === 'string' ? rawRefinement : '');
  if (!refinement.success) return fail('invalid_request', 'El ajuste pedido es demasiado largo.');

  const frontal = await readImage(form, 'frontal');
  if (!frontal.ok) return frontal;
  const profile = await readImage(form, 'profile');
  if (!profile.ok) return profile;

  return {
    ok: true,
    value: {
      frontal: frontal.image,
      profile: profile.image,
      answers: answers.data,
      refinement: refinement.data,
      bytes: frontal.size + profile.size,
    },
  };
}
