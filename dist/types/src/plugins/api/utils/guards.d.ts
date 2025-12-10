import type { MiddlewareHandler } from 'hono';
export interface User {
    id?: string;
    role?: string;
    scopes?: string[];
    [key: string]: unknown;
}
export interface RouteContextLike {
    user?: User | null;
    _currentResource?: unknown;
    setPartition?(partition: string, values: Record<string, unknown>): void;
    hasPartitionFilters?(): boolean;
    getPartitionFilters?(): Record<string, unknown>;
    [key: string]: unknown;
}
export interface GuardObject {
    role?: string | string[];
    scopes?: string | string[];
    check?: GuardFunction;
}
export type GuardFunction = (ctxOrUser: RouteContextLike | User, recordOrContext?: unknown) => boolean;
export type Guard = boolean | string | string[] | GuardFunction | GuardObject | null;
export interface GuardsConfig {
    list?: Guard;
    get?: Guard;
    create?: Guard;
    update?: Guard;
    delete?: Guard;
    read?: Guard;
    write?: Guard;
    all?: Guard;
    [key: string]: Guard | undefined;
}
export interface ResourceLike {
    [key: string]: unknown;
}
export interface DatabaseLike {
    resources?: Record<string, ResourceLike>;
    [key: string]: unknown;
}
export interface PluginsConfig {
    [key: string]: unknown;
}
export interface GuardMiddlewareOptions {
    resource?: ResourceLike;
    database?: DatabaseLike;
    plugins?: PluginsConfig;
    globalGuards?: GuardsConfig | null;
}
export declare function checkGuard(ctxOrUser: RouteContextLike | User | null, guard: Guard, recordOrContext?: unknown): boolean;
export declare function hasScope(user: User | null | undefined, scope: string): boolean;
export declare function getOperationGuard(guards: Guard | GuardsConfig | null | undefined, operation: string): Guard;
export declare function guardMiddleware(guards: GuardsConfig | null, operation: string, options?: GuardMiddlewareOptions): MiddlewareHandler;
declare const _default: {
    checkGuard: typeof checkGuard;
    hasScope: typeof hasScope;
    getOperationGuard: typeof getOperationGuard;
    guardMiddleware: typeof guardMiddleware;
};
export default _default;
//# sourceMappingURL=guards.d.ts.map