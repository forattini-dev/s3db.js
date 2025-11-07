/**
 * Validator Cache
 *
 * Caches compiled validators by schema fingerprint to avoid recreating
 * expensive validator instances for identical schemas.
 *
 * Memory Impact:
 * - Each unique validator: ~50KB
 * - With caching: 50KB total for 100 identical resources (vs 5MB without cache)
 * - 99% memory reduction for duplicate schemas
 */

import { createHash } from 'crypto';

// Global validator cache
// Key: schema fingerprint (SHA-256 hash)
// Value: { validator, refCount, createdAt }
const validatorCache = new Map();

// Cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generate fingerprint for a schema
 * Uses SHA-256 hash of serialized attributes + options
 *
 * @param {Object} attributes - Schema attributes
 * @param {Object} options - Validator options (passphrase, bcryptRounds, etc.)
 * @returns {string} SHA-256 fingerprint
 */
export function generateSchemaFingerprint(attributes, options = {}) {
  // Create stable serialization (sorted keys to ensure consistency)
  const normalized = {
    attributes: JSON.stringify(attributes, Object.keys(attributes).sort()),
    passphrase: options.passphrase || 'secret',
    bcryptRounds: options.bcryptRounds || 10,
    allNestedObjectsOptional: options.allNestedObjectsOptional ?? false
  };

  const serialized = JSON.stringify(normalized);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Get cached validator or return null if not found
 *
 * @param {string} fingerprint - Schema fingerprint
 * @returns {Object|null} Validator instance or null
 */
export function getCachedValidator(fingerprint) {
  const cached = validatorCache.get(fingerprint);

  if (cached) {
    cached.refCount++;
    cached.lastAccessedAt = Date.now();
    cacheHits++;
    return cached.validator;
  }

  cacheMisses++;
  return null;
}

/**
 * Cache a compiled validator
 *
 * @param {string} fingerprint - Schema fingerprint
 * @param {Object} validator - Compiled validator instance
 */
export function cacheValidator(fingerprint, validator) {
  if (validatorCache.has(fingerprint)) {
    // Already cached, just increment ref count
    validatorCache.get(fingerprint).refCount++;
    return;
  }

  validatorCache.set(fingerprint, {
    validator,
    refCount: 1,
    createdAt: Date.now(),
    lastAccessedAt: Date.now()
  });
}

/**
 * Release a validator reference
 * If ref count reaches 0, mark for eviction (but keep for a grace period)
 *
 * @param {string} fingerprint - Schema fingerprint
 */
export function releaseValidator(fingerprint) {
  const cached = validatorCache.get(fingerprint);

  if (!cached) return;

  cached.refCount = Math.max(0, cached.refCount - 1);

  // Don't immediately remove - keep for grace period in case resource is recreated
  // Actual eviction happens in evictUnusedValidators()
}

/**
 * Evict validators with zero references that haven't been used recently
 *
 * @param {number} maxAgeMs - Max age for zero-ref validators (default: 5 minutes)
 * @returns {number} Number of validators evicted
 */
export function evictUnusedValidators(maxAgeMs = 5 * 60 * 1000) {
  const now = Date.now();
  let evicted = 0;

  for (const [fingerprint, cached] of validatorCache.entries()) {
    if (cached.refCount === 0 && (now - cached.lastAccessedAt) > maxAgeMs) {
      validatorCache.delete(fingerprint);
      evicted++;
    }
  }

  return evicted;
}

/**
 * Get cache statistics
 *
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
  let totalRefCount = 0;
  let zeroRefCount = 0;

  for (const cached of validatorCache.values()) {
    totalRefCount += cached.refCount;
    if (cached.refCount === 0) zeroRefCount++;
  }

  return {
    size: validatorCache.size,
    totalReferences: totalRefCount,
    zeroRefValidators: zeroRefCount,
    cacheHits,
    cacheMisses,
    hitRate: cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses)) : 0
  };
}

/**
 * Clear all validators from cache
 * Use with caution - mainly for testing
 */
export function clearValidatorCache() {
  validatorCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

/**
 * Get estimated memory usage of validator cache
 *
 * @returns {Object} Memory usage stats
 */
export function getCacheMemoryUsage() {
  // Each compiled validator is approximately 50KB
  const VALIDATOR_SIZE_KB = 50;

  return {
    estimatedKB: validatorCache.size * VALIDATOR_SIZE_KB,
    estimatedMB: (validatorCache.size * VALIDATOR_SIZE_KB) / 1024,
    validatorCount: validatorCache.size
  };
}
