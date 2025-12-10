import type { Context } from 'hono';
export interface S3DBError extends Error {
    resource?: string;
    bucket?: string;
    key?: string;
    operation?: string;
    suggestion?: string;
    availableResources?: string[];
}
export interface ErrorDetails {
    resource?: string;
    bucket?: string;
    key?: string;
    operation?: string;
    suggestion?: string;
    availableResources?: string[];
    [key: string]: unknown;
}
export declare function getStatusFromError(err: Error | S3DBError): number;
export declare function errorHandler(err: Error | S3DBError, c: Context): Response;
export type AsyncRouteHandler = (c: Context) => Promise<Response>;
export declare function asyncHandler(fn: AsyncRouteHandler): AsyncRouteHandler;
export type TryApiCallResult<T> = [true, null, T] | [false, Error, Response];
export declare function tryApiCall<T>(fn: () => Promise<T>, c: Context): Promise<TryApiCallResult<T>>;
declare const _default: {
    errorHandler: typeof errorHandler;
    asyncHandler: typeof asyncHandler;
    tryApiCall: typeof tryApiCall;
    getStatusFromError: typeof getStatusFromError;
};
export default _default;
//# sourceMappingURL=error-handler.d.ts.map