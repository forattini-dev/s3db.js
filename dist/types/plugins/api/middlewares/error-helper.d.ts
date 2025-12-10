import type { Context, MiddlewareHandler } from 'hono';
export interface ErrorLike {
    message?: string;
    name?: string;
    code?: string;
    status?: number;
    statusCode?: number;
    httpStatus?: number;
    stack?: string;
    [key: string]: unknown;
}
export interface ErrorResponseDetails {
    [key: string]: unknown;
}
export interface ErrorResponseError {
    message: string;
    code: string;
    status: number;
    details?: ErrorResponseDetails;
    stack?: string[];
}
export interface ErrorResponse {
    success: false;
    error: ErrorResponseError;
}
export interface ErrorHelperOptions {
    includeStack?: boolean;
    logLevel?: string;
}
export type ContextWithError = Context & {
    error: (error: Error | string | ErrorLike, statusCode?: number | null, details?: ErrorResponseDetails | null) => Response;
};
export declare function errorHelper(options?: ErrorHelperOptions): MiddlewareHandler;
export default errorHelper;
//# sourceMappingURL=error-helper.d.ts.map