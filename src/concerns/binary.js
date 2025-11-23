/**
 * Binary/Buffer Encoding Utilities
 *
 * Provides compact Base64 encoding for binary data (Buffer, Uint8Array)
 * to save space in S3 metadata.
 *
 * Following the same pattern as ip.js for consistency.
 *
 * Types:
 * - `buffer` - Generic binary data (variable length)
 * - `bits:N` - Fixed-size bitmap (N bits)
 *
 * Savings:
 * - Base64 overhead: ~33% (1KB buffer → ~1.33KB encoded)
 * - With 2KB metadata limit → ~1.5KB usable binary data (~12,000 bits)
 */

import { ValidationError } from '../errors.js';

/**
 * Encode Buffer to Base64 string
 *
 * @param {Buffer|Uint8Array} buffer - Binary data to encode
 * @returns {string} Base64-encoded string
 *
 * @example
 * const buffer = Buffer.from([0b10101010, 0b11110000]);
 * encodeBuffer(buffer); // "qvA="
 */
export function encodeBuffer(buffer) {
  if (buffer === null || buffer === undefined) {
    return null;
  }

  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new ValidationError('Value must be a Buffer or Uint8Array', {
      field: 'buffer',
      value: typeof buffer,
      retriable: false,
      suggestion: 'Pass a Buffer or Uint8Array instance.'
    });
  }

  // Convert Uint8Array to Buffer if needed
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return buf.toString('base64');
}

/**
 * Decode Base64 string back to Buffer
 *
 * @param {string} encoded - Base64-encoded string
 * @returns {Buffer} Decoded binary data
 *
 * @example
 * decodeBuffer("qvA="); // <Buffer aa f0>
 */
export function decodeBuffer(encoded) {
  if (encoded === null || encoded === undefined) {
    return null;
  }

  if (typeof encoded !== 'string') {
    throw new ValidationError('Encoded buffer must be a string', {
      field: 'encoded',
      value: typeof encoded,
      retriable: false,
      suggestion: 'Pass the base64-encoded string returned by encodeBuffer().'
    });
  }

  return Buffer.from(encoded, 'base64');
}

/**
 * Encode a bitmap (Buffer) with optional size validation
 *
 * @param {Buffer|Uint8Array} buffer - Bitmap data
 * @param {number} [expectedBits] - Expected number of bits (optional, enables validation)
 * @param {boolean} [skipValidation=false] - Skip all validation for performance-critical paths
 * @returns {string} Base64-encoded string
 *
 * @example
 * // Fixed 1024 bits = 128 bytes
 * const bitmap = Buffer.alloc(128);
 * bitmap[0] = 0b10101010;
 * encodeBits(bitmap, 1024); // "qgAAAA..."
 * encodeBits(bitmap, null, true); // Skip validation (fastest)
 */
export function encodeBits(buffer, expectedBits = null, skipValidation = false) {
  // Fast path: skip all validation
  if (skipValidation) {
    return buffer.toString('base64');
  }

  if (buffer === null || buffer === undefined) {
    return null;
  }

  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new ValidationError('Bitmap must be a Buffer or Uint8Array', {
      field: 'bits',
      value: typeof buffer,
      retriable: false,
      suggestion: 'Pass a Buffer or Uint8Array instance.'
    });
  }

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // Validate size if expectedBits is specified
  if (expectedBits !== null) {
    const expectedBytes = (expectedBits + 7) >> 3;
    if (buf.length !== expectedBytes) {
      throw new ValidationError(`Bitmap size mismatch: expected ${expectedBytes} bytes (${expectedBits} bits), got ${buf.length} bytes`, {
        field: 'bits',
        expectedBits,
        expectedBytes,
        actualBytes: buf.length,
        retriable: false,
        suggestion: `Use Buffer.alloc(${expectedBytes}) to create a bitmap with ${expectedBits} bits.`
      });
    }
  }

  return buf.toString('base64');
}

/**
 * Decode Base64 string back to bitmap Buffer
 *
 * @param {string} encoded - Base64-encoded string
 * @param {number} [expectedBits] - Expected number of bits (optional, enables validation)
 * @param {boolean} [skipValidation=false] - Skip all validation for performance-critical paths
 * @returns {Buffer} Decoded bitmap
 *
 * @example
 * const bitmap = decodeBits("qgAAAA...", 1024);
 * const bit5 = (bitmap[0] >> 5) & 1; // Get bit 5
 * decodeBits(str, null, true); // Skip validation (fastest)
 */
export function decodeBits(encoded, expectedBits = null, skipValidation = false) {
  // Fast path: skip all validation
  if (skipValidation) {
    return Buffer.from(encoded, 'base64');
  }

  if (encoded === null || encoded === undefined) {
    return null;
  }

  if (typeof encoded !== 'string') {
    throw new ValidationError('Encoded bits must be a string', {
      field: 'encoded',
      value: typeof encoded,
      retriable: false,
      suggestion: 'Pass the base64-encoded string returned by encodeBits().'
    });
  }

  const buffer = Buffer.from(encoded, 'base64');

  // Validate size if expectedBits is specified
  if (expectedBits !== null) {
    const expectedBytes = (expectedBits + 7) >> 3;
    if (buffer.length !== expectedBytes) {
      throw new ValidationError(`Decoded bitmap size mismatch: expected ${expectedBytes} bytes (${expectedBits} bits), got ${buffer.length} bytes`, {
        field: 'bits',
        expectedBits,
        expectedBytes,
        actualBytes: buffer.length,
        retriable: false,
        suggestion: 'Ensure the encoded string was produced by encodeBits() with the same bit count.'
      });
    }
  }

  return buffer;
}

/**
 * Helper: Create an empty bitmap with N bits
 *
 * @param {number} bits - Number of bits
 * @param {boolean} [skipValidation=false] - Skip validation for performance-critical paths
 * @returns {Buffer} Zero-filled buffer
 *
 * @example
 * const bitmap = createBitmap(1024); // 128 bytes, all zeros
 * const fastBitmap = createBitmap(1024, true); // Skip validation
 */
export function createBitmap(bits, skipValidation = false) {
  if (!skipValidation && (typeof bits !== 'number' || bits <= 0 || !Number.isInteger(bits))) {
    throw new ValidationError('Bits must be a positive integer', {
      field: 'bits',
      value: bits,
      retriable: false,
      suggestion: 'Pass a positive integer for the number of bits.'
    });
  }

  return Buffer.alloc((bits + 7) >> 3); // Faster than Math.ceil(bits / 8)
}

/**
 * Helper: Set a bit in a bitmap
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (0-based)
 * @returns {Buffer} Same buffer (mutated)
 *
 * @example
 * setBit(bitmap, 42); // Set bit 42
 */
export function setBit(bitmap, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;

  if (byteIndex >= bitmap.length) {
    throw new ValidationError(`Bit index ${index} out of bounds for bitmap of ${bitmap.length * 8} bits`, {
      field: 'index',
      value: index,
      maxBits: bitmap.length * 8,
      retriable: false
    });
  }

  bitmap[byteIndex] |= (1 << bitIndex);
  return bitmap;
}

/**
 * Helper: Clear a bit in a bitmap
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (0-based)
 * @returns {Buffer} Same buffer (mutated)
 */
export function clearBit(bitmap, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;

  if (byteIndex >= bitmap.length) {
    throw new ValidationError(`Bit index ${index} out of bounds for bitmap of ${bitmap.length * 8} bits`, {
      field: 'index',
      value: index,
      maxBits: bitmap.length * 8,
      retriable: false
    });
  }

  bitmap[byteIndex] &= ~(1 << bitIndex);
  return bitmap;
}

/**
 * Helper: Get a bit from a bitmap
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (0-based)
 * @returns {0|1} Bit value
 */
export function getBit(bitmap, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;

  if (byteIndex >= bitmap.length) {
    throw new ValidationError(`Bit index ${index} out of bounds for bitmap of ${bitmap.length * 8} bits`, {
      field: 'index',
      value: index,
      maxBits: bitmap.length * 8,
      retriable: false
    });
  }

  return (bitmap[byteIndex] >> bitIndex) & 1;
}

/**
 * Helper: Toggle a bit in a bitmap
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (0-based)
 * @returns {Buffer} Same buffer (mutated)
 */
export function toggleBit(bitmap, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;

  if (byteIndex >= bitmap.length) {
    throw new ValidationError(`Bit index ${index} out of bounds for bitmap of ${bitmap.length * 8} bits`, {
      field: 'index',
      value: index,
      maxBits: bitmap.length * 8,
      retriable: false
    });
  }

  bitmap[byteIndex] ^= (1 << bitIndex);
  return bitmap;
}

/**
 * Helper: Count set bits (popcount) in a bitmap
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @returns {number} Number of set bits
 */
export function countBits(bitmap) {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) {
    let byte = bitmap[i];
    while (byte) {
      count += byte & 1;
      byte >>= 1;
    }
  }
  return count;
}

/**
 * Calculate space savings for buffer encoding
 *
 * @param {Buffer|number} bufferOrSize - Buffer or size in bytes
 * @returns {Object} Savings information
 */
export function calculateBufferSavings(bufferOrSize) {
  const originalSize = typeof bufferOrSize === 'number'
    ? bufferOrSize
    : bufferOrSize.length;

  // Base64 encoding: 4 chars per 3 bytes, rounded up
  const encodedSize = Math.ceil(originalSize / 3) * 4;

  const overhead = ((encodedSize - originalSize) / originalSize) * 100;

  return {
    originalBytes: originalSize,
    originalBits: originalSize * 8,
    encodedSize,
    overhead: Math.round(overhead * 100) / 100,
    overheadPercent: `${Math.round(overhead)}%`,
    fitsInMetadata: encodedSize <= 1500, // ~1.5KB usable in 2KB metadata
    maxBitsInMetadata: Math.floor(1500 * 3 / 4) * 8 // ~9000 bits safely
  };
}

// ============================================================================
// FAST PATH FUNCTIONS (no validation, use with trusted input only)
// ============================================================================

/**
 * Ultra-fast bitmap creation (no validation)
 * Use when bits is guaranteed to be a valid positive integer
 *
 * @param {number} bits - Number of bits (must be valid positive integer)
 * @returns {Buffer} Zero-filled buffer
 */
export function createBitmapFast(bits) {
  return Buffer.alloc((bits + 7) >> 3);
}

/**
 * Ultra-fast bit set (no bounds checking)
 * Use when index is guaranteed to be within bounds
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (must be within bounds)
 */
export function setBitFast(bitmap, index) {
  bitmap[index >> 3] |= (1 << (index & 7));
}

/**
 * Ultra-fast bit get (no bounds checking)
 * Use when index is guaranteed to be within bounds
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (must be within bounds)
 * @returns {0|1} Bit value
 */
export function getBitFast(bitmap, index) {
  return (bitmap[index >> 3] >> (index & 7)) & 1;
}

/**
 * Ultra-fast bit clear (no bounds checking)
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (must be within bounds)
 */
export function clearBitFast(bitmap, index) {
  bitmap[index >> 3] &= ~(1 << (index & 7));
}

/**
 * Ultra-fast bit toggle (no bounds checking)
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @param {number} index - Bit index (must be within bounds)
 */
export function toggleBitFast(bitmap, index) {
  bitmap[index >> 3] ^= (1 << (index & 7));
}

// Precomputed popcount lookup table (256 entries for byte values 0-255)
const POPCOUNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let count = 0;
  let n = i;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  POPCOUNT_TABLE[i] = count;
}

/**
 * Ultra-fast popcount using lookup table
 * ~2-3x faster than bit-by-bit counting
 *
 * @param {Buffer} bitmap - The bitmap buffer
 * @returns {number} Number of set bits
 */
export function countBitsFast(bitmap) {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) {
    count += POPCOUNT_TABLE[bitmap[i]];
  }
  return count;
}

/**
 * Ultra-fast encode (no validation)
 *
 * @param {Buffer} buffer - Buffer to encode (must be valid)
 * @returns {string} Base64-encoded string
 */
export function encodeBitsFast(buffer) {
  return buffer.toString('base64');
}

/**
 * Ultra-fast decode (no validation)
 *
 * @param {string} encoded - Base64 string (must be valid)
 * @returns {Buffer} Decoded buffer
 */
export function decodeBitsFast(encoded) {
  return Buffer.from(encoded, 'base64');
}

export default {
  // Safe functions (with validation)
  encodeBuffer,
  decodeBuffer,
  encodeBits,
  decodeBits,
  createBitmap,
  setBit,
  clearBit,
  getBit,
  toggleBit,
  countBits,
  calculateBufferSavings,
  // Fast functions (no validation)
  createBitmapFast,
  setBitFast,
  getBitFast,
  clearBitFast,
  toggleBitFast,
  countBitsFast,
  encodeBitsFast,
  decodeBitsFast,
};
