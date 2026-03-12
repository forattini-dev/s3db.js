import type { Context } from '#src/plugins/shared/http-runtime.js';
import { createRouteContext, type RouteAuthApi, type RouteInputApi, type RouteServicesApi } from '../concerns/route-context.js';

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
  resource: ResourceLike | null;
  services: RouteServicesApi;
  input: RouteInputApi;
  auth: RouteAuthApi;
  logger: ReturnType<typeof createRouteContext>['logger'];
  signal: AbortSignal;
  requestId: string | null;
}

export type RouteHandler = (c: Context, helpers: RouteHelpers) => Promise<Response> | Response;

export interface CustomRouteContext {
  database?: DatabaseLike;
  resource?: ResourceLike | null;
  plugins?: Record<string, unknown>;
}

export function withContext(handler: RouteHandler, context: CustomRouteContext = {}): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    const routeContext = createRouteContext(c, {
      database: context.database as any,
      resource: context.resource as any,
      plugins: context.plugins
    });

    const helpers: RouteHelpers = {
      db: routeContext.db as unknown as DatabaseLike,
      database: routeContext.database as unknown as DatabaseLike,
      resource: routeContext.resource,
      resources: new Proxy((routeContext.database.resources || {}) as unknown as Record<string, ResourceLike>, {
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
      }),
      services: routeContext.services,
      input: routeContext.input,
      auth: routeContext.auth,
      logger: routeContext.logger,
      signal: routeContext.signal,
      requestId: routeContext.requestId
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
