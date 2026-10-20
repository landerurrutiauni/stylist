import { createHandler } from '../core/handler.ts';
import { MemoryRateLimiter, SupabaseRateLimiter, type RateLimiter } from '../core/rateLimit.ts';

/**
 * Entry point for the Supabase Edge Function `folia-analyze`. `npm run build:edge`
 * bundles this file and its imports into dist-edge/folia-analyze/index.js.
 *
 * Secrets (set with `supabase secrets set` or in the dashboard):
 *   ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ALLOWED_ORIGINS, RATE_LIMIT_SALT …
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const env = Deno.env.toObject();

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
