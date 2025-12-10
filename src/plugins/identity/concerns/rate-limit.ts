/**
 * Sliding window rate limiter for IP-based throttling
 */

import type { Context, Next } from 'hono';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

interface Bucket {
  count: number;
  expiresAt: number;
}

export class RateLimiter {
  private windowMs: number;
  private max: number;
  private buckets: Map<string, Bucket>;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 60000;
    this.max = options.max ?? 10;
    this.buckets = new Map();
  }

  consume(key: string): RateLimitResult {
    if (!this.enabled()) {
      return { allowed: true, remaining: Infinity, retryAfter: 0 };
    }

    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.expiresAt <= now) {
      const expiresAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, expiresAt });
      this._prune(now);
      return {
        allowed: true,
        remaining: Math.max(this.max - 1, 0),
        retryAfter: 0
      };
    }

    if (bucket.count < this.max) {
      bucket.count += 1;
      this._prune(now);
      return {
        allowed: true,
        remaining: Math.max(this.max - bucket.count, 0),
        retryAfter: 0
      };
    }

    const retryAfterMs = bucket.expiresAt - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(Math.ceil(retryAfterMs / 1000), 1)
    };
  }

  enabled(): boolean {
    return this.max > 0 && this.windowMs > 0;
  }

  private _prune(now: number): void {
    if (this.buckets.size > 5000) {
      for (const [key, bucket] of this.buckets.entries()) {
        if (bucket.expiresAt <= now) {
          this.buckets.delete(key);
        }
      }
    }
  }
}

export function createJsonRateLimitMiddleware(
  limiter: RateLimiter,
  getKey: (c: Context) => string
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next) => {
    const key = getKey(c);
    const result = limiter.consume(key);

    if (result.allowed) {
      return await next();
    }

    c.header('Retry-After', String(result.retryAfter));
    return c.json({
      error: 'too_many_requests',
      error_description: `Too many requests. Try again in ${result.retryAfter} seconds.`
    }, 429);
  };
}

export function createRedirectRateLimitMiddleware(
  limiter: RateLimiter,
  getKey: (c: Context) => string,
  buildRedirectUrl: (retryAfter: number) => string
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next) => {
    const key = getKey(c);
    const result = limiter.consume(key);

    if (result.allowed) {
      return await next();
    }

    const url = buildRedirectUrl(result.retryAfter);
    return c.redirect(url, 302);
  };
}

export default RateLimiter;
