import type { Context } from 'hono';
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
export declare function parseRouteKey(key: string): ParsedRoute;
export declare function mountCustomRoutes(app: HonoAppLike, routes: Routes | null | undefined, context?: RouteContext, logLevel?: string, options?: MountOptions): void;
export declare function validateCustomRoutes(routes: Routes | null | undefined): ValidationError[];
declare const _default: {
    parseRouteKey: typeof parseRouteKey;
    mountCustomRoutes: typeof mountCustomRoutes;
    validateCustomRoutes: typeof validateCustomRoutes;
};
export default _default;
//# sourceMappingURL=custom-routes.d.ts.map