import type { Context, Next } from 'hono';
import { findBestMatch } from '../utils/path-matcher.js';

export interface RateLimitRule {
  id: string;
  pattern: string;
  windowMs?: number;
  maxRequests?: number;
  maxUniqueKeys?: number;
  key?: string;
  keyHeader?: string;
  keyGenerator?: ((c: Context) => string) | null;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  maxUniqueKeys: number;
  keyGenerator?: (c: Context) => string;
  rules?: RateLimitRule[];
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

type KeyGeneratorFn = (c: Context) => string;

export async function createRateLimitMiddleware(
  rateLimitConfig: RateLimitConfig
): Promise<(c: Context, next: Next) => Promise<Response | void>> {
  const defaultStore = new Map<string, RateLimitRecord>();
  const ruleStores = new Map<string, Map<string, RateLimitRecord>>();
  const { windowMs, maxRequests, keyGenerator, maxUniqueKeys, rules = [] } = rateLimitConfig;
  const hasRules = Array.isArray(rules) && rules.length > 0;
  const ruleKeyGenerators = new Map<string, KeyGeneratorFn>();

  const getClientIp = (c: Context): string => {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0]!.trim();
    }
    const cfConnecting = c.req.header('cf-connecting-ip');
    if (cfConnecting) {
      return cfConnecting;
    }
    return (c.req.raw as { socket?: { remoteAddress?: string } })?.socket?.remoteAddress || 'unknown';
  };

  const getRuleForPath = (path: string): RateLimitRule | null => {
    if (!hasRules) return null;
    return findBestMatch(rules as unknown as Parameters<typeof findBestMatch>[0], path) as RateLimitRule | null;
  };

  const getStoreForRule = (rule: RateLimitRule | null): Map<string, RateLimitRecord> => {
    if (!rule) return defaultStore;
    if (!ruleStores.has(rule.id)) {
      ruleStores.set(rule.id, new Map<string, RateLimitRecord>());
    }
    return ruleStores.get(rule.id)!;
  };

  const getRuleKeyGenerator = (rule: RateLimitRule): KeyGeneratorFn | null => {
    if (ruleKeyGenerators.has(rule.id)) {
      return ruleKeyGenerators.get(rule.id)!;
    }

    let generator: KeyGeneratorFn | null = null;
    if (typeof rule.keyGenerator === 'function') {
      generator = rule.keyGenerator;
    } else {
      const keyType = (rule.key || 'ip').toLowerCase();
      if (keyType === 'user') {
        generator = (c: Context) => {
          const user = c.get('user') as { id?: string; email?: string } | undefined;
          return user?.id || user?.email || getClientIp(c) || 'anonymous';
        };
      } else if (keyType === 'apikey' || keyType === 'api-key') {
        const headerName = (rule.keyHeader || 'x-api-key').toLowerCase();
        generator = (c: Context) => c.req.header(headerName) || getClientIp(c) || 'unknown';
      } else {
        generator = (c: Context) => getClientIp(c) || 'unknown';
      }
    }

    ruleKeyGenerators.set(rule.id, generator!);
    return generator;
  };

  return async (c: Context, next: Next): Promise<Response | void> => {
    const currentPath = c.req.path || '/';
    const matchedRule = getRuleForPath(currentPath);
    const bucket = getStoreForRule(matchedRule);
    const effectiveWindow = matchedRule?.windowMs ?? windowMs;
    const effectiveLimit = matchedRule?.maxRequests ?? maxRequests;
    const effectiveMaxKeys = matchedRule?.maxUniqueKeys ?? maxUniqueKeys;
    const generator = matchedRule ? getRuleKeyGenerator(matchedRule) : keyGenerator;

    const keySource = typeof generator === 'function' ? generator(c) : getClientIp(c);
    const key = keySource || 'unknown';

    let record = bucket.get(key);

    if (record && Date.now() > record.resetAt) {
      bucket.delete(key);
      record = undefined;
    }

    if (!record) {
      record = { count: 0, resetAt: Date.now() + effectiveWindow };
      bucket.set(key, record);
      if (bucket.size > effectiveMaxKeys) {
        const oldestKey = bucket.keys().next().value;
        if (oldestKey) {
          bucket.delete(oldestKey);
        }
      }
    }

    if (record.count >= effectiveLimit) {
      const retryAfter = Math.ceil((record.resetAt - Date.now()) / 1000);
      c.header('Retry-After', retryAfter.toString());
      c.header('X-RateLimit-Limit', effectiveLimit.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', record.resetAt.toString());

      return c.json({
        success: false,
        error: {
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          details: { retryAfter }
        }
      }, 429);
    }

    record.count++;

    c.header('X-RateLimit-Limit', effectiveLimit.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, effectiveLimit - record.count).toString());
    c.header('X-RateLimit-Reset', record.resetAt.toString());

    await next();
  };
}
