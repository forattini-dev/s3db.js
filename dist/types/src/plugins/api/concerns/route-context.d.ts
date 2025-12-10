import type { Context } from 'hono';
import type { Database } from '../../../database.class.js';
export interface UserInfo {
    scopes?: string[];
    [key: string]: unknown;
}
export interface ValidationResult {
    valid: boolean;
    errors?: unknown[];
}
export interface ValidateBodyResult extends ValidationResult {
    data?: Record<string, unknown>;
}
export interface SchemaLike {
    validate(data: Record<string, unknown>): true | unknown[];
}
export interface ResourceLike {
    schema?: SchemaLike;
    [key: string]: unknown;
}
export interface PluginRegistry {
    [key: string]: unknown;
}
export interface PartitionFilter {
    partitionName: string;
    partitionFields: Record<string, unknown>;
}
export interface ValidatorHelper {
    validate(resourceOrData: string | Record<string, unknown>, data?: Record<string, unknown> | null): ValidationResult;
    validateOrThrow(resourceOrData: string | Record<string, unknown>, data?: Record<string, unknown> | null): void;
    validateBody(resourceName?: string | null): Promise<ValidateBodyResult>;
}
export interface LegacyContext {
    database?: Database;
    resource?: ResourceLike;
    plugins?: PluginRegistry;
}
export interface WithContextOptions {
    resource?: ResourceLike | null;
}
export interface ErrorLike extends Error {
    code?: string;
    status?: number;
    statusCode?: number;
    httpStatus?: number;
    errors?: unknown[];
}
export declare class RouteContext {
    c: Context;
    db: Database;
    database: Database;
    private _currentResource;
    pluginRegistry: PluginRegistry;
    resources: Record<string, ResourceLike>;
    validator: ValidatorHelper;
    resource: ResourceLike | null;
    private _partitionFilters;
    constructor(honoContext: Context, database: Database, resource?: ResourceLike | null, plugins?: PluginRegistry);
    private _createResourcesProxy;
    private _createValidator;
    param(name: string): string | undefined;
    params(): Record<string, string>;
    query(name: string): string | undefined;
    queries(): Record<string, string>;
    header(name: string): string | undefined;
    body(): Promise<Record<string, unknown>>;
    text(): Promise<string>;
    formData(): Promise<FormData>;
    json(data: unknown, status?: number): Response;
    success(data: unknown, status?: number): Response;
    error(message: string | Error | null, status?: number, details?: unknown): Response;
    notFound(message?: string): Response;
    unauthorized(message?: string): Response;
    forbidden(message?: string): Response;
    html(htmlContent: string, status?: number): Response;
    redirect(url: string, status?: number): Response;
    render(template: string, data?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Response>;
    get user(): UserInfo | null;
    get session(): Record<string, unknown> | null;
    get sessionId(): string | null;
    get requestId(): string | null;
    get isAuthenticated(): boolean;
    hasScope(scope: string): boolean;
    hasAnyScope(...scopes: string[]): boolean;
    hasAllScopes(...scopes: string[]): boolean;
    requireAuth(): void;
    requireScope(scope: string): void;
    setPartition(partitionName: string, partitionFields: Record<string, unknown>): void;
    getPartitionFilters(): PartitionFilter[];
    clearPartitionFilters(): void;
    hasPartitionFilters(): boolean;
}
export declare function withContext(handler: (c: Context, ctx: RouteContext) => Promise<Response>, options?: WithContextOptions): (c: Context) => Promise<Response>;
export declare function autoWrapHandler(handler: ((c: Context) => Promise<Response>) | ((c: Context, ctx: RouteContext) => Promise<Response>), options?: WithContextOptions): (c: Context) => Promise<Response>;
//# sourceMappingURL=route-context.d.ts.map