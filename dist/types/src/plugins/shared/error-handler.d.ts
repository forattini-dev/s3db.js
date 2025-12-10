import type { Context } from 'hono';
import type { S3DBLogger } from '../../concerns/logger.js';
export interface S3DBError extends Error {
    resource?: string;
    bucket?: string;
    key?: string;
    operation?: string;
    suggestion?: string;
    availableResources?: string[];
}
export interface ErrorHandlerContext {
    logger: S3DBLogger;
}
export declare function getStatusFromError(err: Error): number;
export declare function createErrorHandler(context: ErrorHandlerContext): (err: S3DBError, c: Context) => Response;
export declare function errorHandler(this: ErrorHandlerContext, err: S3DBError, c: Context): Response;
export declare function asyncHandler(fn: (c: Context) => Promise<Response>, context?: ErrorHandlerContext): (c: Context) => Promise<Response>;
export type TryApiCallResult<T> = [true, null, T] | [false, Error, Response];
export declare function tryApiCall<T>(fn: () => Promise<T>, c: Context, context?: ErrorHandlerContext): Promise<TryApiCallResult<T>>;
declare const _default: {
    errorHandler: typeof errorHandler;
    asyncHandler: typeof asyncHandler;
    tryApiCall: typeof tryApiCall;
    getStatusFromError: typeof getStatusFromError;
    createErrorHandler: typeof createErrorHandler;
};
export default _default;
//# sourceMappingURL=error-handler.d.ts.map