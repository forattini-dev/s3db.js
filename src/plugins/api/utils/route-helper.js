/**
 * Route Helper Utilities
 *
 * Provides convenient wrapper functions for route handlers with automatic
 * context extraction and resource injection.
 *
 * @example
 * import { withContext } from 's3db.js/plugins/api';
 *
 * routes: {
 *   '/:id': withContext(async (c, { db, resources }) => {
 *     const { urls_v1, clicks_v1 } = resources;
 *     const id = c.req.param('id');
 *
 *     const url = await urls_v1.get(id);
 *     return c.json({ url });
 *   })
 * }
 */

/**
 * Wrap a route handler with automatic context extraction
 *
 * This eliminates the need to manually extract context and provides
 * convenient access to database and resources via destructuring.
 *
 * @param {Function} handler - Route handler function(c, helpers)
 * @returns {Function} Wrapped handler
 *
 * @example
 * // Basic usage with destructuring
 * withContext(async (c, { db, resources }) => {
 *   const { users } = resources;
 *   const user = await users.get('123');
 *   return c.json({ user });
 * })
 *
 * @example
 * // Access specific resources
 * withContext(async (c, { resources: { urls_v1, clicks_v1 } }) => {
 *   const url = await urls_v1.get(c.req.param('id'));
 *   const clicks = await clicks_v1.query({ urlId: url.id });
 *   return c.json({ url, clicks });
 * })
 */
export function withContext(handler) {
  return async (c) => {
    // Try new context injection first (preferred)
    let database = c.get('db') || c.get('database');

    // Fallback to legacy customRouteContext if needed
    if (!database) {
      const ctx = c.get('customRouteContext');
      if (ctx && ctx.database) {
        database = ctx.database;
      }
    }

    if (!database) {
      throw new Error(
        '[withContext] Database not found in context. ' +
        'Ensure context injection middleware is registered or customRouteContext is set.'
      );
    }

    // Create helpers object with Proxy for better DX
    const helpers = {
      db: database,
      database: database, // Alias

      // Proxy for easy resource access with error handling
      resources: new Proxy(database.resources || {}, {
        get(target, prop) {
          if (prop === 'then' || prop === 'catch') {
            // Prevent proxy from being treated as thenable
            return undefined;
          }

          if (!(prop in target)) {
            const available = Object.keys(target).join(', ');
            throw new Error(
              `Resource "${String(prop)}" not found. ` +
              `Available resources: ${available || '(none)'}`
            );
          }
          return target[prop];
        }
      })
    };

    // Call handler with injected helpers
    return await handler(c, helpers);
  };
}

/**
 * Create a simple error response
 *
 * @param {Object} c - Hono context
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Response} JSON error response
 */
export function errorResponse(c, message, status = 400) {
  return c.json({
    success: false,
    error: {
      message,
      code: 'ROUTE_ERROR',
      status
    }
  }, status);
}

/**
 * Create a success response
 *
 * @param {Object} c - Hono context
 * @param {*} data - Response data
 * @param {number} status - HTTP status code
 * @returns {Response} JSON success response
 */
export function successResponse(c, data, status = 200) {
  return c.json({
    success: true,
    data
  }, status);
}
