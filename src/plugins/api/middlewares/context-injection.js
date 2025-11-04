/**
 * Context Injection Middleware
 *
 * Automatically injects database and resources into Hono context for easy access.
 *
 * This eliminates the need for verbose `c.get('customRouteContext')` boilerplate
 * and makes resource access intuitive and clean.
 *
 * @example
 * // Without injection (old way):
 * const context = c.get('customRouteContext');
 * const { database } = context;
 * const url = await database.resources.urls_v1.get(id);
 *
 * // With injection (new way):
 * const urls = c.get('urls_v1');
 * const url = await urls.get(id);
 *
 * @param {Database} database - s3db.js database instance
 * @returns {Function} Hono middleware function
 */
export function createContextInjectionMiddleware(database) {
  return async (c, next) => {
    // ✅ Inject database directly into context
    c.set('db', database);
    c.set('database', database); // Alias for compatibility

    // ✅ Inject each resource directly with resource: prefix
    for (const [name, resource] of Object.entries(database.resources || {})) {
      c.set(`resource:${name}`, resource);

      // ✅ BONUS: Shortcut without prefix (if no conflict)
      // This allows c.get('urls_v1') instead of c.get('resource:urls_v1')
      const existing = c.get(name);
      if (!existing) {
        c.set(name, resource);
      }
    }

    await next();
  };
}
