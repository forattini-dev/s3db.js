import type { Context as HonoContext } from 'hono';
export interface UserInfo {
    sub?: string;
    id?: string;
    scopes?: string[];
    role?: string;
    roles?: string[];
    tenantId?: string;
    tid?: string;
    verified?: boolean;
    [key: string]: unknown;
}
export interface GuardContext {
    user: UserInfo;
    params: Record<string, string>;
    body: Record<string, unknown>;
    query: Record<string, string>;
    headers: Record<string, string>;
    partitionName: string | null;
    partitionValues: Record<string, unknown>;
    tenantId: string | null;
    userId: string | null;
    setPartition(name: string, values: Record<string, unknown>): void;
    raw: {
        req?: unknown;
        c?: HonoContext;
        request?: unknown;
    };
}
export interface ResourceLike {
    executeGuard(operation: string, context: GuardContext, record?: Record<string, unknown>): Promise<boolean>;
}
export interface ExpressRequest {
    user?: UserInfo;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
    headers?: Record<string, string>;
}
export interface FastifyRequest {
    user?: UserInfo;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
    headers?: Record<string, string>;
}
export type GuardFunction = (ctx: GuardContext, resource?: Record<string, unknown>) => boolean | Promise<boolean>;
export declare function createExpressContext(req: ExpressRequest): GuardContext;
export declare function createHonoContext(c: HonoContext): Promise<GuardContext>;
export declare function createFastifyContext(request: FastifyRequest): GuardContext;
export interface ListOptions {
    partition?: string;
    partitionValues?: Record<string, unknown>;
    [key: string]: unknown;
}
export declare function applyGuardsToList(resource: ResourceLike, context: GuardContext, options?: ListOptions): Promise<ListOptions>;
export declare function applyGuardsToGet(resource: ResourceLike, context: GuardContext, record: Record<string, unknown> | null): Promise<Record<string, unknown> | null>;
export declare function applyGuardsToInsert(resource: ResourceLike, context: GuardContext, data: Record<string, unknown>): Promise<Record<string, unknown>>;
export declare function applyGuardsToUpdate(resource: ResourceLike, context: GuardContext, record: Record<string, unknown> | null): Promise<boolean>;
export declare function applyGuardsToDelete(resource: ResourceLike, context: GuardContext, record: Record<string, unknown> | null): Promise<boolean>;
export declare function requireScopes(requiredScopes: string | string[], mode?: 'any' | 'all'): GuardFunction;
export declare function requireRole(role: string | string[]): GuardFunction;
export declare function requireAdmin(): GuardFunction;
export declare function requireOwnership(field?: string): GuardFunction;
export declare function anyOf(...guards: GuardFunction[]): GuardFunction;
export declare function allOf(...guards: GuardFunction[]): GuardFunction;
export declare function requireTenant(tenantField?: string): GuardFunction;
//# sourceMappingURL=guards-helpers.d.ts.map