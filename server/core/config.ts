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
  /** Image model for the hairstyle preview (Google Gemini API). */
  geminiApiKey: string | null;
  imageModel: string;
  previewPerHour: number;
  previewPerDay: number;
  previewTimeoutMs: number;
}

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Default model: Claude Opus 5.5, which reads images. Override with ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Default image-editing model: Nano Banana 2.1, Google's recommended image model. Override with IMAGE_MODEL. */
export const DEFAULT_IMAGE_MODEL = 'gemini-nano-banana-2.1';

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
    geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
    imageModel: env.IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
    previewPerHour: int(env.PREVIEW_PER_HOUR, 10, 1, 1000),
    previewPerDay: int(env.PREVIEW_DAILY_LIMIT, 200, 1, 100_000),
    previewTimeoutMs: int(env.PREVIEW_TIMEOUT_MS, 90_000, 15_000, 280_000),
  };
}
