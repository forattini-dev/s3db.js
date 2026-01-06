/**
 * Initialize or resize the entropy pool.
 * Uses a pre-allocated buffer to reduce GC pressure and improve performance.
 */
export declare function initPool(size?: number): void;
/**
 * Get cryptographically secure random bytes from the pool.
 * Automatically refills the pool when exhausted.
 */
export declare function getRandomBytes(count: number): Uint8Array;
/**
 * Fill a pre-allocated buffer with random bytes.
 * More efficient than getRandomBytes when you already have a buffer.
 */
export declare function fillRandomBytes(buffer: Uint8Array): Uint8Array;
/**
 * Generate a random index into an alphabet using rejection sampling.
 * This eliminates modulo bias for non-power-of-2 alphabet sizes.
 *
 * For an alphabet of size N, we find the largest multiple of N that fits
 * in 256 (or 65536 for larger alphabets). Any random value >= that threshold
 * is rejected and we try again.
 *
 * Example: For alphabet size 62:
 * - threshold = 256 - (256 % 62) = 256 - 8 = 248
 * - We accept bytes 0-247 (maps evenly to 0-61, 4 times each)
 * - We reject bytes 248-255 (would cause bias)
 * - Rejection rate: 8/256 = 3.125%
 */
export declare function randomIndexUnbiased(alphabetSize: number): number;
/**
 * Generate multiple unbiased random indices efficiently.
 * Pre-calculates rejection threshold and batches random byte generation.
 */
export declare function randomIndicesUnbiased(alphabetSize: number, count: number): Uint16Array;
/**
 * Generate a string from an alphabet using unbiased random selection.
 * This is the core function for generating IDs.
 */
export declare function randomString(alphabet: string, length: number): string;
/**
 * Generate a random 48-bit integer for timestamp-based IDs.
 * Uses 6 bytes of entropy.
 */
export declare function random48(): bigint;
/**
 * Generate a random 62-bit integer (fits in signed 64-bit).
 * Uses 8 bytes of entropy with top 2 bits masked.
 */
export declare function random62(): bigint;
/**
 * Generate a random 80-bit integer for ULID random component.
 * Uses 10 bytes of entropy.
 */
export declare function random80(): bigint;
/**
 * Calculate the entropy bits for a given alphabet size and ID length.
 */
export declare function calculateEntropyBits(alphabetSize: number, length: number): number;
/**
 * Calculate the collision probability for a given number of IDs.
 * Uses birthday paradox approximation: p ≈ n² / (2 * 2^bits)
 */
export declare function calculateCollisionProbability(entropyBits: number, idCount: number): number;
/**
 * Reset the entropy pool (useful for testing).
 */
export declare function resetPool(): void;
declare const _default: {
    initPool: typeof initPool;
    getRandomBytes: typeof getRandomBytes;
    fillRandomBytes: typeof fillRandomBytes;
    randomIndexUnbiased: typeof randomIndexUnbiased;
    randomIndicesUnbiased: typeof randomIndicesUnbiased;
    randomString: typeof randomString;
    random48: typeof random48;
    random62: typeof random62;
    random80: typeof random80;
    calculateEntropyBits: typeof calculateEntropyBits;
    calculateCollisionProbability: typeof calculateCollisionProbability;
    resetPool: typeof resetPool;
};
export default _default;
//# sourceMappingURL=entropy.d.ts.map