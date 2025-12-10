/**
 * Binary/Buffer Encoding Utilities
 *
 * Provides compact Base64 encoding for binary data (Buffer, Uint8Array)
 * to save space in S3 metadata.
 */

import { ValidationError } from '../errors.js';

export type BitValue = 0 | 1;

export interface BufferSavingsResult {
  originalBytes: number;
  originalBits: number;
  encodedSize: number;
  overhead: number;
  overheadPercent: string;
  fitsInMetadata: boolean;
  maxBitsInMetadata: number;
}

/**
 * Encode Buffer to Base64 string
 */
export function encodeBuffer(buffer: Buffer | Uint8Array | null | undefined): string | null {
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

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return buf.toString('base64');
}

/**
 * Decode Base64 string back to Buffer
 */
export function decodeBuffer(encoded: string | null | undefined): Buffer | null {
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
 */
export function encodeBits(
  buffer: Buffer | Uint8Array | null | undefined,
  expectedBits: number | null = null,
  skipValidation = false
): string | null {
  if (skipValidation) {
    return (buffer as Buffer).toString('base64');
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
 */
export function decodeBits(
  encoded: string | null | undefined,
  expectedBits: number | null = null,
  skipValidation = false
): Buffer | null {
  if (skipValidation) {
    return Buffer.from(encoded as string, 'base64');
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
 */
export function createBitmap(bits: number, skipValidation = false): Buffer {
  if (!skipValidation && (typeof bits !== 'number' || bits <= 0 || !Number.isInteger(bits))) {
    throw new ValidationError('Bits must be a positive integer', {
      field: 'bits',
      value: bits,
      retriable: false,
      suggestion: 'Pass a positive integer for the number of bits.'
    });
  }

  return Buffer.alloc((bits + 7) >> 3);
}

/**
 * Helper: Set a bit in a bitmap
 */
export function setBit(bitmap: Buffer, index: number): Buffer {
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

  bitmap[byteIndex]! |= (1 << bitIndex);
  return bitmap;
}

/**
 * Helper: Clear a bit in a bitmap
 */
export function clearBit(bitmap: Buffer, index: number): Buffer {
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

  bitmap[byteIndex]! &= ~(1 << bitIndex);
  return bitmap;
}

/**
 * Helper: Get a bit from a bitmap
 */
export function getBit(bitmap: Buffer, index: number): BitValue {
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

  return ((bitmap[byteIndex]! >> bitIndex) & 1) as BitValue;
}

/**
 * Helper: Toggle a bit in a bitmap
 */
export function toggleBit(bitmap: Buffer, index: number): Buffer {
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

  bitmap[byteIndex]! ^= (1 << bitIndex);
  return bitmap;
}

/**
 * Helper: Count set bits (popcount) in a bitmap
 */
export function countBits(bitmap: Buffer): number {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) {
    let byte = bitmap[i]!;
    while (byte) {
      count += byte & 1;
      byte >>= 1;
    }
  }
  return count;
}

/**
 * Calculate space savings for buffer encoding
 */
export function calculateBufferSavings(bufferOrSize: Buffer | number): BufferSavingsResult {
  const originalSize = typeof bufferOrSize === 'number'
    ? bufferOrSize
    : bufferOrSize.length;

  const encodedSize = Math.ceil(originalSize / 3) * 4;
  const overhead = ((encodedSize - originalSize) / originalSize) * 100;

  return {
    originalBytes: originalSize,
    originalBits: originalSize * 8,
    encodedSize,
    overhead: Math.round(overhead * 100) / 100,
    overheadPercent: `${Math.round(overhead)}%`,
    fitsInMetadata: encodedSize <= 1500,
    maxBitsInMetadata: Math.floor(1500 * 3 / 4) * 8
  };
}

// ============================================================================
// FAST PATH FUNCTIONS (no validation, use with trusted input only)
// ============================================================================

/**
 * Ultra-fast bitmap creation (no validation)
 */
export function createBitmapFast(bits: number): Buffer {
  return Buffer.alloc((bits + 7) >> 3);
}

/**
 * Ultra-fast bit set (no bounds checking)
 */
export function setBitFast(bitmap: Buffer, index: number): void {
  bitmap[index >> 3]! |= (1 << (index & 7));
}

/**
 * Ultra-fast bit get (no bounds checking)
 */
export function getBitFast(bitmap: Buffer, index: number): BitValue {
  return ((bitmap[index >> 3]! >> (index & 7)) & 1) as BitValue;
}

/**
 * Ultra-fast bit clear (no bounds checking)
 */
export function clearBitFast(bitmap: Buffer, index: number): void {
  bitmap[index >> 3]! &= ~(1 << (index & 7));
}

/**
 * Ultra-fast bit toggle (no bounds checking)
 */
export function toggleBitFast(bitmap: Buffer, index: number): void {
  bitmap[index >> 3]! ^= (1 << (index & 7));
}

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
 */
export function countBitsFast(bitmap: Buffer): number {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) {
    count += POPCOUNT_TABLE[bitmap[i]!]!;
  }
  return count;
}

/**
 * Ultra-fast encode (no validation)
 */
export function encodeBitsFast(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Ultra-fast decode (no validation)
 */
export function decodeBitsFast(encoded: string): Buffer {
  return Buffer.from(encoded, 'base64');
}

export default {
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
  createBitmapFast,
  setBitFast,
  getBitFast,
  clearBitFast,
  toggleBitFast,
  countBitsFast,
  encodeBitsFast,
  decodeBitsFast,
};
