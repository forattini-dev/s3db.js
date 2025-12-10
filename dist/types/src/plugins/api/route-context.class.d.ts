/**
 * RouteContext - Single, clean context for route handlers
 *
 * Wraps Hono context (c) and injects db/resources plus helper methods
 * Keeps Hono context "clean" while providing rich functionality
 */
import type { Context } from 'hono';
export interface RouteContextOptions {
    db?: unknown | null;
    resources?: Record<string, unknown> | null;
}
export interface ErrorResponseOptions {
    status?: number;
    code?: string;
    details?: unknown | null;
}
export interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code: string;
        status: number;
        details?: unknown;
        stack?: string[];
    };
}
export interface SuccessResponse {
    success: true;
    [key: string]: unknown;
}
export declare class RouteContext {
    readonly c: Context;
    readonly db: unknown | null;
    readonly resources: Record<string, unknown> | null;
    constructor(c: Context, { db, resources }?: RouteContextOptions);
    get req(): import("hono").HonoRequest<any, unknown>;
    get res(): Response;
    get var(): Readonly<import("hono").ContextVariableMap & Record<string, any>>;
    set(key: string, value: unknown): void;
    get(key: string): any;
    body<T = unknown>(): Promise<T>;
    query(): Record<string, string>;
    query(key: string): string | undefined;
    param(key: string): string | undefined;
    header(name: string): string | undefined;
    success(data?: Record<string, unknown> | unknown, status?: number): Response;
    error(message: string | Error, statusOrOptions?: number | ErrorResponseOptions, detailsOverride?: unknown | null): Response;
    badRequest(message?: string, details?: unknown | null): Response;
    unauthorized(message?: string, details?: unknown | null): Response;
    forbidden(message?: string, details?: unknown | null): Response;
    notFound(message?: string, details?: unknown | null): Response;
    validationError(message?: string, details?: unknown | null): Response;
    serverError(message?: string, details?: unknown | null): Response;
    private _getErrorCode;
    private _getErrorStatus;
    json(data: unknown, status?: number): Response;
    text(text: string, status?: number): Response;
    html(html: string, status?: number): Response;
    redirect(location: string, status?: number): Response;
    get raw(): Context;
}
//# sourceMappingURL=route-context.class.d.ts.map