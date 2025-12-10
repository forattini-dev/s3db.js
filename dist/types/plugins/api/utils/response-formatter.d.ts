export interface ResponseMeta {
    timestamp: string;
    location?: string;
    [key: string]: unknown;
}
export interface SuccessResponse<T = unknown> {
    success: true;
    data: T;
    meta: ResponseMeta;
    _status: number;
}
export interface ErrorDetails {
    errors?: ValidationError[];
    resource?: string;
    id?: string;
    retryAfter?: number;
    receivedSize?: number;
    maxSize?: number;
    receivedMB?: string;
    maxMB?: string;
    [key: string]: unknown;
}
export interface ErrorResponseBody {
    message: string;
    code: string;
    details: ErrorDetails;
    stack?: string;
}
export interface ErrorResponse {
    success: false;
    error: ErrorResponseBody;
    meta: ResponseMeta;
    _status: number;
}
export interface PaginationInfo {
    total?: number;
    page?: number;
    pageSize?: number;
    pageCount?: number;
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
    meta: ResponseMeta;
    _status: number;
}
export interface SuccessOptions {
    status?: number;
    meta?: Record<string, unknown>;
}
export interface ErrorOptions {
    status?: number;
    code?: string;
    details?: ErrorDetails;
}
export interface ValidationError {
    field: string;
    message: string;
    [key: string]: unknown;
}
export declare function filterProtectedFields<T>(data: T, protectedFields: string[] | null | undefined): T;
export declare function success<T = unknown>(data: T, options?: SuccessOptions): SuccessResponse<T>;
export declare function error(errorInput: string | Error, options?: ErrorOptions): ErrorResponse;
export declare function list<T = unknown>(items: T[], pagination?: PaginationInfo): ListResponse<T>;
export declare function created<T = unknown>(data: T, location?: string): SuccessResponse<T>;
export declare function noContent(): SuccessResponse<null>;
export declare function validationError(errors: ValidationError[]): ErrorResponse;
export declare function notFound(resource: string, id: string): ErrorResponse;
export declare function unauthorized(message?: string): ErrorResponse;
export declare function forbidden(message?: string): ErrorResponse;
export declare function rateLimitExceeded(retryAfter: number): ErrorResponse;
export declare function payloadTooLarge(size: number, limit: number): ErrorResponse;
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
    filterProtectedFields: typeof filterProtectedFields;
};
export default _default;
//# sourceMappingURL=response-formatter.d.ts.map