/**
 * S3 Key Utilities
 *
 * S3 keys always use POSIX-style forward slashes regardless of the operating system.
 * These utilities ensure consistent key construction across all platforms.
 */
/**
 * Join path segments for S3 keys using forward slashes.
 * Unlike path.join(), this always uses '/' as separator.
 * Also normalizes any backslashes within segments to forward slashes.
 */
export declare function joinS3Key(...segments: string[]): string;
/**
 * Normalize an S3 key by replacing backslashes with forward slashes.
 * Useful when migrating keys that may have been incorrectly constructed.
 */
export declare function normalizeS3Key(key: string): string;
/**
 * Validates that a value is safe for use in S3 keys.
 * IDs and partition values must be URL-friendly (no /, \, =, or %).
 * Returns true if valid, false if contains unsafe characters.
 */
export declare function isValidS3KeySegment(value: string): boolean;
/**
 * Validates a value for S3 key usage, throwing ValidationError if invalid.
 * Use this for IDs and partition values.
 * Accepts any value type - coerces to string for validation.
 */
export declare function validateS3KeySegment(value: unknown, context: string): void;
//# sourceMappingURL=s3-key.d.ts.map