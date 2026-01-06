/**
 * Safe Merge Utilities
 *
 * Provides functions to sanitize object keys before merging,
 * preventing prototype pollution attacks via __proto__, constructor, or prototype keys.
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
/**
 * Check if a key is dangerous for object property assignment.
 * Handles both simple keys and dot-notation paths.
 */
export function isDangerousKey(key) {
    if (DANGEROUS_KEYS.includes(key)) {
        return true;
    }
    if (key.includes('.')) {
        return key.split('.').some(part => DANGEROUS_KEYS.includes(part));
    }
    return false;
}
/**
 * Filter out dangerous keys from an object.
 * Returns a new object with only safe keys.
 */
export function sanitizeKeys(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([key]) => !isDangerousKey(key)));
}
/**
 * Recursively sanitize an object, removing dangerous keys at all levels.
 * Use this for deep merge operations.
 */
export function sanitizeDeep(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeDeep(item));
    }
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!isDangerousKey(key)) {
            result[key] = sanitizeDeep(value);
        }
    }
    return result;
}
//# sourceMappingURL=safe-merge.js.map