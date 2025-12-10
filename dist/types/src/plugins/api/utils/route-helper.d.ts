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
export declare function withContext(handler: RouteHandler): (c: Context) => Promise<Response>;
export declare function errorResponse(c: Context, message: string, status?: number): Response;
export declare function successResponse(c: Context, data: unknown, status?: number): Response;
//# sourceMappingURL=route-helper.d.ts.map