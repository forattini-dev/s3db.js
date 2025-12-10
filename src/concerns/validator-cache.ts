import { createHash } from 'crypto';

export interface CachedValidator {
  validator: unknown;
  refCount: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface ValidatorOptions {
  passphrase?: string;
  bcryptRounds?: number;
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

export interface CacheMemoryUsage {
  estimatedKB: number;
  estimatedMB: number;
  validatorCount: number;
}

const validatorCache = new Map<string, CachedValidator>();

let cacheHits = 0;
let cacheMisses = 0;

export function generateSchemaFingerprint(attributes: Record<string, unknown>, options: ValidatorOptions = {}): string {
  const normalized = {
    attributes: JSON.stringify(attributes, Object.keys(attributes).sort()),
    passphrase: options.passphrase || 'secret',
    bcryptRounds: options.bcryptRounds || 10,
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

export function evictUnusedValidators(maxAgeMs: number = 5 * 60 * 1000): number {
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
