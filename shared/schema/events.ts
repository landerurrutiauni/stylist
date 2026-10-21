import { z } from 'zod';
import { analysisEnvelopeSchema } from './analysis.ts';

/**
 * The analysis endpoint answers with newline-delimited JSON so the browser can
 * show real progress: each line is one of these events.
 */

export const ERROR_CODES = [
  'invalid_request',
  'consent_required',
  'invalid_image',
  'unsupported_type',
  'image_too_large',
  'payload_too_large',
  'origin_not_allowed',
  'rate_limited',
  'daily_limit',
  'missing_api_key',
  'provider_auth',
  'provider_rate_limited',
  'provider_unavailable',
  'provider_timeout',
  'refused',
  'truncated',
  'invalid_model_response',
  'preview_unavailable',
  'preview_failed',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorBodySchema = z.object({
  type: z.literal('error'),
  code: z.enum(ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
  /** Which upload the error is about, when it concerns one photo. */
  field: z.enum(['frontal', 'profile']).optional(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

export const STAGES = ['received', 'observing', 'writing', 'validating'] as const;
export type Stage = (typeof STAGES)[number];

export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), stage: z.enum(STAGES) }),
  z.object({ type: z.literal('progress'), recommendations: z.number().int().min(0) }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('result'), analysis: analysisEnvelopeSchema }),
  errorBodySchema,
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const healthSchema = z.object({
  ok: z.boolean(),
  analysis: z.enum(['available', 'missing_api_key']),
  model: z.string().nullable(),
  /** AI hairstyle preview (image editing) on the person's frontal photo. */
  preview: z.enum(['available', 'missing_api_key']),
  previewModel: z.string().nullable(),
  /** The service that edits the photo, so the consent can name it. */
  previewProvider: z.enum(['cloudflare', 'google']).nullable().default(null),
  /** Longest side, in pixels, of the photo the browser sends for a preview. */
  previewMaxSide: z.number().int().positive().default(1600),
  limits: z.object({
    maxImageBytes: z.number(),
    perHour: z.number(),
    previewsPerHour: z.number(),
  }),
});

export const previewResponseSchema = z.object({
  type: z.literal('preview'),
  styleId: z.string(),
  view: z.enum(['front', 'profile']).default('front'),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(100),
  model: z.string(),
});
export type PreviewResponse = z.infer<typeof previewResponseSchema>;
export type Health = z.infer<typeof healthSchema>;
