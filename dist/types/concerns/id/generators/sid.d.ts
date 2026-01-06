export interface SidOptions {
    alphabet?: string;
    size?: number;
}
/**
 * Generate a short unique ID (s3db id).
 * Default: 21 characters using URL-safe alphabet (126 bits of entropy).
 *
 * Uses rejection sampling for true uniform distribution (zero modulo bias).
 */
export declare function sid(size?: number): string;
/**
 * Create a custom sid generator with specified alphabet.
 * Returns a function that generates IDs with that alphabet.
 */
export declare function customAlphabet(alphabet: string, defaultSize?: number): (size?: number) => string;
/**
 * Create a custom sid generator with alphabet name.
 * Supports: URL_SAFE, ALPHANUMERIC, BASE58, HEX_LOWER, etc.
 */
export declare function customAlphabetByName(name: string, defaultSize?: number): (size?: number) => string;
/**
 * Generate a sid with options object.
 */
export declare function sidWithOptions(options?: SidOptions): string;
/**
 * Calculate entropy bits for a sid configuration.
 */
export declare function sidEntropyBits(alphabet?: string, size?: number): number;
/**
 * Async version for compatibility.
 * Note: Our implementation is already synchronous and fast,
 * this is just for API compatibility.
 */
export declare function sidAsync(size?: number): Promise<string>;
/**
 * Async version with custom alphabet.
 */
export declare function customAlphabetAsync(alphabet: string, defaultSize?: number): (size?: number) => Promise<string>;
/**
 * URL-safe alphabet constant.
 */
export declare const urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
export default sid;
//# sourceMappingURL=sid.d.ts.map