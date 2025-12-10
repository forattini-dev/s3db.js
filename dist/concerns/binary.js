/**
 * Binary/Buffer Encoding Utilities
 *
 * Provides compact Base64 encoding for binary data (Buffer, Uint8Array)
 * to save space in S3 metadata.
 */
import { ValidationError } from '../errors.js';
/**
 * Encode Buffer to Base64 string
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
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return buf.toString('base64');
}
/**
 * Decode Base64 string back to Buffer
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
 */
export function encodeBits(buffer, expectedBits = null, skipValidation = false) {
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
export function decodeBits(encoded, expectedBits = null, skipValidation = false) {
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
export function createBitmap(bits, skipValidation = false) {
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
    return ((bitmap[byteIndex] >> bitIndex) & 1);
}
/**
 * Helper: Toggle a bit in a bitmap
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
 */
export function calculateBufferSavings(bufferOrSize) {
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
export function createBitmapFast(bits) {
    return Buffer.alloc((bits + 7) >> 3);
}
/**
 * Ultra-fast bit set (no bounds checking)
 */
export function setBitFast(bitmap, index) {
    bitmap[index >> 3] |= (1 << (index & 7));
}
/**
 * Ultra-fast bit get (no bounds checking)
 */
export function getBitFast(bitmap, index) {
    return ((bitmap[index >> 3] >> (index & 7)) & 1);
}
/**
 * Ultra-fast bit clear (no bounds checking)
 */
export function clearBitFast(bitmap, index) {
    bitmap[index >> 3] &= ~(1 << (index & 7));
}
/**
 * Ultra-fast bit toggle (no bounds checking)
 */
export function toggleBitFast(bitmap, index) {
    bitmap[index >> 3] ^= (1 << (index & 7));
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
export function countBitsFast(bitmap) {
    let count = 0;
    for (let i = 0; i < bitmap.length; i++) {
        count += POPCOUNT_TABLE[bitmap[i]];
    }
    return count;
}
/**
 * Ultra-fast encode (no validation)
 */
export function encodeBitsFast(buffer) {
    return buffer.toString('base64');
}
/**
 * Ultra-fast decode (no validation)
 */
export function decodeBitsFast(encoded) {
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
//# sourceMappingURL=binary.js.map