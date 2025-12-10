import type { Context, MiddlewareHandler, Next } from 'hono';

export interface ResourceLike {
  [key: string]: unknown;
}

export interface DatabaseLike {
  resources?: Record<string, ResourceLike>;
  [key: string]: unknown;
}

export function createContextInjectionMiddleware(database: DatabaseLike): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<void | Response> => {
    c.set('db', database);
    c.set('database', database);

    for (const [name, resource] of Object.entries(database.resources || {})) {
      c.set(`resource:${name}`, resource);

      const existing = c.get(name);
      if (!existing) {
        c.set(name, resource);
      }
    }

    await next();
  };
}
