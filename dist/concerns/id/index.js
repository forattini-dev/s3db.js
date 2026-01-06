/**
 * s3db.js ID Generation Module
 *
 * A superior ID generation system with:
 * - True uniform distribution via rejection sampling (zero modulo bias)
 * - Multiple ID formats: sid (s3db id), UUID v7, ULID
 * - Sortable IDs with timestamp prefix
 * - Pre-allocated entropy pool for performance
 * - URL-safe and S3-safe by default
 * - TypeScript native, zero external dependencies
 */
export { initPool, getRandomBytes, fillRandomBytes, randomIndexUnbiased, randomIndicesUnbiased, randomString, random48, random62, random80, calculateEntropyBits, calculateCollisionProbability, resetPool } from './entropy.js';
export { URL_SAFE, ALPHANUMERIC, ALPHANUMERIC_LOWER, ALPHANUMERIC_UPPER, HEX_LOWER, HEX_UPPER, CROCKFORD_BASE32, BASE58, BASE64_URL, NUMERIC, LOWERCASE, UPPERCASE, HUMAN_READABLE, NO_LOOKALIKE_LOWER, BINARY, EMOJI, alphabets, getAlphabet, recommendedLength, validateAlphabet } from './alphabets.js';
export { sid, customAlphabet, customAlphabetByName, sidWithOptions, sidEntropyBits, sidAsync, customAlphabetAsync, urlAlphabet } from './generators/sid.js';
export { uuidv7, uuidv7Compact, uuidv7Bytes, parseUuidv7Timestamp, parseUuidv7Date, isValidUuidv7, compareUuidv7, uuidv4, uuidNil, uuidMax } from './generators/uuid-v7.js';
export { ulid, ulidNonMonotonic, decodeTime as ulidDecodeTime, decodeDate as ulidDecodeDate, isValidUlid, ulidToUuid, ulidToBytes, bytesToUlid, compareUlid, minUlidForTime, maxUlidForTime, resetMonotonic as ulidResetMonotonic } from './generators/ulid.js';
import { sid, customAlphabet } from './generators/sid.js';
import { uuidv7 } from './generators/uuid-v7.js';
import { ulid } from './generators/ulid.js';
import { getAlphabet } from './alphabets.js';
/**
 * Generate an ID with the specified format.
 * Unified API for all ID formats.
 *
 * @example
 * generateId() // sid (default)
 * generateId({ format: 'uuid' }) // UUID v7
 * generateId({ format: 'ulid' }) // ULID
 * generateId({ size: 16 }) // shorter sid
 * generateId({ alphabet: 'ALPHANUMERIC' }) // alphanumeric sid
 */
export function generateId(options = {}) {
    const { format = 'sid', size, alphabet, timestamp } = options;
    switch (format) {
        case 'uuid':
        case 'uuidv7':
            return uuidv7(timestamp);
        case 'ulid':
            return ulid(timestamp);
        case 'sid':
        default:
            if (alphabet) {
                const resolvedAlphabet = getAlphabet(alphabet);
                return customAlphabet(resolvedAlphabet, size ?? 21)();
            }
            return sid(size);
    }
}
/**
 * Check if an ID matches a specific format.
 */
export function detectIdFormat(id) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return 'uuidv7';
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return 'uuid';
    }
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) {
        return 'ulid';
    }
    if (id.length >= 10 && id.length <= 36) {
        return 'sid';
    }
    return null;
}
export default {
    generateId,
    detectIdFormat,
    sid,
    uuidv7,
    ulid
};
//# sourceMappingURL=index.js.map