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
export declare function generateSchemaFingerprint(attributes: Record<string, unknown>, options?: ValidatorOptions): string;
export declare function getCachedValidator(fingerprint: string): unknown | null;
export declare function cacheValidator(fingerprint: string, validator: unknown): void;
export declare function releaseValidator(fingerprint: string): void;
export declare function evictUnusedValidators(maxAgeMs?: number): number;
export declare function getCacheStats(): ValidatorCacheStats;
export declare function clearValidatorCache(): void;
export declare function getCacheMemoryUsage(): CacheMemoryUsage;
//# sourceMappingURL=validator-cache.d.ts.map