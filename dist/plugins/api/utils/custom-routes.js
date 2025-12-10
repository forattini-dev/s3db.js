import { asyncHandler } from './error-handler.js';
import { createLogger } from '../../../concerns/logger.js';
import { withContext } from '../concerns/route-context.js';
import { applyBasePath } from './base-path.js';
const logger = createLogger({ name: 'CustomRoutes', level: 'info' });
export function parseRouteKey(key) {
    const match = key.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
    if (!match) {
        throw new Error(`Invalid route key format: "${key}". Expected format: "METHOD /path"`);
    }
    return {
        method: match[1].toUpperCase(),
        path: match[2]
    };
}
export function mountCustomRoutes(app, routes, context = {}, logLevel = 'info', options = {}) {
    if (!routes || typeof routes !== 'object') {
        return;
    }
    const { autoWrap = true, pathPrefix = '' } = options;
    for (const [key, handler] of Object.entries(routes)) {
        try {
            const { method, path } = parseRouteKey(key);
            const finalPath = pathPrefix ? applyBasePath(pathPrefix, path) : path;
            const wrappedHandler = asyncHandler(async (c) => {
                c.set('customRouteContext', context);
                if (autoWrap && handler.length === 2) {
                    return await withContext(handler, { resource: context.resource })(c);
                }
                else {
                    return await handler(c);
                }
            });
            app.on(method, finalPath, wrappedHandler);
            if (logLevel === 'debug' || logLevel === 'trace') {
                const contextType = (autoWrap && handler.length === 2) ? '(enhanced)' : '(legacy)';
                logger.info(`[Custom Routes] Mounted ${method} ${finalPath} ${contextType}`);
            }
        }
        catch (err) {
            if (logLevel === 'debug' || logLevel === 'trace') {
                logger.error({ route: key, error: err.message }, '[Custom Routes] Error mounting route');
            }
        }
    }
}
export function validateCustomRoutes(routes) {
    const errors = [];
    if (!routes || typeof routes !== 'object') {
        return errors;
    }
    for (const [key, handler] of Object.entries(routes)) {
        try {
            parseRouteKey(key);
        }
        catch (err) {
            errors.push({ key, error: err.message });
            continue;
        }
        if (typeof handler !== 'function') {
            errors.push({
                key,
                error: `Handler must be a function, got ${typeof handler}`
            });
        }
    }
    return errors;
}
export default {
    parseRouteKey,
    mountCustomRoutes,
    validateCustomRoutes
};
//# sourceMappingURL=custom-routes.js.map