import type { Context } from 'hono';

export interface ResourceLike {
  [key: string]: unknown;
}

export interface DatabaseLike {
  resources?: Record<string, ResourceLike>;
  [key: string]: unknown;
}

export interface RouteHelpers {
  db: DatabaseLike;
  database: DatabaseLike;
  resources: Record<string, ResourceLike>;
}

export type RouteHandler = (c: Context, helpers: RouteHelpers) => Promise<Response> | Response;

export interface CustomRouteContext {
  database?: DatabaseLike;
}

export function withContext(handler: RouteHandler): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    let database = c.get('db') as DatabaseLike | undefined || c.get('database') as DatabaseLike | undefined;

    if (!database) {
      const ctx = c.get('customRouteContext') as CustomRouteContext | undefined;
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

    const helpers: RouteHelpers = {
      db: database,
      database: database,

      resources: new Proxy(database.resources || {}, {
        get(target: Record<string, ResourceLike>, prop: string | symbol): ResourceLike | undefined {
          if (prop === 'then' || prop === 'catch') {
            return undefined;
          }

          const propStr = String(prop);
          if (!(propStr in target)) {
            const available = Object.keys(target).join(', ');
            throw new Error(
              `Resource "${propStr}" not found. ` +
              `Available resources: ${available || '(none)'}`
            );
          }
          return target[propStr];
        }
      })
    };

    return await handler(c, helpers);
  };
}

export function errorResponse(c: Context, message: string, status: number = 400): Response {
  return c.json({
    success: false,
    error: {
      message,
      code: 'ROUTE_ERROR',
      status
    }
  }, status as Parameters<typeof c.json>[1]);
}

export function successResponse(c: Context, data: unknown, status: number = 200): Response {
  return c.json({
    success: true,
    data
  }, status as Parameters<typeof c.json>[1]);
}
