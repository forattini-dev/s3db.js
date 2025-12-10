import { getCronManager } from '../../../concerns/cron-manager.js';
export class RateLimitStore {
    store;
    cleanupInterval;
    windowMs;
    cronManager;
    cleanupJobName;
    constructor(options = {}) {
        this.store = new Map();
        this.cleanupInterval = options.cleanupInterval || 60000;
        this.windowMs = options.windowMs || 60000;
        this.cronManager = getCronManager();
        this.cleanupJobName = `rate-limit-cleanup-${Date.now()}`;
        this.cronManager.scheduleInterval(this.cleanupInterval, () => this.cleanup(), this.cleanupJobName);
    }
    record(key) {
        const now = Date.now();
        const cutoff = now - this.windowMs;
        if (!this.store.has(key)) {
            this.store.set(key, { attempts: [] });
        }
        const entry = this.store.get(key);
        entry.attempts = entry.attempts.filter(timestamp => timestamp > cutoff);
        entry.attempts.push(now);
        return entry.attempts.length;
    }
    getCount(key) {
        if (!this.store.has(key)) {
            return 0;
        }
        const now = Date.now();
        const cutoff = now - this.windowMs;
        const entry = this.store.get(key);
        entry.attempts = entry.attempts.filter(timestamp => timestamp > cutoff);
        return entry.attempts.length;
    }
    reset(key) {
        this.store.delete(key);
    }
    getRetryAfter(key) {
        if (!this.store.has(key)) {
            return 0;
        }
        const entry = this.store.get(key);
        if (entry.attempts.length === 0) {
            return 0;
        }
        const oldestAttempt = entry.attempts[0];
        const expiresAt = oldestAttempt + this.windowMs;
        const now = Date.now();
        return Math.max(0, expiresAt - now);
    }
    cleanup() {
        const now = Date.now();
        const cutoff = now - this.windowMs;
        for (const [key, entry] of this.store.entries()) {
            entry.attempts = entry.attempts.filter(timestamp => timestamp > cutoff);
            if (entry.attempts.length === 0) {
                this.store.delete(key);
            }
        }
    }
    stop() {
        if (this.cleanupJobName) {
            this.cronManager.stop(this.cleanupJobName);
            this.cleanupJobName = null;
        }
    }
    getStats() {
        return {
            totalKeys: this.store.size,
            totalAttempts: Array.from(this.store.values()).reduce((sum, entry) => sum + entry.attempts.length, 0)
        };
    }
}
export function createDriverRateLimiter(config = {}) {
    const { windowMs = 60000, maxAttempts = 200, keyPrefix = 'ratelimit', keyGenerator = null, skipSuccessfulRequests = false, handler = null, enabled = true } = config;
    if (!enabled) {
        return async (_c, next) => await next();
    }
    const store = new RateLimitStore({ windowMs });
    return async (c, next) => {
        let key;
        if (keyGenerator && typeof keyGenerator === 'function') {
            key = await keyGenerator(c);
        }
        else {
            const ip = c.req.header('x-forwarded-for') ||
                c.req.header('x-real-ip') ||
                'unknown';
            key = `${keyPrefix}:${ip}`;
        }
        const currentCount = store.getCount(key);
        if (currentCount >= maxAttempts) {
            const retryAfter = store.getRetryAfter(key);
            const retryAfterSeconds = Math.ceil(retryAfter / 1000);
            c.header('Retry-After', String(retryAfterSeconds));
            c.header('X-RateLimit-Limit', String(maxAttempts));
            c.header('X-RateLimit-Remaining', '0');
            c.header('X-RateLimit-Reset', String(Date.now() + retryAfter));
            if (handler && typeof handler === 'function') {
                return handler(c, { retryAfter: retryAfterSeconds });
            }
            return c.json({
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
                retryAfter: retryAfterSeconds
            }, 429);
        }
        if (!skipSuccessfulRequests) {
            store.record(key);
        }
        const previousUser = c.get('user');
        await next();
        if (skipSuccessfulRequests) {
            const currentUser = c.get('user');
            if (!currentUser && !previousUser) {
                store.record(key);
            }
        }
        const remaining = Math.max(0, maxAttempts - store.getCount(key));
        c.header('X-RateLimit-Limit', String(maxAttempts));
        c.header('X-RateLimit-Remaining', String(remaining));
    };
}
export function createAuthDriverRateLimiter(driver, config = {}) {
    const defaults = {
        oidc: {
            windowMs: 60000,
            maxAttempts: 200,
            keyPrefix: 'auth:oidc',
            skipSuccessfulRequests: true
        },
        jwt: {
            windowMs: 60000,
            maxAttempts: 200,
            keyPrefix: 'auth:jwt',
            skipSuccessfulRequests: false
        },
        basic: {
            windowMs: 60000,
            maxAttempts: 200,
            keyPrefix: 'auth:basic',
            skipSuccessfulRequests: true
        },
        apikey: {
            windowMs: 60000,
            maxAttempts: 100,
            keyPrefix: 'auth:apikey',
            skipSuccessfulRequests: false
        }
    };
    const driverDefaults = defaults[driver] || defaults.basic;
    const finalConfig = { ...driverDefaults, ...config };
    return createDriverRateLimiter(finalConfig);
}
export default {
    createDriverRateLimiter,
    createAuthDriverRateLimiter,
    RateLimitStore
};
//# sourceMappingURL=rate-limit.js.map