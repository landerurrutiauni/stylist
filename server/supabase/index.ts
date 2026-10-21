import { createHandler } from '../core/handler.ts';
import { MemoryRateLimiter, SupabaseRateLimiter, type RateLimiter } from '../core/rateLimit.ts';

/**
 * Entry point for the Supabase Edge Function `folia-analyze`. `npm run build:edge`
 * bundles this file and its imports into supabase/functions/folia-analyze/index.js.
 *
 * Secrets (set with `supabase secrets set` or in the dashboard):
 *   ANTHROPIC_API_KEY, GEMINI_API_KEY, ANTHROPIC_MODEL, ALLOWED_ORIGINS, RATE_LIMIT_SALT …
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const platform = Deno.env.toObject();

// Defaults for this deployment, used only when the secret is not set: the
// published site's origin, and the platform's own secret key as the salt for
// hashing client addresses (it never leaves the function).
const env: Record<string, string | undefined> = {
  ...platform,
  ALLOWED_ORIGINS: platform.ALLOWED_ORIGINS ?? 'https://landerurrutiauni.github.io',
  RATE_LIMIT_SALT: platform.RATE_LIMIT_SALT ?? platform.SUPABASE_SERVICE_ROLE_KEY,
};

function limiter(): RateLimiter {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && env.RATE_LIMIT_STORE !== 'memory') return new SupabaseRateLimiter(url, key);
  return new MemoryRateLimiter();
}

const handle = createHandler({
  env,
  limiter: limiter(),
  log: (entry) => console.log(JSON.stringify(entry)),
});

Deno.serve(handle);
