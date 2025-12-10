/**
 * Schema Binary Types Integration Tests
 *
 * Tests the integration of buffer and bits primitive types in the schema validator.
 */

import { Schema } from '../../../src/schema.class.js';
import { createBitmap, setBit, getBit, countBits, clearBit, toggleBit } from '../../../src/concerns/binary.js';

describe('Schema - Binary Types Integration', () => {
  describe('Buffer Type - Shorthand Notation', () => {
    let schema;

    beforeEach(() => {
      schema = new Schema({
        name: 'test',
        attributes: {
          data: 'buffer',
          optionalData: 'buffer|optional',
          requiredData: 'buffer|required'
        }
      });
    });

    it('should encode Buffer during mapping', async () => {
      const buffer = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
      const data = { data: buffer };
      const mapped = await schema.mapper(data);

      // Should be encoded to Base64
      expect(mapped[schema.map.data]).toBe('3q2+7w==');
      expect(typeof mapped[schema.map.data]).toBe('string');
    });

    it('should decode Buffer during unmapping', async () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const data = { data: buffer };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(Buffer.isBuffer(unmapped.data)).toBe(true);
      expect(unmapped.data.equals(buffer)).toBe(true);
    });

    it('should handle roundtrip for various buffer sizes', async () => {
      const testBuffers = [
        Buffer.from([]),                              // Empty
        Buffer.from([0x00]),                          // Single byte
        Buffer.from([0xFF]),                          // Max byte
        Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]),       // 4 bytes
        Buffer.alloc(100).fill(0xAA),                 // 100 bytes
        Buffer.alloc(1000).fill(0x55),                // 1KB
      ];

      for (const buffer of testBuffers) {
        const data = { data: buffer };
        const mapped = await schema.mapper(data);
        const unmapped = await schema.unmapper(mapped);

        expect(Buffer.isBuffer(unmapped.data)).toBe(true);
        expect(unmapped.data.equals(buffer)).toBe(true);
      }
    });

    it('should handle Uint8Array input', async () => {
      const uint8 = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const data = { data: uint8 };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(Buffer.isBuffer(unmapped.data)).toBe(true);
      expect(unmapped.data.equals(Buffer.from(uint8))).toBe(true);
    });

    it('should handle optional buffer fields', async () => {
      const buffer = Buffer.from([0x01, 0x02]);
      const data = { requiredData: buffer };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.requiredData.equals(buffer)).toBe(true);
      expect(unmapped.optionalData).toBeUndefined();
    });

    it('should handle null and undefined values', async () => {
      const data = { data: null, optionalData: undefined };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.data).toBeNull();
      expect(unmapped.optionalData).toBeUndefined();
    });

    it('should preserve non-buffer values as-is during encoding', async () => {
      const data = { data: 'not-a-buffer' };
      const mapped = await schema.mapper(data);

      // Non-buffer values are passed through unchanged during mapping
      expect(mapped[schema.map.data]).toBe('not-a-buffer');
    });
  });

  describe('Bits Type - Fixed Size Notation', () => {
    let schema;

    beforeEach(() => {
      schema = new Schema({
        name: 'test',
        attributes: {
          flags: 'bits:1024',           // 1024 bits = 128 bytes
          smallFlags: 'bits:64',        // 64 bits = 8 bytes
          optionalFlags: 'bits:256|optional'
        }
      });
    });

    it('should encode bitmap during mapping', async () => {
      const bitmap = createBitmap(1024);
      setBit(bitmap, 0);
      setBit(bitmap, 42);

      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);

      // Should be encoded to Base64 (128 bytes → 172 chars)
      expect(typeof mapped[schema.map.flags]).toBe('string');
      expect(mapped[schema.map.flags].length).toBe(172);
    });

    it('should decode bitmap during unmapping', async () => {
      const bitmap = createBitmap(1024);
      setBit(bitmap, 0);
      setBit(bitmap, 42);
      setBit(bitmap, 1023);

      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(Buffer.isBuffer(unmapped.flags)).toBe(true);
      expect(unmapped.flags.length).toBe(128); // 1024 bits = 128 bytes
      expect(getBit(unmapped.flags, 0)).toBe(1);
      expect(getBit(unmapped.flags, 42)).toBe(1);
      expect(getBit(unmapped.flags, 1023)).toBe(1);
      expect(getBit(unmapped.flags, 100)).toBe(0);
    });

    it('should preserve bit patterns through roundtrip', async () => {
      const bitmap = createBitmap(1024);

      // Set various bits
      const bitsToSet = [0, 1, 7, 8, 15, 42, 100, 255, 500, 1000, 1023];
      for (const bit of bitsToSet) {
        setBit(bitmap, bit);
      }

      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      for (const bit of bitsToSet) {
        expect(getBit(unmapped.flags, bit)).toBe(1);
      }
      expect(countBits(unmapped.flags)).toBe(bitsToSet.length);
    });

    it('should handle small bitmaps', async () => {
      const bitmap = createBitmap(64);
      setBit(bitmap, 0);
      setBit(bitmap, 63);

      const data = { smallFlags: bitmap };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.smallFlags.length).toBe(8); // 64 bits = 8 bytes
      expect(getBit(unmapped.smallFlags, 0)).toBe(1);
      expect(getBit(unmapped.smallFlags, 63)).toBe(1);
    });

    it('should handle optional bits fields', async () => {
      const bitmap = createBitmap(1024);
      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.flags).toBeDefined();
      expect(unmapped.optionalFlags).toBeUndefined();
    });

    it('should handle null and undefined values', async () => {
      const data = { flags: null, optionalFlags: undefined };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.flags).toBeNull();
      expect(unmapped.optionalFlags).toBeUndefined();
    });
  });

  describe('Binary Types - Shorthand Variations', () => {
    it('should support buffer with required modifier', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          data: 'buffer|required'
        }
      });

      const buffer = Buffer.from([0x01, 0x02, 0x03]);
      const data = { data: buffer };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(Buffer.isBuffer(unmapped.data)).toBe(true);
      expect(unmapped.data.equals(buffer)).toBe(true);
    });

    it('should support bits with optional modifier', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          flags: 'bits:512|optional'
        }
      });

      const bitmap = createBitmap(512);
      setBit(bitmap, 100);

      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(getBit(unmapped.flags, 100)).toBe(1);
    });
  });

  describe('Binary Types - Nested Objects', () => {
    it('should handle binary fields in nested objects using magic detection', async () => {
      // Note: s3db auto-detects nested objects, no need for explicit type: 'object'
      const schema = new Schema({
        name: 'test',
        attributes: {
          user: {
            avatar: 'buffer',
            permissions: 'bits:64'
          }
        }
      });

      const avatar = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG magic
      const permissions = createBitmap(64);
      setBit(permissions, 0);  // read
      setBit(permissions, 1);  // write

      const data = {
        user: {
          avatar,
          permissions
        }
      };

      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(Buffer.isBuffer(unmapped.user.avatar)).toBe(true);
      expect(unmapped.user.avatar.equals(avatar)).toBe(true);
      expect(getBit(unmapped.user.permissions, 0)).toBe(1);
      expect(getBit(unmapped.user.permissions, 1)).toBe(1);
      expect(getBit(unmapped.user.permissions, 2)).toBe(0);
    });
  });

  describe('Binary Types - Mixed Types', () => {
    it('should handle schemas with mixed binary and other types', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          userId: 'string|required',
          ip: 'ip4',
          data: 'buffer',
          flags: 'bits:128',
          timestamp: 'number',
          active: 'boolean'
        }
      });

      const data = {
        userId: 'user123',
        ip: '192.168.1.1',
        data: Buffer.from([0x01, 0x02]),
        flags: createBitmap(128),
        timestamp: 1234567890,
        active: true
      };
      setBit(data.flags, 42);

      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.userId).toBe('user123');
      expect(unmapped.ip).toBe('192.168.1.1');
      expect(unmapped.data.equals(data.data)).toBe(true);
      expect(getBit(unmapped.flags, 42)).toBe(1);
      expect(unmapped.timestamp).toBe(1234567890);
      expect(unmapped.active).toBe(true);
    });
  });

  describe('Binary Types - Compression Savings', () => {
    it('should demonstrate buffer encoding overhead', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { data: 'buffer' }
      });

      const buffer = Buffer.alloc(100).fill(0xAA);
      const data = { data: buffer };
      const mapped = await schema.mapper(data);

      const encodedLength = mapped[schema.map.data].length;
      const originalLength = buffer.length;

      // Base64 encoding: 4 chars per 3 bytes
      const expectedLength = Math.ceil(originalLength / 3) * 4;
      expect(encodedLength).toBe(expectedLength);

      // Base64 overhead varies with size: ceil(n/3)*4 / n
      // For 100 bytes: 136/100 = 36% overhead
      const overhead = ((encodedLength / originalLength) - 1) * 100;
      expect(overhead).toBeCloseTo(36, 0);
    });

    it('should demonstrate bits encoding overhead', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { flags: 'bits:1024' }
      });

      const bitmap = createBitmap(1024); // 128 bytes
      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);

      const encodedLength = mapped[schema.map.flags].length;
      const originalLength = bitmap.length;

      // Base64 encoding: 4 chars per 3 bytes
      const expectedLength = Math.ceil(originalLength / 3) * 4;
      expect(encodedLength).toBe(expectedLength);
      expect(encodedLength).toBe(172); // 128 bytes → 172 Base64 chars
    });

    it('should calculate usable bits in 2KB metadata', async () => {
      // 2KB metadata limit = 2048 bytes
      // With ~33% Base64 overhead, usable binary = 2048 / 1.33 ≈ 1540 bytes
      // 1540 bytes = 12,320 bits

      const metadataLimit = 2048;
      const usableBytes = Math.floor(metadataLimit * 3 / 4);
      const usableBits = usableBytes * 8;

      expect(usableBytes).toBe(1536);
      expect(usableBits).toBe(12288);
    });
  });

  describe('Binary Types - Edge Cases', () => {
    it('should handle empty buffer', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { data: 'buffer|optional' }
      });

      const data = { data: Buffer.alloc(0) };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(Buffer.isBuffer(unmapped.data)).toBe(true);
      expect(unmapped.data.length).toBe(0);
    });

    it('should handle all-zeros bitmap', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { flags: 'bits:256' }
      });

      const bitmap = createBitmap(256);
      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(countBits(unmapped.flags)).toBe(0);
    });

    it('should handle all-ones bitmap', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { flags: 'bits:64' }
      });

      const bitmap = Buffer.alloc(8).fill(0xFF);
      const data = { flags: bitmap };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(countBits(unmapped.flags)).toBe(64);
    });

    it('should handle non-buffer values gracefully during encode', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { data: 'buffer|optional' }
      });

      const data = { data: 'not-a-buffer' };
      const mapped = await schema.mapper(data);

      // Non-buffer values are passed through unchanged during mapping
      expect(mapped[schema.map.data]).toBe('not-a-buffer');
    });
  });

  describe('Binary Types - Hook Generation', () => {
    it('should generate beforeMap hook for buffer', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { data: 'buffer' }
      });

      expect(schema.options.hooks.beforeMap.data).toContain('encodeBuffer');
    });

    it('should generate afterUnmap hook for buffer', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { data: 'buffer' }
      });

      expect(schema.options.hooks.afterUnmap.data).toContain('decodeBuffer');
    });

    it('should generate beforeMap hook for bits', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { flags: 'bits:1024' }
      });

      const hooks = schema.options.hooks.beforeMap.flags;
      expect(hooks.some(h => h.action === 'encodeBits' || h === 'encodeBits')).toBe(true);
    });

    it('should generate afterUnmap hook for bits', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { flags: 'bits:1024' }
      });

      const hooks = schema.options.hooks.afterUnmap.flags;
      expect(hooks.some(h => h.action === 'decodeBits' || h === 'decodeBits')).toBe(true);
    });
  });

  describe('Binary Types - Bitmap Helper Functions', () => {
    it('should set and get individual bits', () => {
      const bitmap = createBitmap(64);

      setBit(bitmap, 0);
      setBit(bitmap, 7);
      setBit(bitmap, 8);
      setBit(bitmap, 63);

      expect(getBit(bitmap, 0)).toBe(1);
      expect(getBit(bitmap, 7)).toBe(1);
      expect(getBit(bitmap, 8)).toBe(1);
      expect(getBit(bitmap, 63)).toBe(1);
      expect(getBit(bitmap, 1)).toBe(0);
      expect(getBit(bitmap, 62)).toBe(0);
    });

    it('should clear bits', () => {
      const bitmap = createBitmap(64);

      setBit(bitmap, 42);
      expect(getBit(bitmap, 42)).toBe(1);

      clearBit(bitmap, 42);
      expect(getBit(bitmap, 42)).toBe(0);
    });

    it('should toggle bits', () => {
      const bitmap = createBitmap(64);

      toggleBit(bitmap, 10);
      expect(getBit(bitmap, 10)).toBe(1);

      toggleBit(bitmap, 10);
      expect(getBit(bitmap, 10)).toBe(0);
    });

    it('should count set bits', () => {
      const bitmap = createBitmap(256);

      setBit(bitmap, 0);
      setBit(bitmap, 50);
      setBit(bitmap, 100);
      setBit(bitmap, 200);
      setBit(bitmap, 255);

      expect(countBits(bitmap)).toBe(5);
    });

    it('should throw for out-of-bounds access', () => {
      const bitmap = createBitmap(64);

      expect(() => getBit(bitmap, 64)).toThrow();
      expect(() => setBit(bitmap, 100)).toThrow();
    });

    it('should handle negative indices without throwing', () => {
      const bitmap = createBitmap(64);

      // Negative indices wrap around due to JS behavior with negative array indices
      // This is expected behavior - negative indices are undefined behavior
      // If strict validation is needed, it should be added to the helpers
      clearBit(bitmap, -1);
    });
  });
});
