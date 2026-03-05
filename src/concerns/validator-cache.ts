import { createHash } from 'crypto';
import type { SecurityConfig } from './password-hashing.js';

export interface CachedValidator {
  validator: unknown;
  refCount: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface ValidatorOptions {
  security?: SecurityConfig;
  allNestedObjectsOptional?: boolean;
}

export interface ValidatorCacheStats {
  size: number;
  totalReferences: number;
  zeroRefValidators: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

export interface ValidatorCachePolicy {
  maxEntries?: number;
  maxAgeMs?: number;
  autoPrune?: boolean;
}

export interface CacheMemoryUsage {
  estimatedKB: number;
  estimatedMB: number;
  validatorCount: number;
}

const validatorCache = new Map<string, CachedValidator>();

let cacheHits = 0;
let cacheMisses = 0;
let maxCacheEntries = 5_000;
let maxCacheAgeMs = 5 * 60 * 1000;
let autoPruneEnabled = true;

const DEFAULT_MAX_ENTRIES = 5_000;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function pruneCandidates(maxAgeMs = maxCacheAgeMs): string[] {
  const now = Date.now();
  const removable: [string, CachedValidator][] = [];

  for (const [fingerprint, cached] of validatorCache.entries()) {
    if (cached.refCount === 0 && (now - cached.lastAccessedAt) >= maxAgeMs) {
      removable.push([fingerprint, cached]);
    }
  }

  removable.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
  return removable.map(([fingerprint]) => fingerprint);
}

export function configureValidatorCache(policy: ValidatorCachePolicy = {}): void {
  if (policy.maxEntries !== undefined) {
    if (!Number.isFinite(policy.maxEntries) || policy.maxEntries < 0) {
      throw new TypeError('Validator cache maxEntries must be a non-negative finite number');
    }
    maxCacheEntries = Math.trunc(policy.maxEntries);
  }

  if (policy.maxAgeMs !== undefined) {
    if (!Number.isFinite(policy.maxAgeMs) || policy.maxAgeMs < 0) {
      throw new TypeError('Validator cache maxAgeMs must be a non-negative finite number');
    }
    maxCacheAgeMs = Math.trunc(policy.maxAgeMs);
  }

  if (policy.autoPrune !== undefined) {
    autoPruneEnabled = policy.autoPrune;
  }

  if (autoPruneEnabled) {
    evictUnusedValidators();
  }
}

export function getValidatorCachePolicy(): ValidatorCachePolicy {
  return {
    maxEntries: maxCacheEntries,
    maxAgeMs: maxCacheAgeMs,
    autoPrune: autoPruneEnabled
  };
}

export function generateSchemaFingerprint(attributes: Record<string, unknown>, options: ValidatorOptions = {}): string {
  const normalized = {
    attributes: JSON.stringify(attributes, Object.keys(attributes).sort()),
    security: options.security ? JSON.stringify(options.security) : '',
    allNestedObjectsOptional: options.allNestedObjectsOptional ?? false
  };

  const serialized = JSON.stringify(normalized);
  return createHash('sha256').update(serialized).digest('hex');
}

export function getCachedValidator(fingerprint: string): unknown | null {
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

export function cacheValidator(fingerprint: string, validator: unknown): void {
  if (validatorCache.has(fingerprint)) {
    validatorCache.get(fingerprint)!.refCount++;
    return;
  }

  if (autoPruneEnabled && maxCacheEntries > 0) {
    evictUnusedValidators(maxCacheAgeMs);
  }

  if (maxCacheEntries > 0 && validatorCache.size >= maxCacheEntries) {
    const pruneOrder = pruneCandidates(maxCacheAgeMs);
    for (const staleFingerprint of pruneOrder) {
      if (validatorCache.size < maxCacheEntries) break;
      validatorCache.delete(staleFingerprint);
    }
  }

  validatorCache.set(fingerprint, {
    validator,
    refCount: 1,
    createdAt: Date.now(),
    lastAccessedAt: Date.now()
  });
}

export function releaseValidator(fingerprint: string): void {
  const cached = validatorCache.get(fingerprint);

  if (!cached) return;

  cached.refCount = Math.max(0, cached.refCount - 1);
}

export function evictUnusedValidators(maxAgeMs: number = maxCacheAgeMs): number {
  const now = Date.now();
  let evicted = 0;

  for (const [fingerprint, cached] of validatorCache.entries()) {
    if (cached.refCount === 0 && (now - cached.lastAccessedAt) >= maxAgeMs) {
      validatorCache.delete(fingerprint);
      evicted++;
    }
  }

  return evicted;
}

export function resetValidatorCachePolicy(): void {
  maxCacheEntries = DEFAULT_MAX_ENTRIES;
  maxCacheAgeMs = DEFAULT_MAX_AGE_MS;
  autoPruneEnabled = true;
}

export function getCacheStats(): ValidatorCacheStats {
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

export function clearValidatorCache(): void {
  validatorCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

export function getCacheMemoryUsage(): CacheMemoryUsage {
  const VALIDATOR_SIZE_KB = 50;

  return {
    estimatedKB: validatorCache.size * VALIDATOR_SIZE_KB,
    estimatedMB: (validatorCache.size * VALIDATOR_SIZE_KB) / 1024,
    validatorCount: validatorCache.size
  };
}
