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
export { URL_SAFE, ALPHANUMERIC, ALPHANUMERIC_LOWER, ALPHANUMERIC_UPPER, HEX_LOWER, HEX_UPPER, CROCKFORD_BASE32, BASE58, BASE64_URL, NUMERIC, LOWERCASE, UPPERCASE, HUMAN_READABLE, NO_LOOKALIKE_LOWER, BINARY, EMOJI, alphabets, getAlphabet, recommendedLength, validateAlphabet, type AlphabetName } from './alphabets.js';
export { sid, customAlphabet, customAlphabetByName, sidWithOptions, sidEntropyBits, sidAsync, customAlphabetAsync, urlAlphabet, type SidOptions } from './generators/sid.js';
export { uuidv7, uuidv7Compact, uuidv7Bytes, parseUuidv7Timestamp, parseUuidv7Date, isValidUuidv7, compareUuidv7, uuidv4, uuidNil, uuidMax } from './generators/uuid-v7.js';
export { ulid, ulidNonMonotonic, decodeTime as ulidDecodeTime, decodeDate as ulidDecodeDate, isValidUlid, ulidToUuid, ulidToBytes, bytesToUlid, compareUlid, minUlidForTime, maxUlidForTime, resetMonotonic as ulidResetMonotonic } from './generators/ulid.js';
import { sid } from './generators/sid.js';
import { uuidv7 } from './generators/uuid-v7.js';
import { ulid } from './generators/ulid.js';
export type IdFormat = 'sid' | 'uuid' | 'uuidv7' | 'ulid';
export interface GenerateIdOptions {
    format?: IdFormat;
    size?: number;
    alphabet?: string;
    timestamp?: number;
}
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
export declare function generateId(options?: GenerateIdOptions): string;
/**
 * Check if an ID matches a specific format.
 */
export declare function detectIdFormat(id: string): IdFormat | null;
declare const _default: {
    generateId: typeof generateId;
    detectIdFormat: typeof detectIdFormat;
    sid: typeof sid;
    uuidv7: typeof uuidv7;
    ulid: typeof ulid;
};
export default _default;
//# sourceMappingURL=index.d.ts.map