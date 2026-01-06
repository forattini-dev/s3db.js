/**
 * Safe Merge Utilities
 *
 * Provides functions to sanitize object keys before merging,
 * preventing prototype pollution attacks via __proto__, constructor, or prototype keys.
 */
/**
 * Check if a key is dangerous for object property assignment.
 * Handles both simple keys and dot-notation paths.
 */
export declare function isDangerousKey(key: string): boolean;
/**
 * Filter out dangerous keys from an object.
 * Returns a new object with only safe keys.
 */
export declare function sanitizeKeys<T extends Record<string, unknown>>(obj: T): T;
/**
 * Recursively sanitize an object, removing dangerous keys at all levels.
 * Use this for deep merge operations.
 */
export declare function sanitizeDeep<T>(obj: T): T;
//# sourceMappingURL=safe-merge.d.ts.map