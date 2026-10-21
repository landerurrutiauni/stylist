/**
 * Server configuration, read from environment variables. The handler receives
 * an `Env` object so the same code runs on Node (process.env) and on the
 * Supabase Edge runtime (Deno.env).
 */

export type Env = Record<string, string | undefined>;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ServerConfig {
  apiKey: string | null;
  model: string;
  effort: Effort;
  maxTokens: number;
  timeoutMs: number;
  allowedOrigins: string[];
  requireOrigin: boolean;
  perHour: number;
  perDay: number;
  hashSalt: string;
  /** Server-side fallback on a policy decline (beta `server-side-fallback-2026-07-01`). */
  fallbacks: boolean;
  /** Which service makes the hairstyle preview, if any. */
  imageProvider: ImageProvider | null;
  /** Cloudflare Workers AI (free daily allocation): account, token and model. */
  cloudflareAccountId: string | null;
  cloudflareApiToken: string | null;
  cloudflareImageModel: string;
  /** Google Gemini API (paid image models). */
  geminiApiKey: string | null;
  imageModel: string;
  previewPerHour: number;
  previewPerDay: number;
  previewTimeoutMs: number;
}

export type ImageProvider = 'cloudflare' | 'google';

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Default model: Claude Opus 5.5, which reads images. Override with ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Default image-editing model: Nano Banana 2.1, Google's recommended image model. Override with IMAGE_MODEL. */
export const DEFAULT_IMAGE_MODEL = 'gemini-nano-banana-2.1';

/** Default Cloudflare model: FLUX.2 [klein] 4B, which edits images within the free daily allocation. */
export const DEFAULT_CLOUDFLARE_IMAGE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

/**
 * Cloudflare when its credentials are set (free allocation, no retention),
 * otherwise Google when its key is set. IMAGE_PROVIDER forces one of them.
 */
function imageProvider(env: Env): ImageProvider | null {
  const cloudflare = Boolean(env.CLOUDFLARE_ACCOUNT_ID?.trim() && env.CLOUDFLARE_API_TOKEN?.trim());
  const google = Boolean(env.GEMINI_API_KEY?.trim());
  const forced = env.IMAGE_PROVIDER?.trim();
  if (forced === 'google' && google) return 'google';
  if (forced === 'cloudflare' && cloudflare) return 'cloudflare';
  return cloudflare ? 'cloudflare' : google ? 'google' : null;
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function readConfig(env: Env): ServerConfig {
  const effort = (env.ANTHROPIC_EFFORT ?? '').trim() as Effort;
  const origins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    effort: EFFORTS.includes(effort) ? effort : 'medium',
    maxTokens: int(env.ANTHROPIC_MAX_TOKENS, 24000, 4000, 64000),
    timeoutMs: int(env.ANTHROPIC_TIMEOUT_MS, 120_000, 20_000, 280_000),
    allowedOrigins: origins,
    requireOrigin: (env.REQUIRE_ORIGIN ?? 'true').trim() !== 'false',
    perHour: int(env.RATE_LIMIT_PER_HOUR, 6, 1, 1000),
    perDay: int(env.DAILY_ANALYSIS_LIMIT, 150, 1, 100_000),
    hashSalt: env.RATE_LIMIT_SALT?.trim() || 'folia',
    fallbacks: (env.ANTHROPIC_FALLBACKS ?? 'default').trim() !== 'off',
    imageProvider: imageProvider(env),
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID?.trim() || null,
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN?.trim() || null,
    cloudflareImageModel: env.CLOUDFLARE_IMAGE_MODEL?.trim() || DEFAULT_CLOUDFLARE_IMAGE_MODEL,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
    imageModel: env.IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
    previewPerHour: int(env.PREVIEW_PER_HOUR, 30, 1, 1000),
    previewPerDay: int(env.PREVIEW_DAILY_LIMIT, 200, 1, 100_000),
    previewTimeoutMs: int(env.PREVIEW_TIMEOUT_MS, 90_000, 15_000, 280_000),
  };
}
