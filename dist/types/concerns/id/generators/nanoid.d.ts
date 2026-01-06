export interface NanoidOptions {
    alphabet?: string;
    size?: number;
}
/**
 * Generate a nanoid-compatible ID.
 * Default: 21 characters using URL-safe alphabet (126 bits of entropy).
 *
 * Unlike original nanoid which uses `bytes[i] & 63` (modulo bias for non-64 alphabets),
 * this implementation uses rejection sampling for true uniform distribution.
 */
export declare function nanoid(size?: number): string;
/**
 * Create a custom nanoid generator with specified alphabet.
 * Returns a function that generates IDs with that alphabet.
 */
export declare function customAlphabet(alphabet: string, defaultSize?: number): (size?: number) => string;
/**
 * Create a custom nanoid generator with alphabet name.
 * Supports: URL_SAFE, ALPHANUMERIC, BASE58, HEX_LOWER, etc.
 */
export declare function customAlphabetByName(name: string, defaultSize?: number): (size?: number) => string;
/**
 * Generate a nanoid with options object.
 */
export declare function nanoidWithOptions(options?: NanoidOptions): string;
/**
 * Calculate entropy bits for a nanoid configuration.
 */
export declare function nanoidEntropyBits(alphabet?: string, size?: number): number;
/**
 * Async version for compatibility with original nanoid/async.
 * Note: Our implementation is already synchronous and fast,
 * this is just for API compatibility.
 */
export declare function nanoidAsync(size?: number): Promise<string>;
/**
 * Async version with custom alphabet.
 */
export declare function customAlphabetAsync(alphabet: string, defaultSize?: number): (size?: number) => Promise<string>;
/**
 * URL-safe ID shorthand (backward compatibility).
 */
export declare const urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
export default nanoid;
//# sourceMappingURL=nanoid.d.ts.map