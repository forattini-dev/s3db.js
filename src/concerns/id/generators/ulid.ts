import { random80 } from '../entropy.js';
import { CROCKFORD_BASE32 } from '../alphabets.js';

const ENCODING = CROCKFORD_BASE32;
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const ULID_LEN = TIME_LEN + RANDOM_LEN;

const TIME_MAX = Math.pow(2, 48) - 1;

let lastTime = 0;
let lastRandom = 0n;

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
export function ulid(timestamp?: number): string {
  const now = timestamp ?? Date.now();

  if (now > TIME_MAX) {
    throw new Error('ULID timestamp overflow: timestamp exceeds 48 bits');
  }

  let randomPart: bigint;

  if (now === lastTime) {
    lastRandom += 1n;
    if (lastRandom > 0xFFFFFFFFFFFFFFFFFFFFn) {
      throw new Error('ULID random overflow: too many ULIDs in same millisecond');
    }
    randomPart = lastRandom;
  } else {
    randomPart = random80();
    lastTime = now;
    lastRandom = randomPart;
  }

  return encodeTime(now) + encodeRandom(randomPart);
}

/**
 * Generate a non-monotonic ULID.
 * Does not increment random part for same-millisecond calls.
 * Use when strict sortability within millisecond is not required.
 */
export function ulidNonMonotonic(timestamp?: number): string {
  const now = timestamp ?? Date.now();

  if (now > TIME_MAX) {
    throw new Error('ULID timestamp overflow: timestamp exceeds 48 bits');
  }

  return encodeTime(now) + encodeRandom(random80());
}

/**
 * Encode timestamp to Crockford Base32 (10 characters).
 */
function encodeTime(timestamp: number): string {
  let time = timestamp;
  let str = '';

  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    str = ENCODING[mod]! + str;
    time = Math.floor(time / ENCODING_LEN);
  }

  return str;
}

/**
 * Encode random 80-bit value to Crockford Base32 (16 characters).
 */
function encodeRandom(random: bigint): string {
  let str = '';

  for (let i = RANDOM_LEN - 1; i >= 0; i--) {
    const mod = Number(random % BigInt(ENCODING_LEN));
    str = ENCODING[mod]! + str;
    random = random / BigInt(ENCODING_LEN);
  }

  return str;
}

/**
 * Decode a ULID timestamp to milliseconds.
 */
export function decodeTime(id: string): number {
  if (id.length !== ULID_LEN) {
    throw new Error(`Invalid ULID length: expected ${ULID_LEN}, got ${id.length}`);
  }

  const timeStr = id.slice(0, TIME_LEN).toUpperCase();
  let time = 0;

  for (let i = 0; i < TIME_LEN; i++) {
    const char = timeStr[i]!;
    const index = ENCODING.indexOf(char);

    if (index === -1) {
      throw new Error(`Invalid ULID character: ${char}`);
    }

    time = time * ENCODING_LEN + index;
  }

  return time;
}

/**
 * Decode a ULID to Date object.
 */
export function decodeDate(id: string): Date {
  return new Date(decodeTime(id));
}

/**
 * Validate if a string is a valid ULID.
 */
export function isValidUlid(id: string): boolean {
  if (id.length !== ULID_LEN) {
    return false;
  }

  const upper = id.toUpperCase();
  for (const char of upper) {
    if (!ENCODING.includes(char)) {
      return false;
    }
  }

  return true;
}

/**
 * Convert ULID to UUID format.
 * Returns a UUID string representation of the ULID bytes.
 */
export function ulidToUuid(id: string): string {
  const bytes = ulidToBytes(id);
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Convert ULID to byte array.
 */
export function ulidToBytes(id: string): Uint8Array {
  if (id.length !== ULID_LEN) {
    throw new Error(`Invalid ULID length: expected ${ULID_LEN}, got ${id.length}`);
  }

  const upper = id.toUpperCase();
  const bytes = new Uint8Array(16);

  let value = 0n;
  for (let i = 0; i < ULID_LEN; i++) {
    const char = upper[i]!;
    const index = ENCODING.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid ULID character: ${char}`);
    }
    value = value * BigInt(ENCODING_LEN) + BigInt(index);
  }

  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(value & 0xFFn);
    value = value >> 8n;
  }

  return bytes;
}

/**
 * Convert byte array to ULID.
 */
export function bytesToUlid(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(`Invalid byte array length: expected 16, got ${bytes.length}`);
  }

  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value = (value << 8n) | BigInt(bytes[i]!);
  }

  let result = '';
  for (let i = 0; i < ULID_LEN; i++) {
    result = ENCODING[Number(value % BigInt(ENCODING_LEN))]! + result;
    value = value / BigInt(ENCODING_LEN);
  }

  return result;
}

/**
 * Compare two ULIDs for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareUlid(a: string, b: string): number {
  return a.toUpperCase().localeCompare(b.toUpperCase());
}

/**
 * Generate minimum ULID for a given timestamp.
 * Useful for range queries: "all ULIDs after timestamp X"
 */
export function minUlidForTime(timestamp: number): string {
  return encodeTime(timestamp) + '0'.repeat(RANDOM_LEN);
}

/**
 * Generate maximum ULID for a given timestamp.
 * Useful for range queries: "all ULIDs before timestamp X"
 */
export function maxUlidForTime(timestamp: number): string {
  return encodeTime(timestamp) + 'Z'.repeat(RANDOM_LEN);
}

/**
 * Reset monotonic state (useful for testing).
 */
export function resetMonotonic(): void {
  lastTime = 0;
  lastRandom = 0n;
}

export default ulid;
