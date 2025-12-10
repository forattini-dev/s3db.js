export interface SuccessOptions {
    status?: number;
    meta?: Record<string, unknown>;
}
export interface ErrorOptions {
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
}
export interface PaginationInfo {
    total?: number;
    page?: number;
    pageSize?: number;
    pageCount?: number;
}
export interface SuccessResponse<T = unknown> {
    success: true;
    data: T;
    meta: {
        timestamp: string;
        [key: string]: unknown;
    };
    _status: number;
}
export interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code: string;
        details: Record<string, unknown>;
        stack?: string;
    };
    meta: {
        timestamp: string;
    };
    _status: number;
}
export interface ListResponse<T = unknown> {
    success: true;
    data: T[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        pageCount: number;
    };
    meta: {
        timestamp: string;
    };
    _status: number;
}
export interface CreatedResponse<T = unknown> {
    success: true;
    data: T;
    meta: {
        timestamp: string;
        location?: string;
    };
    _status: number;
}
export interface NoContentResponse {
    success: true;
    data: null;
    meta: {
        timestamp: string;
    };
    _status: number;
}
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse | ListResponse<T> | CreatedResponse<T> | NoContentResponse;
export declare function success<T = unknown>(data: T, options?: SuccessOptions): SuccessResponse<T>;
export declare function error(err: string | Error, options?: ErrorOptions): ErrorResponse;
export declare function list<T = unknown>(items: T[], pagination?: PaginationInfo): ListResponse<T>;
export declare function created<T = unknown>(data: T, location?: string): CreatedResponse<T>;
export declare function noContent(): NoContentResponse;
export interface ValidationErrorItem {
    field?: string;
    message?: string;
    [key: string]: unknown;
}
export declare function validationError(errors: ValidationErrorItem[]): ErrorResponse;
export declare function notFound(resource: string, id: string): ErrorResponse;
export declare function unauthorized(message?: string): ErrorResponse;
export declare function forbidden(message?: string): ErrorResponse;
export declare function rateLimitExceeded(retryAfter: number): ErrorResponse;
export declare function payloadTooLarge(size: number, limit: number): ErrorResponse;
export interface CustomFormatters {
    success?: <T>(data: T, meta?: Record<string, unknown>) => SuccessResponse<T>;
    error?: (err: string | Error, status?: number, code?: string) => ErrorResponse;
    list?: <T>(items: T[], pagination?: PaginationInfo) => ListResponse<T>;
    created?: <T>(data: T, location?: string) => CreatedResponse<T>;
    noContent?: () => NoContentResponse;
    validationError?: (errors: ValidationErrorItem[]) => ErrorResponse;
    notFound?: (resource: string, id: string) => ErrorResponse;
    unauthorized?: (message?: string) => ErrorResponse;
    forbidden?: (message?: string) => ErrorResponse;
    rateLimitExceeded?: (retryAfter: number) => ErrorResponse;
    payloadTooLarge?: (size: number, limit: number) => ErrorResponse;
}
export interface Formatters {
    success: <T>(data: T, meta?: Record<string, unknown>) => SuccessResponse<T>;
    error: (err: string | Error, status?: number, code?: string) => ErrorResponse;
    list: <T>(items: T[], pagination?: PaginationInfo) => ListResponse<T>;
    created: <T>(data: T, location?: string) => CreatedResponse<T>;
    noContent: () => NoContentResponse;
    validationError: (errors: ValidationErrorItem[]) => ErrorResponse;
    notFound: (resource: string, id: string) => ErrorResponse;
    unauthorized: (message?: string) => ErrorResponse;
    forbidden: (message?: string) => ErrorResponse;
    rateLimitExceeded: (retryAfter: number) => ErrorResponse;
    payloadTooLarge: (size: number, limit: number) => ErrorResponse;
}
export declare function createCustomFormatters(customFormatters?: CustomFormatters): Formatters;
declare const _default: {
    success: typeof success;
    error: typeof error;
    list: typeof list;
    created: typeof created;
    noContent: typeof noContent;
    validationError: typeof validationError;
    notFound: typeof notFound;
    unauthorized: typeof unauthorized;
    forbidden: typeof forbidden;
    rateLimitExceeded: typeof rateLimitExceeded;
    payloadTooLarge: typeof payloadTooLarge;
    createCustomFormatters: typeof createCustomFormatters;
};
export default _default;
//# sourceMappingURL=response-formatter.d.ts.map