/**
 * Binary/Buffer Encoding Utilities
 *
 * Provides compact Base64 encoding for binary data (Buffer, Uint8Array)
 * to save space in S3 metadata.
 */
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
export declare function encodeBuffer(buffer: Buffer | Uint8Array | null | undefined): string | null;
/**
 * Decode Base64 string back to Buffer
 */
export declare function decodeBuffer(encoded: string | null | undefined): Buffer | null;
/**
 * Encode a bitmap (Buffer) with optional size validation
 */
export declare function encodeBits(buffer: Buffer | Uint8Array | null | undefined, expectedBits?: number | null, skipValidation?: boolean): string | null;
/**
 * Decode Base64 string back to bitmap Buffer
 */
export declare function decodeBits(encoded: string | null | undefined, expectedBits?: number | null, skipValidation?: boolean): Buffer | null;
/**
 * Helper: Create an empty bitmap with N bits
 */
export declare function createBitmap(bits: number, skipValidation?: boolean): Buffer;
/**
 * Helper: Set a bit in a bitmap
 */
export declare function setBit(bitmap: Buffer, index: number): Buffer;
/**
 * Helper: Clear a bit in a bitmap
 */
export declare function clearBit(bitmap: Buffer, index: number): Buffer;
/**
 * Helper: Get a bit from a bitmap
 */
export declare function getBit(bitmap: Buffer, index: number): BitValue;
/**
 * Helper: Toggle a bit in a bitmap
 */
export declare function toggleBit(bitmap: Buffer, index: number): Buffer;
/**
 * Helper: Count set bits (popcount) in a bitmap
 */
export declare function countBits(bitmap: Buffer): number;
/**
 * Calculate space savings for buffer encoding
 */
export declare function calculateBufferSavings(bufferOrSize: Buffer | number): BufferSavingsResult;
/**
 * Ultra-fast bitmap creation (no validation)
 */
export declare function createBitmapFast(bits: number): Buffer;
/**
 * Ultra-fast bit set (no bounds checking)
 */
export declare function setBitFast(bitmap: Buffer, index: number): void;
/**
 * Ultra-fast bit get (no bounds checking)
 */
export declare function getBitFast(bitmap: Buffer, index: number): BitValue;
/**
 * Ultra-fast bit clear (no bounds checking)
 */
export declare function clearBitFast(bitmap: Buffer, index: number): void;
/**
 * Ultra-fast bit toggle (no bounds checking)
 */
export declare function toggleBitFast(bitmap: Buffer, index: number): void;
/**
 * Ultra-fast popcount using lookup table
 */
export declare function countBitsFast(bitmap: Buffer): number;
/**
 * Ultra-fast encode (no validation)
 */
export declare function encodeBitsFast(buffer: Buffer): string;
/**
 * Ultra-fast decode (no validation)
 */
export declare function decodeBitsFast(encoded: string): Buffer;
declare const _default: {
    encodeBuffer: typeof encodeBuffer;
    decodeBuffer: typeof decodeBuffer;
    encodeBits: typeof encodeBits;
    decodeBits: typeof decodeBits;
    createBitmap: typeof createBitmap;
    setBit: typeof setBit;
    clearBit: typeof clearBit;
    getBit: typeof getBit;
    toggleBit: typeof toggleBit;
    countBits: typeof countBits;
    calculateBufferSavings: typeof calculateBufferSavings;
    createBitmapFast: typeof createBitmapFast;
    setBitFast: typeof setBitFast;
    getBitFast: typeof getBitFast;
    clearBitFast: typeof clearBitFast;
    toggleBitFast: typeof toggleBitFast;
    countBitsFast: typeof countBitsFast;
    encodeBitsFast: typeof encodeBitsFast;
    decodeBitsFast: typeof decodeBitsFast;
};
export default _default;
//# sourceMappingURL=binary.d.ts.map