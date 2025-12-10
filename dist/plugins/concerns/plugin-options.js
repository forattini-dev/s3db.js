const NULLISH = Symbol('nullish');
function pickOr(value, fallback = null) {
    return value === undefined ? fallback : value;
}
function ensureAssigned(context, key, value) {
    if (!context || typeof context !== 'object')
        return;
    if (value === NULLISH) {
        if (context[key] === undefined) {
            context[key] = null;
        }
        return;
    }
    context[key] = value;
}
export function normalizePluginOptions(plugin, options = {}, fallback = {}) {
    const logLevel = pickOr(options.logLevel, pickOr(fallback.logLevel, 'info'));
    const normalized = {
        ...options,
        logLevel,
        resources: pickOr(options.resources, pickOr(fallback.resources, NULLISH)),
        database: pickOr(options.database, pickOr(fallback.database, NULLISH)),
        client: pickOr(options.client, pickOr(fallback.client, NULLISH))
    };
    if (normalized.resources === NULLISH)
        normalized.resources = null;
    if (normalized.database === NULLISH)
        normalized.database = null;
    if (normalized.client === NULLISH)
        normalized.client = null;
    ensureAssigned(plugin, 'logLevel', normalized.logLevel);
    ensureAssigned(plugin, 'resources', normalized.resources === null ? NULLISH : normalized.resources);
    ensureAssigned(plugin, 'database', normalized.database === null ? NULLISH : normalized.database);
    ensureAssigned(plugin, 'client', normalized.client === null ? NULLISH : normalized.client);
    return normalized;
}
export default normalizePluginOptions;
//# sourceMappingURL=plugin-options.js.map