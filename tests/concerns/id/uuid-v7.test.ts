import { describe, it, expect } from 'vitest';
import {
  uuidv7,
  uuidv7Compact,
  uuidv7Bytes,
  uuidv4,
  parseUuidv7Timestamp,
  parseUuidv7Date,
  isValidUuidv7,
  compareUuidv7,
  uuidNil,
  uuidMax
} from '#src/concerns/id/generators/uuid-v7.js';

describe('UUID v7 Generator', () => {
  describe('uuidv7()', () => {
    it('generates valid format', () => {
      const uuid = uuidv7();
      const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(pattern.test(uuid)).toBe(true);
    });

    it('has version 7', () => {
      const uuid = uuidv7();
      expect(uuid[14]).toBe('7');
    });

    it('has correct variant', () => {
      const uuid = uuidv7();
      const variant = uuid[19];
      expect(['8', '9', 'a', 'b'].includes(variant)).toBe(true);
    });

    it('generates 36-character string', () => {
      expect(uuidv7().length).toBe(36);
    });

    it('generates unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 10000; i++) {
        uuids.add(uuidv7());
      }
      expect(uuids.size).toBe(10000);
    });

    it('accepts custom timestamp', () => {
      const ts = 1700000000000;
      const uuid = uuidv7(ts);
      const extracted = parseUuidv7Timestamp(uuid);
      expect(extracted).toBe(ts);
    });
  });

  describe('uuidv7Compact()', () => {
    it('generates 32-character string without hyphens', () => {
      const uuid = uuidv7Compact();
      expect(uuid.length).toBe(32);
      expect(uuid.includes('-')).toBe(false);
    });

    it('is equivalent to uuidv7 without hyphens', () => {
      const ts = Date.now();
      const full = uuidv7(ts);
      const compact = uuidv7Compact(ts);
      expect(compact).toBe(full.replace(/-/g, '').slice(0, 12) + compact.slice(12));
    });
  });

  describe('uuidv7Bytes()', () => {
    it('returns 16-byte Uint8Array', () => {
      const bytes = uuidv7Bytes();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it('has version 7 in byte 6', () => {
      const bytes = uuidv7Bytes();
      expect((bytes[6] >> 4) & 0x0f).toBe(7);
    });

    it('has correct variant in byte 8', () => {
      const bytes = uuidv7Bytes();
      expect((bytes[8] >> 6) & 0x03).toBe(2);
    });
  });

  describe('Timestamp Operations', () => {
    it('parseUuidv7Timestamp extracts correct timestamp', () => {
      const now = Date.now();
      const uuid = uuidv7(now);
      const extracted = parseUuidv7Timestamp(uuid);
      expect(extracted).toBe(now);
    });

    it('parseUuidv7Date returns valid Date', () => {
      const now = Date.now();
      const uuid = uuidv7(now);
      const date = parseUuidv7Date(uuid);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBe(now);
    });

    it('throws on invalid format', () => {
      expect(() => parseUuidv7Timestamp('invalid')).toThrow();
      expect(() => parseUuidv7Timestamp('123')).toThrow();
    });
  });

  describe('Sorting (Chronological Order)', () => {
    it('UUIDs sort chronologically', () => {
      const timestamps = [
        1700000000000,
        1700000001000,
        1700000002000,
        1700000003000,
        1700000004000
      ];

      const uuids = timestamps.map(ts => uuidv7(ts));
      const sorted = [...uuids].sort();

      expect(sorted).toEqual(uuids);
    });

    it('compareUuidv7 returns correct order', () => {
      const older = uuidv7(1700000000000);
      const newer = uuidv7(1700000001000);

      expect(compareUuidv7(older, newer)).toBeLessThan(0);
      expect(compareUuidv7(newer, older)).toBeGreaterThan(0);
      expect(compareUuidv7(older, older)).toBe(0);
    });

    it('same-millisecond UUIDs have stable ordering', () => {
      const ts = Date.now();
      const uuids: string[] = [];
      for (let i = 0; i < 100; i++) {
        uuids.push(uuidv7(ts));
      }

      const sorted = [...uuids].sort();
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i] <= sorted[i + 1]).toBe(true);
      }
    });
  });

  describe('Validation', () => {
    it('isValidUuidv7 accepts valid UUIDs', () => {
      expect(isValidUuidv7(uuidv7())).toBe(true);
      expect(isValidUuidv7('018c5d50-0000-7000-8000-000000000000')).toBe(true);
    });

    it('isValidUuidv7 rejects invalid UUIDs', () => {
      expect(isValidUuidv7('invalid')).toBe(false);
      expect(isValidUuidv7('')).toBe(false);
      expect(isValidUuidv7('00000000-0000-0000-0000-000000000000')).toBe(false);
      expect(isValidUuidv7(uuidv4())).toBe(false);
    });
  });

  describe('uuidv4()', () => {
    it('generates valid v4 format', () => {
      const uuid = uuidv4();
      const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(pattern.test(uuid)).toBe(true);
    });

    it('has version 4', () => {
      const uuid = uuidv4();
      expect(uuid[14]).toBe('4');
    });
  });

  describe('Special UUIDs', () => {
    it('uuidNil returns all zeros', () => {
      expect(uuidNil()).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('uuidMax returns all ones', () => {
      expect(uuidMax()).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
    });
  });

  describe('RFC 9562 Compliance', () => {
    it('first 48 bits are timestamp', () => {
      const ts = 0x123456789ABCn;
      const uuid = uuidv7(Number(ts));
      const hex = uuid.replace(/-/g, '').slice(0, 12);
      expect(hex).toBe('123456789abc');
    });

    it('version bits are 0111', () => {
      const uuid = uuidv7();
      const versionNibble = parseInt(uuid[14], 16);
      expect(versionNibble).toBe(7);
    });

    it('variant bits are 10xx', () => {
      const uuid = uuidv7();
      const variantNibble = parseInt(uuid[19], 16);
      expect(variantNibble >= 8 && variantNibble <= 11).toBe(true);
    });
  });
});
