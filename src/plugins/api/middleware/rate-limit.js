import { findBestMatch } from '../utils/path-matcher.js';

/**
 * Create rate limiting middleware
 * @param {object} rateLimitConfig - Rate limit configuration object
 * @returns {function} Hono middleware
 */
export async function createRateLimitMiddleware(rateLimitConfig) {
  const defaultStore = new Map();
  const ruleStores = new Map();
  const { windowMs, maxRequests, keyGenerator, maxUniqueKeys, rules = [] } = rateLimitConfig;
  const hasRules = Array.isArray(rules) && rules.length > 0;
  const ruleKeyGenerators = new Map();

  const getClientIp = (c) => {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const cfConnecting = c.req.header('cf-connecting-ip');
    if (cfConnecting) {
      return cfConnecting;
    }
    return c.req.raw?.socket?.remoteAddress || 'unknown';
  };

  const getRuleForPath = (path) => {
    if (!hasRules) return null;
    return findBestMatch(rules, path) || null;
  };

  const getStoreForRule = (rule) => {
    if (!rule) return defaultStore;
    if (!ruleStores.has(rule.id)) {
      ruleStores.set(rule.id, new Map());
    }
    return ruleStores.get(rule.id);
  };

  const getRuleKeyGenerator = (rule) => {
    if (!rule) return null;
    if (ruleKeyGenerators.has(rule.id)) {
      return ruleKeyGenerators.get(rule.id);
    }

    let generator = null;
    if (typeof rule.keyGenerator === 'function') {
      generator = rule.keyGenerator;
    } else {
      const keyType = (rule.key || 'ip').toLowerCase();
      if (keyType === 'user') {
        generator = (c) => c.get('user')?.id || c.get('user')?.email || getClientIp(c) || 'anonymous';
      } else if (keyType === 'apikey' || keyType === 'api-key') {
        const headerName = (rule.keyHeader || 'x-api-key').toLowerCase();
        generator = (c) => c.req.header(headerName) || getClientIp(c) || 'unknown';
      } else {
        generator = (c) => getClientIp(c) || 'unknown';
      }
    }

    ruleKeyGenerators.set(rule.id, generator);
    return generator;
  };

  return async (c, next) => {
    const currentPath = c.req.path || '/';
    const matchedRule = getRuleForPath(currentPath);
    const bucket = getStoreForRule(matchedRule);
    const effectiveWindow = matchedRule?.windowMs ?? windowMs;
    const effectiveLimit = matchedRule?.maxRequests ?? maxRequests;
    const effectiveMaxKeys = matchedRule?.maxUniqueKeys ?? maxUniqueKeys;
    const generator = matchedRule ? getRuleKeyGenerator(matchedRule) : keyGenerator;

    // Generate key (IP or custom)
    const keySource = typeof generator === 'function' ? generator(c) : getClientIp(c);
    const key = keySource || 'unknown';

    let record = bucket.get(key);

    // Reset expired records to prevent unbounded memory growth
    if (record && Date.now() > record.resetAt) {
      bucket.delete(key);
      record = null;
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

    // Check limit
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

    // Increment count
    record.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', effectiveLimit.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, effectiveLimit - record.count).toString());
    c.header('X-RateLimit-Reset', record.resetAt.toString());

    await next();
  };
}
