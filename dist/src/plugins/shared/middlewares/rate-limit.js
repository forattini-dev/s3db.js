export function createRateLimitMiddleware(config = {}) {
    const { windowMs = 60000, maxRequests = 100, keyGenerator = null } = config;
    const requests = new Map();
    return async (c, next) => {
        const key = keyGenerator
            ? keyGenerator(c)
            : c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
        if (!requests.has(key)) {
            requests.set(key, { count: 0, resetAt: Date.now() + windowMs });
        }
        const record = requests.get(key);
        if (Date.now() > record.resetAt) {
            record.count = 0;
            record.resetAt = Date.now() + windowMs;
        }
        if (record.count >= maxRequests) {
            const retryAfter = Math.ceil((record.resetAt - Date.now()) / 1000);
            c.header('Retry-After', retryAfter.toString());
            c.header('X-RateLimit-Limit', maxRequests.toString());
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
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', (maxRequests - record.count).toString());
        c.header('X-RateLimit-Reset', record.resetAt.toString());
        await next();
    };
}
//# sourceMappingURL=rate-limit.js.map