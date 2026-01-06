/**
 * Safe Merge Utilities
 *
 * Provides functions to sanitize object keys before merging,
 * preventing prototype pollution attacks via __proto__, constructor, or prototype keys.
 */

const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

/**
 * Check if a key is dangerous for object property assignment.
 * Handles both simple keys and dot-notation paths.
 */
export function isDangerousKey(key: string): boolean {
  if (DANGEROUS_KEYS.includes(key as typeof DANGEROUS_KEYS[number])) {
    return true;
  }

  if (key.includes('.')) {
    return key.split('.').some(part =>
      DANGEROUS_KEYS.includes(part as typeof DANGEROUS_KEYS[number])
    );
  }

  return false;
}

/**
 * Filter out dangerous keys from an object.
 * Returns a new object with only safe keys.
 */
export function sanitizeKeys<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !isDangerousKey(key))
  ) as T;
}

/**
 * Recursively sanitize an object, removing dangerous keys at all levels.
 * Use this for deep merge operations.
 */
export function sanitizeDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeDeep(item)) as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!isDangerousKey(key)) {
      result[key] = sanitizeDeep(value);
    }
  }

  return result as T;
}
