/**
 * Custom Routes Utilities
 *
 * Parse and mount custom routes defined in resources or plugins
 * Inspired by moleculer-js route syntax
 */

import { asyncHandler } from './error-handler.js';
import { withContext, autoWrapHandler } from '../concerns/route-context.js';
import { applyBasePath } from './base-path.js';

/**
 * Parse route definition from key
 * @param {string} key - Route key (e.g., 'GET /users', 'POST /custom/:id/action')
 * @returns {Object} { method, path }
 */
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

/**
 * Mount custom routes on Hono app
 * @param {Object} app - Hono app instance
 * @param {Object} routes - Routes object { 'METHOD /path': handler }
 * @param {Object} context - Context to pass to handlers (resource, database, etc.)
 * @param {boolean} verbose - Enable verbose logging
 * @param {Object} options - Additional options
 * @param {boolean} options.autoWrap - Auto-wrap handlers with enhanced context (default: true)
 */
export function mountCustomRoutes(app, routes, context = {}, verbose = false, options = {}) {
  if (!routes || typeof routes !== 'object') {
    return;
  }

  const { autoWrap = true, pathPrefix = '' } = options;

  for (const [key, handler] of Object.entries(routes)) {
    try {
      const { method, path } = parseRouteKey(key);
      const finalPath = pathPrefix ? applyBasePath(pathPrefix, path) : path;

      // Wrap handler with async error handler and context
      const wrappedHandler = asyncHandler(async (c) => {
        // Inject legacy context into Hono context (for backward compatibility)
        c.set('customRouteContext', context);

        // Auto-wrap handler if enabled and handler expects 2 arguments (c, ctx)
        if (autoWrap && handler.length === 2) {
          // Handler expects (c, ctx) - wrap it with enhanced context
          return await withContext(handler, { resource: context.resource })(c);
        } else {
          // Handler expects only (c) - use legacy behavior
          return await handler(c);
        }
      });

      // Mount route
      app.on(method, finalPath, wrappedHandler);

      if (verbose) {
        const contextType = (autoWrap && handler.length === 2) ? '(enhanced)' : '(legacy)';
        console.log(`[Custom Routes] Mounted ${method} ${finalPath} ${contextType}`);
      }
    } catch (err) {
      if (verbose) {
        console.error(`[Custom Routes] Error mounting route "${key}":`, err.message);
      }
    }
  }
}

/**
 * Validate custom routes object
 * @param {Object} routes - Routes to validate
 * @returns {Array} Array of validation errors
 */
export function validateCustomRoutes(routes) {
  const errors = [];

  if (!routes || typeof routes !== 'object') {
    return errors;
  }

  for (const [key, handler] of Object.entries(routes)) {
    // Validate key format
    try {
      parseRouteKey(key);
    } catch (err) {
      errors.push({ key, error: err.message });
      continue;
    }

    // Validate handler is a function
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
