import { getRandomBytes } from '../entropy.js';
const HEX_CHARS = '0123456789abcdef';
/**
 * Generate a UUID v7 according to RFC 9562.
 *
 * Structure (128 bits total):
 * - bits 0-47: Unix timestamp in milliseconds (48 bits)
 * - bits 48-51: Version (4 bits, always 0111 = 7)
 * - bits 52-63: Random (12 bits)
 * - bits 64-65: Variant (2 bits, always 10)
 * - bits 66-127: Random (62 bits)
 *
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * where y is 8, 9, a, or b (variant bits)
 *
 * Total entropy: 74 bits random + 48 bits timestamp
 * Sortable: Yes (lexicographically by timestamp)
 */
export function uuidv7(timestamp) {
    const ts = timestamp ?? Date.now();
    const bytes = getRandomBytes(10);
    const tsHigh = Math.floor(ts / 0x10000);
    const tsLow = ts % 0x10000;
    let uuid = '';
    uuid += HEX_CHARS[(tsHigh >> 28) & 0xf];
    uuid += HEX_CHARS[(tsHigh >> 24) & 0xf];
    uuid += HEX_CHARS[(tsHigh >> 20) & 0xf];
    uuid += HEX_CHARS[(tsHigh >> 16) & 0xf];
    uuid += HEX_CHARS[(tsHigh >> 12) & 0xf];
    uuid += HEX_CHARS[(tsHigh >> 8) & 0xf];
    uuid += HEX_CHARS[(tsHigh >> 4) & 0xf];
    uuid += HEX_CHARS[tsHigh & 0xf];
    uuid += '-';
    uuid += HEX_CHARS[(tsLow >> 12) & 0xf];
    uuid += HEX_CHARS[(tsLow >> 8) & 0xf];
    uuid += HEX_CHARS[(tsLow >> 4) & 0xf];
    uuid += HEX_CHARS[tsLow & 0xf];
    uuid += '-';
    uuid += '7';
    uuid += HEX_CHARS[bytes[0] & 0xf];
    uuid += HEX_CHARS[(bytes[1] >> 4) & 0xf];
    uuid += HEX_CHARS[bytes[1] & 0xf];
    uuid += '-';
    uuid += HEX_CHARS[0x8 | ((bytes[2] >> 4) & 0x3)];
    uuid += HEX_CHARS[bytes[2] & 0xf];
    uuid += HEX_CHARS[(bytes[3] >> 4) & 0xf];
    uuid += HEX_CHARS[bytes[3] & 0xf];
    uuid += '-';
    for (let i = 4; i < 10; i++) {
        uuid += HEX_CHARS[(bytes[i] >> 4) & 0xf];
        uuid += HEX_CHARS[bytes[i] & 0xf];
    }
    return uuid;
}
/**
 * Generate a UUID v7 without hyphens (compact form).
 * 32 characters instead of 36.
 */
export function uuidv7Compact(timestamp) {
    return uuidv7(timestamp).replace(/-/g, '');
}
/**
 * Generate a UUID v7 as bytes (Uint8Array).
 * Useful for binary storage.
 */
export function uuidv7Bytes(timestamp) {
    const ts = timestamp ?? Date.now();
    const randomBytes = getRandomBytes(10);
    const result = new Uint8Array(16);
    result[0] = (ts / 0x10000000000) & 0xff;
    result[1] = (ts / 0x100000000) & 0xff;
    result[2] = (ts / 0x1000000) & 0xff;
    result[3] = (ts / 0x10000) & 0xff;
    result[4] = (ts / 0x100) & 0xff;
    result[5] = ts & 0xff;
    result[6] = 0x70 | (randomBytes[0] & 0x0f);
    result[7] = randomBytes[1];
    result[8] = 0x80 | (randomBytes[2] & 0x3f);
    result[9] = randomBytes[3];
    for (let i = 4; i < 10; i++) {
        result[6 + i] = randomBytes[i];
    }
    return result;
}
/**
 * Parse a UUID v7 string to extract timestamp.
 * Returns the Unix timestamp in milliseconds.
 */
export function parseUuidv7Timestamp(uuid) {
    const hex = uuid.replace(/-/g, '');
    if (hex.length !== 32) {
        throw new Error('Invalid UUID format');
    }
    const tsHex = hex.slice(0, 12);
    return parseInt(tsHex, 16);
}
/**
 * Parse a UUID v7 to Date object.
 */
export function parseUuidv7Date(uuid) {
    return new Date(parseUuidv7Timestamp(uuid));
}
/**
 * Validate if a string is a valid UUID v7.
 */
export function isValidUuidv7(uuid) {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return pattern.test(uuid);
}
/**
 * Compare two UUID v7s for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareUuidv7(a, b) {
    const aCompact = a.replace(/-/g, '').toLowerCase();
    const bCompact = b.replace(/-/g, '').toLowerCase();
    return aCompact.localeCompare(bCompact);
}
/**
 * Generate UUID v4 (random, non-sortable) for comparison.
 * Provided for completeness but UUID v7 is preferred.
 */
export function uuidv4() {
    const bytes = getRandomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let uuid = '';
    for (let i = 0; i < 16; i++) {
        if (i === 4 || i === 6 || i === 8 || i === 10) {
            uuid += '-';
        }
        uuid += HEX_CHARS[(bytes[i] >> 4) & 0xf];
        uuid += HEX_CHARS[bytes[i] & 0xf];
    }
    return uuid;
}
/**
 * Generate a nil UUID (all zeros).
 */
export function uuidNil() {
    return '00000000-0000-0000-0000-000000000000';
}
/**
 * Generate a max UUID (all ones).
 */
export function uuidMax() {
    return 'ffffffff-ffff-ffff-ffff-ffffffffffff';
}
export default uuidv7;
//# sourceMappingURL=uuid-v7.js.map