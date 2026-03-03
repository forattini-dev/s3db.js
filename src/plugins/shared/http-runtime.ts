import {
  HttpApp,
  type HttpContextInterface,
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

export { HttpApp };
export { HttpApp as Hono };
export type { HttpRequest, HttpContextInterface, HttpMiddleware as MiddlewareHandler, ContentfulStatusCode, TypedResponse };
export type { HttpMiddleware };
export type Next = () => Promise<void>;

export { serve };
export { generateCookie };
export type { CookieOptions };
export type { CookieContext } from 'raffel/http';

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
