import {
  HttpApp as RaffelHttpApp,
  type HttpContextInterface,
  type HttpHandler,
  type HttpMethod,
  type HttpMiddleware,
  type TypedResponse,
  type HttpRequest,
  type ContentfulStatusCode,
  serve,
  getCookie as _getCookie,
  getCookies as _getCookies,
  setCookie as _setCookie,
  deleteCookie as _deleteCookie,
  generateCookie,
  type CookieContext,
  type CookieOptions,
} from 'raffel/http';

/**
 * Local adapter for framework primitives used by s3db.js.
 *
 * Context is aliased to HttpContextInterface so that middleware handlers typed
 * as `(c: Context, next: Next) => ...` remain assignable to HttpMiddleware.
 *
 * Module augmentation adds proper overloads to HttpRequest so that
 * req.header('name') / req.query('name') / req.param('name') return
 * `string | undefined` instead of the wider union that includes
 * `Record<string, string>`.  This matches the Raffel call sites.
 *
 * Cookie helpers are wrapped to bridge the CookieContext structural gap.
 */

declare module 'raffel/http' {
  interface HttpRequest {
    header(name: string): string | undefined;
    header(): Record<string, string>;
    query(name: string): string | undefined;
    query(): Record<string, string>;
    param(name: string): string | undefined;
    param(): Record<string, string>;
  }
}

export type Context<T extends Record<string, unknown> = Record<string, unknown>> = HttpContextInterface<T>;

export type { HttpRequest, HttpContextInterface, HttpMiddleware as MiddlewareHandler, ContentfulStatusCode, TypedResponse };
export type { HttpMiddleware };
export type Next = () => Promise<void>;

export { serve };
export { generateCookie };
export type { CookieOptions };
export type { CookieContext } from 'raffel/http';

interface CompiledPath {
  pattern: RegExp;
  paramNames: string[];
}

interface RouteEntry<E extends Record<string, unknown> = Record<string, unknown>> {
  method: HttpMethod | '*';
  pattern: RegExp;
  paramNames: string[];
  handler: HttpHandler<E> | HttpMiddleware<E>;
  middlewares: HttpMiddleware<E>[];
  path: string;
}

interface MiddlewareEntry<E extends Record<string, unknown> = Record<string, unknown>> {
  path: string;
  pattern: RegExp;
  middleware: HttpMiddleware<E>;
}

interface MutableHttpAppState<E extends Record<string, unknown> = Record<string, unknown>> {
  routes: RouteEntry<E>[];
  globalMiddlewares: MiddlewareEntry<E>[];
  basePath: string;
}

function escapeRouteLiteral(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function nextWildcardParamName(paramNames: string[]): string {
  const wildcardCount = paramNames.filter((name) => name === '*' || /^\*\d+$/.test(name)).length;
  return wildcardCount === 0 ? '*' : `*${wildcardCount + 1}`;
}

/**
 * Compile HTTP route patterns with support for params, optional params and deep wildcards.
 */
function compileHttpPath(path: string): CompiledPath {
  if (path === '') {
    return { pattern: /^$/, paramNames: [] };
  }

  if (path === '/') {
    return { pattern: /^\/$/, paramNames: [] };
  }

  const paramNames: string[] = [];
  const segments = path.split('/');
  let pattern = '^';

  if (path.startsWith('/')) {
    pattern += '';
  }

  for (let index = 0; index < segments.length; index++) {
    if (index === 0) {
      if (segments[index] !== '') {
        pattern += escapeRouteLiteral(segments[index]!);
      }
      continue;
    }

    const segment = segments[index]!;
    const isLast = index === segments.length - 1;

    if (segment === '' && isLast) {
      pattern += '/';
      continue;
    }

    if (segment === '*' || segment === '**') {
      paramNames.push(nextWildcardParamName(paramNames));

      if (isLast) {
        pattern += '(?:/(.*))?';
      } else if (segment === '**') {
        pattern += '/(.*)';
      } else {
        pattern += '/([^/]+)';
      }
      continue;
    }

    const parameterMatch = /^:([a-zA-Z_][a-zA-Z0-9_]*)(\?)?$/.exec(segment);
    if (parameterMatch) {
      const name = parameterMatch[1]!;
      const optional = parameterMatch[2];
      paramNames.push(name);
      pattern += optional ? '(?:/([^/]+))?' : '/([^/]+)';
      continue;
    }

    pattern += `/${escapeRouteLiteral(segment)}`;
  }

  pattern += '$';

  return {
    pattern: new RegExp(pattern),
    paramNames
  };
}

function compileMiddlewarePattern(path: string): RegExp {
  const pattern = path
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '.*');

  return new RegExp(`^${pattern}`);
}

/**
 * Compatibility wrapper around Raffel's HttpApp.
 *
 * Raffel 1.0.6 mishandles terminal `*` wildcards in route registration.
 * This subclass preserves the public API while compiling routes with
 * deterministic single-segment and deep-wildcard semantics.
 */
export class HttpApp<E extends Record<string, unknown> = Record<string, unknown>> extends RaffelHttpApp<E> {
  override on(method: HttpMethod | '*', path: string, ...handlers: (HttpMiddleware<E> | HttpHandler<E>)[]): this {
    if (handlers.length === 0) {
      throw new Error('At least one handler is required');
    }

    const state = this as unknown as MutableHttpAppState<E>;
    const fullPath = `${state.basePath || ''}${path}`;
    const { pattern, paramNames } = compileHttpPath(fullPath);
    const handler = handlers[handlers.length - 1]!;
    const middlewares = handlers.slice(0, -1) as HttpMiddleware<E>[];

    state.routes.push({
      method,
      pattern,
      paramNames,
      handler,
      middlewares,
      path: fullPath
    });

    return this;
  }

  override route(path: string, app: RaffelHttpApp<E>): this {
    const state = this as unknown as MutableHttpAppState<E>;
    const childState = app as unknown as MutableHttpAppState<E>;

    for (const route of childState.routes) {
      const fullPath = `${state.basePath || ''}${path}${route.path.replace(childState.basePath || '', '')}`;
      const { pattern, paramNames } = compileHttpPath(fullPath);

      state.routes.push({
        ...route,
        pattern,
        paramNames,
        path: fullPath
      });
    }

    for (const middleware of childState.globalMiddlewares) {
      const fullPath = `${state.basePath || ''}${path}${middleware.path.replace(childState.basePath || '', '')}`;

      state.globalMiddlewares.push({
        path: fullPath,
        pattern: compileMiddlewarePattern(fullPath),
        middleware: middleware.middleware
      });
    }

    return this;
  }

  override basePathApp(prefix: string): HttpApp<E> {
    const state = this as unknown as MutableHttpAppState<E>;
    const subApp = new HttpApp<E>({ basePath: `${state.basePath || ''}${prefix}` });
    const subState = subApp as unknown as MutableHttpAppState<E>;

    subState.routes = state.routes;
    subState.globalMiddlewares = state.globalMiddlewares;

    return subApp;
  }
}

/** Get a single cookie value. */
export function getCookie(ctx: Context, name: string): string | undefined {
  return _getCookie(ctx as unknown as CookieContext, name);
}

/** Get all cookies as a key-value record. */
export function getCookies(ctx: Context): Record<string, string> {
  return _getCookies(ctx as unknown as CookieContext);
}

/** Set a cookie on the response. */
export function setCookie(ctx: Context, name: string, value: string, opts?: CookieOptions): void {
  return _setCookie(ctx as unknown as CookieContext, name, value, opts);
}

/** Delete a cookie from the response. */
export function deleteCookie(
  ctx: Context,
  name: string,
  opts?: Pick<CookieOptions, 'domain' | 'path' | 'secure' | 'prefix'>
): void {
  return _deleteCookie(ctx as unknown as CookieContext, name, opts);
}
