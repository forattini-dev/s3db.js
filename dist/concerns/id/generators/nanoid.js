import { randomString, calculateEntropyBits } from '../entropy.js';
import { URL_SAFE, getAlphabet, validateAlphabet } from '../alphabets.js';
const DEFAULT_SIZE = 21;
/**
 * Generate a nanoid-compatible ID.
 * Default: 21 characters using URL-safe alphabet (126 bits of entropy).
 *
 * Unlike original nanoid which uses `bytes[i] & 63` (modulo bias for non-64 alphabets),
 * this implementation uses rejection sampling for true uniform distribution.
 */
export function nanoid(size = DEFAULT_SIZE) {
    return randomString(URL_SAFE, size);
}
/**
 * Create a custom nanoid generator with specified alphabet.
 * Returns a function that generates IDs with that alphabet.
 */
export function customAlphabet(alphabet, defaultSize = DEFAULT_SIZE) {
    const error = validateAlphabet(alphabet);
    if (error) {
        throw new Error(`Invalid alphabet: ${error}`);
    }
    return (size = defaultSize) => {
        return randomString(alphabet, size);
    };
}
/**
 * Create a custom nanoid generator with alphabet name.
 * Supports: URL_SAFE, ALPHANUMERIC, BASE58, HEX_LOWER, etc.
 */
export function customAlphabetByName(name, defaultSize = DEFAULT_SIZE) {
    const alphabet = getAlphabet(name);
    return customAlphabet(alphabet, defaultSize);
}
/**
 * Generate a nanoid with options object.
 */
export function nanoidWithOptions(options = {}) {
    const { alphabet = URL_SAFE, size = DEFAULT_SIZE } = options;
    const resolvedAlphabet = getAlphabet(alphabet);
    const error = validateAlphabet(resolvedAlphabet);
    if (error) {
        throw new Error(`Invalid alphabet: ${error}`);
    }
    return randomString(resolvedAlphabet, size);
}
/**
 * Calculate entropy bits for a nanoid configuration.
 */
export function nanoidEntropyBits(alphabet = URL_SAFE, size = DEFAULT_SIZE) {
    const resolvedAlphabet = getAlphabet(alphabet);
    return calculateEntropyBits(resolvedAlphabet.length, size);
}
/**
 * Async version for compatibility with original nanoid/async.
 * Note: Our implementation is already synchronous and fast,
 * this is just for API compatibility.
 */
export async function nanoidAsync(size = DEFAULT_SIZE) {
    return nanoid(size);
}
/**
 * Async version with custom alphabet.
 */
export function customAlphabetAsync(alphabet, defaultSize = DEFAULT_SIZE) {
    const syncFn = customAlphabet(alphabet, defaultSize);
    return async (size) => syncFn(size);
}
/**
 * URL-safe ID shorthand (backward compatibility).
 */
export const urlAlphabet = URL_SAFE;
export default nanoid;
//# sourceMappingURL=nanoid.js.map