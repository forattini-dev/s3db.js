import type { Context } from 'hono';
import { asyncHandler } from './error-handler.js';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger } from '../../../concerns/logger.js';
import { withContext } from '../concerns/route-context.js';
import { applyBasePath } from './base-path.js';

const logger: Logger = createLogger({ name: 'CustomRoutes', level: 'info' });

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ParsedRoute {
  method: HttpMethod;
  path: string;
}

export interface RouteContext {
  resource?: unknown;
  database?: unknown;
  [key: string]: unknown;
}

export type RouteHandler = (c: Context) => Promise<Response> | Response;
export type EnhancedRouteHandler = (c: Context, ctx: unknown) => Promise<Response> | Response;

export interface Routes {
  [key: string]: RouteHandler | EnhancedRouteHandler;
}

export interface MountOptions {
  autoWrap?: boolean;
  pathPrefix?: string;
}

export interface ValidationError {
  key: string;
  error: string;
}

export interface HonoAppLike {
  on(method: string, path: string, handler: RouteHandler): void;
}

export function parseRouteKey(key: string): ParsedRoute {
  const match = key.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);

  if (!match) {
    throw new Error(`Invalid route key format: "${key}". Expected format: "METHOD /path"`);
  }

  return {
    method: match[1]!.toUpperCase() as HttpMethod,
    path: match[2]!
  };
}

export function mountCustomRoutes(
  app: HonoAppLike,
  routes: Routes | null | undefined,
  context: RouteContext = {},
  logLevel: string = 'info',
  options: MountOptions = {}
): void {
  if (!routes || typeof routes !== 'object') {
    return;
  }

  const { autoWrap = true, pathPrefix = '' } = options;

  for (const [key, handler] of Object.entries(routes)) {
    try {
      const { method, path } = parseRouteKey(key);
      const finalPath = pathPrefix ? applyBasePath(pathPrefix, path) : path;

      const wrappedHandler = asyncHandler(async (c: Context): Promise<Response> => {
        c.set('customRouteContext', context);

        if (autoWrap && handler.length === 2) {
          return await withContext(handler as unknown as Parameters<typeof withContext>[0], { resource: context.resource as unknown } as Parameters<typeof withContext>[1])(c);
        } else {
          return await (handler as RouteHandler)(c);
        }
      });

      app.on(method, finalPath, wrappedHandler);

      if (logLevel === 'debug' || logLevel === 'trace') {
        const contextType = (autoWrap && handler.length === 2) ? '(enhanced)' : '(legacy)';
        logger.info(`[Custom Routes] Mounted ${method} ${finalPath} ${contextType}`);
      }
    } catch (err) {
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger.error({ route: key, error: (err as Error).message }, '[Custom Routes] Error mounting route');
      }
    }
  }
}

export function validateCustomRoutes(routes: Routes | null | undefined): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!routes || typeof routes !== 'object') {
    return errors;
  }

  for (const [key, handler] of Object.entries(routes)) {
    try {
      parseRouteKey(key);
    } catch (err) {
      errors.push({ key, error: (err as Error).message });
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
