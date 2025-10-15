import { S3dbError } from '../errors.js';

/**
 * CacheError - Errors related to cache operations
 *
 * Used for cache operations including:
 * - Cache driver initialization and setup
 * - Cache get/set/delete operations
 * - Cache invalidation and warming
 * - Driver-specific operations (memory, filesystem, S3)
 * - Resource-level caching
 *
 * @extends S3dbError
 */
export class CacheError extends S3dbError {
  constructor(message, details = {}) {
    const { driver = 'unknown', operation = 'unknown', resourceName, key, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Cache Operation Error

Driver: ${driver}
Operation: ${operation}
${resourceName ? `Resource: ${resourceName}` : ''}
${key ? `Key: ${key}` : ''}

Common causes:
1. Invalid cache key format
2. Cache driver not properly initialized
3. Resource not found or not cached
4. Memory limits exceeded
5. Filesystem permissions issues

Solution:
Check cache configuration and ensure the cache driver is properly initialized.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/cache.md
`.trim();
    }

    super(message, { ...rest, driver, operation, resourceName, key, description,
      suggestion: details.suggestion || 'Check cache configuration and driver settings.' });
  }
}

export default CacheError;
