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
export declare function uuidv7(timestamp?: number): string;
/**
 * Generate a UUID v7 without hyphens (compact form).
 * 32 characters instead of 36.
 */
export declare function uuidv7Compact(timestamp?: number): string;
/**
 * Generate a UUID v7 as bytes (Uint8Array).
 * Useful for binary storage.
 */
export declare function uuidv7Bytes(timestamp?: number): Uint8Array;
/**
 * Parse a UUID v7 string to extract timestamp.
 * Returns the Unix timestamp in milliseconds.
 */
export declare function parseUuidv7Timestamp(uuid: string): number;
/**
 * Parse a UUID v7 to Date object.
 */
export declare function parseUuidv7Date(uuid: string): Date;
/**
 * Validate if a string is a valid UUID v7.
 */
export declare function isValidUuidv7(uuid: string): boolean;
/**
 * Compare two UUID v7s for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export declare function compareUuidv7(a: string, b: string): number;
/**
 * Generate UUID v4 (random, non-sortable) for comparison.
 * Provided for completeness but UUID v7 is preferred.
 */
export declare function uuidv4(): string;
/**
 * Generate a nil UUID (all zeros).
 */
export declare function uuidNil(): string;
/**
 * Generate a max UUID (all ones).
 */
export declare function uuidMax(): string;
export default uuidv7;
//# sourceMappingURL=uuid-v7.d.ts.map