/**
 * Generate a ULID (Universally Unique Lexicographically Sortable Identifier).
 *
 * Structure (128 bits total):
 * - 48 bits: Unix timestamp in milliseconds (encoded as 10 Crockford Base32 chars)
 * - 80 bits: Random (encoded as 16 Crockford Base32 chars)
 *
 * Format: TTTTTTTTTTRRRRRRRRRRRRRRRRR (26 characters)
 *
 * Features:
 * - Lexicographically sortable by timestamp
 * - Case insensitive
 * - No special characters (URL safe)
 * - 1.21e+24 unique ULIDs per millisecond
 *
 * Monotonic: If called multiple times within the same millisecond,
 * the random component is incremented to ensure sortability.
 */
export declare function ulid(timestamp?: number): string;
/**
 * Generate a non-monotonic ULID.
 * Does not increment random part for same-millisecond calls.
 * Use when strict sortability within millisecond is not required.
 */
export declare function ulidNonMonotonic(timestamp?: number): string;
/**
 * Decode a ULID timestamp to milliseconds.
 */
export declare function decodeTime(id: string): number;
/**
 * Decode a ULID to Date object.
 */
export declare function decodeDate(id: string): Date;
/**
 * Validate if a string is a valid ULID.
 */
export declare function isValidUlid(id: string): boolean;
/**
 * Convert ULID to UUID format.
 * Returns a UUID string representation of the ULID bytes.
 */
export declare function ulidToUuid(id: string): string;
/**
 * Convert ULID to byte array.
 */
export declare function ulidToBytes(id: string): Uint8Array;
/**
 * Convert byte array to ULID.
 */
export declare function bytesToUlid(bytes: Uint8Array): string;
/**
 * Compare two ULIDs for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export declare function compareUlid(a: string, b: string): number;
/**
 * Generate minimum ULID for a given timestamp.
 * Useful for range queries: "all ULIDs after timestamp X"
 */
export declare function minUlidForTime(timestamp: number): string;
/**
 * Generate maximum ULID for a given timestamp.
 * Useful for range queries: "all ULIDs before timestamp X"
 */
export declare function maxUlidForTime(timestamp: number): string;
/**
 * Reset monotonic state (useful for testing).
 */
export declare function resetMonotonic(): void;
export default ulid;
//# sourceMappingURL=ulid.d.ts.map