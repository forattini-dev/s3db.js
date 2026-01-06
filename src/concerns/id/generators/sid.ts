import { randomString, calculateEntropyBits } from '../entropy.js';
import { URL_SAFE, getAlphabet, validateAlphabet } from '../alphabets.js';

const DEFAULT_SIZE = 21;

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
export function sid(size: number = DEFAULT_SIZE): string {
  return randomString(URL_SAFE, size);
}

/**
 * Create a custom sid generator with specified alphabet.
 * Returns a function that generates IDs with that alphabet.
 */
export function customAlphabet(alphabet: string, defaultSize: number = DEFAULT_SIZE): (size?: number) => string {
  const error = validateAlphabet(alphabet);
  if (error) {
    throw new Error(`Invalid alphabet: ${error}`);
  }

  return (size: number = defaultSize): string => {
    return randomString(alphabet, size);
  };
}

/**
 * Create a custom sid generator with alphabet name.
 * Supports: URL_SAFE, ALPHANUMERIC, BASE58, HEX_LOWER, etc.
 */
export function customAlphabetByName(name: string, defaultSize: number = DEFAULT_SIZE): (size?: number) => string {
  const alphabet = getAlphabet(name);
  return customAlphabet(alphabet, defaultSize);
}

/**
 * Generate a sid with options object.
 */
export function sidWithOptions(options: SidOptions = {}): string {
  const { alphabet = URL_SAFE, size = DEFAULT_SIZE } = options;
  const resolvedAlphabet = getAlphabet(alphabet);

  const error = validateAlphabet(resolvedAlphabet);
  if (error) {
    throw new Error(`Invalid alphabet: ${error}`);
  }

  return randomString(resolvedAlphabet, size);
}

/**
 * Calculate entropy bits for a sid configuration.
 */
export function sidEntropyBits(alphabet: string = URL_SAFE, size: number = DEFAULT_SIZE): number {
  const resolvedAlphabet = getAlphabet(alphabet);
  return calculateEntropyBits(resolvedAlphabet.length, size);
}

/**
 * Async version for compatibility.
 * Note: Our implementation is already synchronous and fast,
 * this is just for API compatibility.
 */
export async function sidAsync(size: number = DEFAULT_SIZE): Promise<string> {
  return sid(size);
}

/**
 * Async version with custom alphabet.
 */
export function customAlphabetAsync(alphabet: string, defaultSize: number = DEFAULT_SIZE): (size?: number) => Promise<string> {
  const syncFn = customAlphabet(alphabet, defaultSize);
  return async (size?: number): Promise<string> => syncFn(size);
}

/**
 * URL-safe alphabet constant.
 */
export const urlAlphabet = URL_SAFE;

export default sid;
