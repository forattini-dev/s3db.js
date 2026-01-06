import { randomFillSync } from 'node:crypto';
const DEFAULT_POOL_SIZE = 2048;
const MIN_POOL_SIZE = 256;
let pool;
let poolOffset = 0;
/**
 * Initialize or resize the entropy pool.
 * Uses a pre-allocated buffer to reduce GC pressure and improve performance.
 */
export function initPool(size = DEFAULT_POOL_SIZE) {
    const actualSize = Math.max(size, MIN_POOL_SIZE);
    pool = new Uint8Array(actualSize);
    randomFillSync(pool);
    poolOffset = 0;
}
/**
 * Get cryptographically secure random bytes from the pool.
 * Automatically refills the pool when exhausted.
 */
export function getRandomBytes(count) {
    if (!pool) {
        initPool();
    }
    if (count > pool.length) {
        const bytes = new Uint8Array(count);
        randomFillSync(bytes);
        return bytes;
    }
    if (poolOffset + count > pool.length) {
        randomFillSync(pool);
        poolOffset = 0;
    }
    const bytes = pool.slice(poolOffset, poolOffset + count);
    poolOffset += count;
    return bytes;
}
/**
 * Fill a pre-allocated buffer with random bytes.
 * More efficient than getRandomBytes when you already have a buffer.
 */
export function fillRandomBytes(buffer) {
    if (!pool) {
        initPool();
    }
    const needed = buffer.length;
    if (poolOffset + needed <= pool.length) {
        buffer.set(pool.subarray(poolOffset, poolOffset + needed));
        poolOffset += needed;
    }
    else {
        const remaining = pool.length - poolOffset;
        if (remaining > 0) {
            buffer.set(pool.subarray(poolOffset, pool.length), 0);
        }
        randomFillSync(pool);
        poolOffset = 0;
        buffer.set(pool.subarray(0, needed - remaining), remaining);
        poolOffset = needed - remaining;
    }
    return buffer;
}
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
export function randomIndexUnbiased(alphabetSize) {
    if (alphabetSize <= 0 || alphabetSize > 65536) {
        throw new Error(`Invalid alphabet size: ${alphabetSize}. Must be 1-65536.`);
    }
    if (alphabetSize === 1) {
        return 0;
    }
    if (alphabetSize <= 256) {
        const threshold = 256 - (256 % alphabetSize);
        let byte;
        do {
            const bytes = getRandomBytes(1);
            byte = bytes[0];
        } while (byte >= threshold);
        return byte % alphabetSize;
    }
    const threshold = 65536 - (65536 % alphabetSize);
    let value;
    do {
        const bytes = getRandomBytes(2);
        value = (bytes[0] << 8) | bytes[1];
    } while (value >= threshold);
    return value % alphabetSize;
}
/**
 * Generate multiple unbiased random indices efficiently.
 * Pre-calculates rejection threshold and batches random byte generation.
 */
export function randomIndicesUnbiased(alphabetSize, count) {
    if (alphabetSize <= 0 || alphabetSize > 65536) {
        throw new Error(`Invalid alphabet size: ${alphabetSize}. Must be 1-65536.`);
    }
    const result = new Uint16Array(count);
    if (alphabetSize === 1) {
        return result;
    }
    if (alphabetSize <= 256) {
        const threshold = 256 - (256 % alphabetSize);
        const estimatedBytes = Math.ceil(count * (256 / threshold) * 1.1);
        let bytes = getRandomBytes(Math.max(estimatedBytes, count * 2));
        let byteIndex = 0;
        let resultIndex = 0;
        while (resultIndex < count) {
            if (byteIndex >= bytes.length) {
                const extraBytes = getRandomBytes(Math.max(16, (count - resultIndex) * 2));
                const newBytes = new Uint8Array(bytes.length + extraBytes.length);
                newBytes.set(bytes);
                newBytes.set(extraBytes, bytes.length);
                bytes = newBytes;
                byteIndex = 0;
            }
            const byte = bytes[byteIndex++];
            if (byte < threshold) {
                result[resultIndex++] = byte % alphabetSize;
            }
        }
        return result;
    }
    const threshold = 65536 - (65536 % alphabetSize);
    const estimatedBytes = Math.ceil(count * 2 * (65536 / threshold) * 1.1);
    let bytes = getRandomBytes(Math.max(estimatedBytes, count * 4));
    let byteIndex = 0;
    let resultIndex = 0;
    while (resultIndex < count) {
        if (byteIndex + 1 >= bytes.length) {
            const extraBytes = getRandomBytes(Math.max(32, (count - resultIndex) * 4));
            const newBytes = new Uint8Array(bytes.length + extraBytes.length);
            newBytes.set(bytes);
            newBytes.set(extraBytes, bytes.length);
            bytes = newBytes;
        }
        const value = (bytes[byteIndex] << 8) | bytes[byteIndex + 1];
        byteIndex += 2;
        if (value < threshold) {
            result[resultIndex++] = value % alphabetSize;
        }
    }
    return result;
}
/**
 * Generate a string from an alphabet using unbiased random selection.
 * This is the core function for generating IDs.
 */
export function randomString(alphabet, length) {
    const alphabetSize = alphabet.length;
    const indices = randomIndicesUnbiased(alphabetSize, length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += alphabet[indices[i]];
    }
    return result;
}
/**
 * Generate a random 48-bit integer for timestamp-based IDs.
 * Uses 6 bytes of entropy.
 */
export function random48() {
    const bytes = getRandomBytes(6);
    return ((BigInt(bytes[0]) << 40n) |
        (BigInt(bytes[1]) << 32n) |
        (BigInt(bytes[2]) << 24n) |
        (BigInt(bytes[3]) << 16n) |
        (BigInt(bytes[4]) << 8n) |
        BigInt(bytes[5]));
}
/**
 * Generate a random 62-bit integer (fits in signed 64-bit).
 * Uses 8 bytes of entropy with top 2 bits masked.
 */
export function random62() {
    const bytes = getRandomBytes(8);
    return ((BigInt(bytes[0] & 0x3f) << 56n) |
        (BigInt(bytes[1]) << 48n) |
        (BigInt(bytes[2]) << 40n) |
        (BigInt(bytes[3]) << 32n) |
        (BigInt(bytes[4]) << 24n) |
        (BigInt(bytes[5]) << 16n) |
        (BigInt(bytes[6]) << 8n) |
        BigInt(bytes[7]));
}
/**
 * Generate a random 80-bit integer for ULID random component.
 * Uses 10 bytes of entropy.
 */
export function random80() {
    const bytes = getRandomBytes(10);
    let result = 0n;
    for (let i = 0; i < 10; i++) {
        result = (result << 8n) | BigInt(bytes[i]);
    }
    return result;
}
/**
 * Calculate the entropy bits for a given alphabet size and ID length.
 */
export function calculateEntropyBits(alphabetSize, length) {
    return Math.log2(alphabetSize) * length;
}
/**
 * Calculate the collision probability for a given number of IDs.
 * Uses birthday paradox approximation: p ≈ n² / (2 * 2^bits)
 */
export function calculateCollisionProbability(entropyBits, idCount) {
    const totalCombinations = Math.pow(2, entropyBits);
    return (idCount * idCount) / (2 * totalCombinations);
}
/**
 * Reset the entropy pool (useful for testing).
 */
export function resetPool() {
    pool = undefined;
    poolOffset = 0;
}
export default {
    initPool,
    getRandomBytes,
    fillRandomBytes,
    randomIndexUnbiased,
    randomIndicesUnbiased,
    randomString,
    random48,
    random62,
    random80,
    calculateEntropyBits,
    calculateCollisionProbability,
    resetPool
};
//# sourceMappingURL=entropy.js.map