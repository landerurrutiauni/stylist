/**
 * Fixed-window rate limiting. Keys are hashes, never raw IP addresses.
 *
 * `MemoryRateLimiter` counts inside one server process: enough for local
 * development and a single Node instance, but every serverless instance has
 * its own memory, so on the edge it is only a first barrier. `SupabaseRateLimiter`
 * keeps the counters in Postgres through an RPC so all instances share them.
 */

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number): Promise<RateDecision>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    const now = this.now();
    const windowMs = windowSeconds * 1000;
    const current = this.windows.get(key);
    if (!current || now - current.start >= windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      this.prune(now, windowMs);
      return { allowed: true, retryAfter: windowSeconds };
    }
    const retryAfter = Math.ceil((current.start + windowMs - now) / 1000);
    if (current.count >= limit) return { allowed: false, retryAfter };
    current.count += 1;
    return { allowed: true, retryAfter };
  }

  private prune(now: number, windowMs: number) {
    if (this.windows.size < 5000) return;
    for (const [key, value] of this.windows) {
      if (now - value.start >= windowMs) this.windows.delete(key);
    }
  }
}

/**
 * Calls the `folia_rate_limit_hit` SQL function (see supabase/migrations).
 * If the database is unreachable the request is allowed through and the
 * in-memory limiter still applies: an outage of the counter must not take the
 * service down.
 */
export class SupabaseRateLimiter implements RateLimiter {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly fallback: RateLimiter = new MemoryRateLimiter(),
  ) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    const local = await this.fallback.hit(key, limit, windowSeconds);
    if (!local.allowed) return local;
    try {
      const response = await fetch(`${this.url}/rest/v1/rpc/folia_rate_limit_hit`, {
        method: 'POST',
        headers: {
          apikey: this.serviceKey,
          authorization: `Bearer ${this.serviceKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return local;
      const rows = (await response.json()) as { allowed: boolean; retry_after: number }[] | { allowed: boolean; retry_after: number };
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return local;
      return { allowed: Boolean(row.allowed), retryAfter: Math.max(1, Number(row.retry_after) || windowSeconds) };
    } catch {
      return local;
    }
  }
}

export async function hashKey(value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? request.headers.get('cf-connecting-ip') ?? 'unknown';
}
