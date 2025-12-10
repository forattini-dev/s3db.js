import type { MiddlewareHandler } from 'hono';
export interface ResourceLike {
    [key: string]: unknown;
}
export interface DatabaseLike {
    resources?: Record<string, ResourceLike>;
    [key: string]: unknown;
}
export declare function createContextInjectionMiddleware(database: DatabaseLike): MiddlewareHandler;
//# sourceMappingURL=context-injection.d.ts.map