export function normalizeRateLimitRules(rules, logger) {
    if (!Array.isArray(rules) || rules.length === 0) {
        return [];
    }
    const normalized = [];
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
//# sourceMappingURL=normalize-ratelimit.js.map