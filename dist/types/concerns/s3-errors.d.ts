/**
 * S3 Error Classification Utilities
 *
 * Provides consistent error classification across all S3 operations.
 * Handles differences between AWS SDK v3, MinIO, and other S3-compatible clients.
 */
/**
 * Checks if an error indicates the object/resource was not found.
 * Handles various S3 client error formats (AWS SDK v3, MinIO, etc.)
 */
export declare function isNotFoundError(error: unknown): boolean;
/**
 * Checks if an error indicates access was denied.
 */
export declare function isAccessDeniedError(error: unknown): boolean;
/**
 * Checks if an error is a transient/retriable error (network, timeout, etc.)
 */
export declare function isTransientError(error: unknown): boolean;
//# sourceMappingURL=s3-errors.d.ts.map