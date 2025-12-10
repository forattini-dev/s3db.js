/**
 * Normalize resources configuration for WebSocket plugin
 *
 * Each resource can have:
 * - auth: Array of allowed roles or true/false
 * - protected: Array of field names to filter from responses
 * - guard: Object with operation-specific guard functions
 * - events: Array of events to broadcast ('insert', 'update', 'delete')
 *
 * @param resourcesConfig - Raw resources configuration
 * @param logger - Logger instance
 * @returns Normalized resources configuration
 */
export function normalizeResourcesConfig(resourcesConfig, logger) {
    if (!resourcesConfig) {
        return {};
    }
    const normalized = {};
    for (const [name, config] of Object.entries(resourcesConfig)) {
        const normalizedConfig = normalizeResourceConfig(name, config, logger);
        if (normalizedConfig !== null) {
            normalized[name] = normalizedConfig;
        }
    }
    return normalized;
}
/**
 * Normalize a single resource configuration
 * @private
 */
function normalizeResourceConfig(name, config, logger) {
    // Handle simple boolean config
    if (config === true) {
        return {
            auth: undefined,
            protected: [],
            guard: {},
            publishAuth: undefined
        };
    }
    if (config === false) {
        return null;
    }
    // Handle full config object
    const normalized = {
        auth: normalizeAuth(config.auth),
        protected: normalizeProtected(config.protected),
        guard: normalizeGuard(config.guard),
        publishAuth: normalizePublishAuth(config.publishAuth)
    };
    // Log configuration
    logger?.debug({
        resource: name,
        hasAuth: !!normalized.auth,
        protectedFields: normalized.protected?.length,
        hasGuards: Object.keys(normalized.guard || {}).length > 0
    }, 'Resource configured for WebSocket');
    return normalized;
}
/**
 * Normalize auth configuration
 * @private
 */
function normalizeAuth(auth) {
    if (auth === undefined || auth === null || auth === true) {
        return undefined; // No role restriction
    }
    if (auth === false) {
        return undefined; // Block access - handled elsewhere
    }
    if (typeof auth === 'string') {
        return [auth];
    }
    if (Array.isArray(auth)) {
        return auth;
    }
    if (typeof auth === 'object') {
        return auth;
    }
    return undefined;
}
/**
 * Normalize publishAuth configuration
 * @private
 */
function normalizePublishAuth(publishAuth) {
    if (publishAuth === undefined || publishAuth === null) {
        return undefined;
    }
    if (typeof publishAuth === 'string') {
        return [publishAuth];
    }
    if (Array.isArray(publishAuth)) {
        return publishAuth;
    }
    if (typeof publishAuth === 'object') {
        return publishAuth;
    }
    return undefined;
}
/**
 * Normalize protected fields
 * @private
 */
function normalizeProtected(protected_) {
    if (!protected_) {
        return [];
    }
    if (typeof protected_ === 'string') {
        return [protected_];
    }
    if (Array.isArray(protected_)) {
        return protected_;
    }
    return [];
}
/**
 * Normalize guard functions
 * @private
 */
function normalizeGuard(guard) {
    if (!guard) {
        return {};
    }
    const normalized = {};
    const validOperations = ['list', 'get', 'create', 'update', 'delete', 'subscribe', 'publish'];
    for (const [operation, handler] of Object.entries(guard)) {
        if (validOperations.includes(operation) && typeof handler === 'function') {
            normalized[operation] = handler;
        }
    }
    return normalized;
}
//# sourceMappingURL=normalize-resources.js.map