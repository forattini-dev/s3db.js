import type { Logger } from '../../../concerns/logger.js';
import type { Context } from 'hono';

export interface RawRateLimitRule {
  path?: string;
  pattern?: string;
  windowMs?: number;
  maxRequests?: number;
  maxUniqueKeys?: number;
  key?: string;
  scope?: string;
  keyHeader?: string;
  header?: string;
  keyGenerator?: ((c: Context) => string) | null;
}

export interface NormalizedRateLimitRule {
  id: string;
  pattern: string;
  windowMs?: number;
  maxRequests?: number;
  maxUniqueKeys?: number;
  key: string;
  keyHeader: string;
  keyGenerator: ((c: Context) => string) | null;
}

export function normalizeRateLimitRules(rules: RawRateLimitRule[] | null | undefined, logger: Logger | null): NormalizedRateLimitRule[] {
  if (!Array.isArray(rules) || rules.length === 0) {
    return [];
  }

  const normalized: NormalizedRateLimitRule[] = [];
  const logLevel = logger?.level || 'info';

  rules.forEach((rawRule, index) => {
    if (!rawRule || typeof rawRule !== 'object') {
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger?.warn({ rawRule }, 'Ignoring rateLimit rule (expected object)');
      }
      return;
    }

    let pattern = rawRule.path || rawRule.pattern;
    if (typeof pattern !== 'string' || !pattern.trim()) {
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger?.warn({ index: index }, 'rateLimit.rules[] missing path/pattern');
      }
      return;
    }

    pattern = pattern.trim();
    if (!pattern.startsWith('/')) {
      pattern = `/${pattern.replace(/^\/*/, '')}`;
    }

    normalized.push({
      id: `rate-limit-${index}-${pattern}`,
      pattern,
      windowMs: typeof rawRule.windowMs === 'number' ? rawRule.windowMs : undefined,
      maxRequests: typeof rawRule.maxRequests === 'number' ? rawRule.maxRequests : undefined,
      maxUniqueKeys: typeof rawRule.maxUniqueKeys === 'number' ? rawRule.maxUniqueKeys : undefined,
      key: rawRule.key || rawRule.scope || 'ip',
      keyHeader: rawRule.keyHeader || rawRule.header || 'x-api-key',
      keyGenerator: typeof rawRule.keyGenerator === 'function' ? rawRule.keyGenerator : null
    });
  });

  return normalized;
}
