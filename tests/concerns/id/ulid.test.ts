import { describe, it, expect, beforeEach } from 'vitest';
import {
  ulid,
  ulidNonMonotonic,
  decodeTime,
  decodeDate,
  isValidUlid,
  ulidToUuid,
  ulidToBytes,
  bytesToUlid,
  compareUlid,
  minUlidForTime,
  maxUlidForTime,
  resetMonotonic
} from '#src/concerns/id/generators/ulid.js';
import { CROCKFORD_BASE32 } from '#src/concerns/id/alphabets.js';

describe('ULID Generator', () => {
  beforeEach(() => {
    resetMonotonic();
  });

  describe('ulid()', () => {
    it('generates 26-character string', () => {
      const id = ulid();
      expect(id.length).toBe(26);
    });

    it('uses only Crockford Base32 characters', () => {
      const id = ulid();
      for (const char of id.toUpperCase()) {
        expect(CROCKFORD_BASE32.includes(char)).toBe(true);
      }
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10000; i++) {
        ids.add(ulid());
      }
      expect(ids.size).toBe(10000);
    });

    it('accepts custom timestamp', () => {
      const ts = 1700000000000;
      const id = ulid(ts);
      const extracted = decodeTime(id);
      expect(extracted).toBe(ts);
    });

    it('throws on timestamp overflow', () => {
      const maxTs = Math.pow(2, 48);
      expect(() => ulid(maxTs)).toThrow('timestamp overflow');
    });
  });

  describe('Monotonic Behavior', () => {
    it('same-millisecond ULIDs are monotonically increasing', () => {
      const ts = Date.now();
      const ids: string[] = [];

      for (let i = 0; i < 100; i++) {
        ids.push(ulid(ts));
      }

      for (let i = 0; i < ids.length - 1; i++) {
        expect(ids[i] < ids[i + 1]).toBe(true);
      }
    });

    it('new millisecond resets random part', () => {
      const ts1 = 1700000000000;
      const ts2 = 1700000000001;

      const id1 = ulid(ts1);
      const id2 = ulid(ts1);
      const id3 = ulid(ts2);

      expect(id1 < id2).toBe(true);
      expect(id3.slice(0, 10)).not.toBe(id1.slice(0, 10));
    });

    it('resetMonotonic clears state', () => {
      const ts = Date.now();
      const id1 = ulid(ts);
      const id2 = ulid(ts);

      resetMonotonic();

      const id3 = ulid(ts);
      expect(id3.slice(10)).not.toBe(id2.slice(10));
    });
  });

  describe('ulidNonMonotonic()', () => {
    it('generates fresh random part each time', () => {
      const ts = Date.now();
      const ids: string[] = [];

      for (let i = 0; i < 10; i++) {
        ids.push(ulidNonMonotonic(ts));
      }

      const randomParts = new Set(ids.map(id => id.slice(10)));
      expect(randomParts.size).toBeGreaterThan(1);
    });

    it('throws on timestamp overflow', () => {
      const maxTs = Math.pow(2, 48);
      expect(() => ulidNonMonotonic(maxTs)).toThrow('timestamp overflow');
    });
  });

  describe('Timestamp Operations', () => {
    it('decodeTime extracts correct timestamp', () => {
      const ts = 1700000000000;
      const id = ulid(ts);
      expect(decodeTime(id)).toBe(ts);
    });

    it('decodeDate returns valid Date', () => {
      const ts = 1700000000000;
      const id = ulid(ts);
      const date = decodeDate(id);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBe(ts);
    });

    it('throws on invalid ULID length', () => {
      expect(() => decodeTime('short')).toThrow('Invalid ULID length');
    });

    it('throws on invalid characters', () => {
      const invalidUlid = 'IIIIIIIIII' + 'A'.repeat(16);
      expect(() => decodeTime(invalidUlid)).toThrow('Invalid ULID character');
    });
  });

  describe('Sorting', () => {
    it('ULIDs sort chronologically', () => {
      const timestamps = [
        1700000000000,
        1700000001000,
        1700000002000,
        1700000003000
      ];

      resetMonotonic();
      const ids = timestamps.map(ts => ulid(ts));
      const sorted = [...ids].sort();

      expect(sorted).toEqual(ids);
    });

    it('compareUlid returns correct order', () => {
      resetMonotonic();
      const older = ulid(1700000000000);
      resetMonotonic();
      const newer = ulid(1700000001000);

      expect(compareUlid(older, newer)).toBeLessThan(0);
      expect(compareUlid(newer, older)).toBeGreaterThan(0);
      expect(compareUlid(older, older)).toBe(0);
    });

    it('case-insensitive comparison', () => {
      const id = ulid();
      expect(compareUlid(id.toLowerCase(), id.toUpperCase())).toBe(0);
    });
  });

  describe('Validation', () => {
    it('isValidUlid accepts valid ULIDs', () => {
      expect(isValidUlid(ulid())).toBe(true);
      expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    });

    it('isValidUlid rejects invalid ULIDs', () => {
      expect(isValidUlid('')).toBe(false);
      expect(isValidUlid('short')).toBe(false);
      expect(isValidUlid('IIIIIIIIIIIIIIIIIIIIIIIIII')).toBe(false);
      expect(isValidUlid('OOOOOOOOOOOOOOOOOOOOOOOOO1')).toBe(false);
    });

    it('isValidUlid handles lowercase', () => {
      const id = ulid().toLowerCase();
      expect(isValidUlid(id)).toBe(true);
    });
  });

  describe('Byte Conversion', () => {
    it('ulidToBytes returns 16-byte array', () => {
      const bytes = ulidToBytes(ulid());
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it('bytesToUlid reverses ulidToBytes', () => {
      const original = ulid();
      const bytes = ulidToBytes(original);
      const restored = bytesToUlid(bytes);
      expect(restored.toUpperCase()).toBe(original.toUpperCase());
    });

    it('ulidToUuid returns valid UUID format', () => {
      const uuid = ulidToUuid(ulid());
      const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(pattern.test(uuid)).toBe(true);
    });

    it('throws on invalid byte array length', () => {
      expect(() => bytesToUlid(new Uint8Array(8))).toThrow('Invalid byte array length');
    });

    it('ulidToBytes throws on invalid ULID length', () => {
      expect(() => ulidToBytes('short')).toThrow('Invalid ULID length');
      expect(() => ulidToBytes('01ARZ3NDEKTSV4RRFFQ69G5FA')).toThrow('Invalid ULID length');
      expect(() => ulidToBytes('01ARZ3NDEKTSV4RRFFQ69G5FAVV')).toThrow('Invalid ULID length');
    });

    it('ulidToBytes throws on invalid ULID character', () => {
      const invalidUlid = 'IIIIIIIIIIIIIIIIIIIIIIIIII';
      expect(() => ulidToBytes(invalidUlid)).toThrow('Invalid ULID character');
      const invalidUlid2 = '01ARZ3NDEKTSV4RRFFQ69G5FA!';
      expect(() => ulidToBytes(invalidUlid2)).toThrow('Invalid ULID character');
    });
  });

  describe('Range Helpers', () => {
    it('minUlidForTime generates minimum ULID', () => {
      const ts = 1700000000000;
      const min = minUlidForTime(ts);
      expect(min.length).toBe(26);
      expect(min.slice(10)).toBe('0'.repeat(16));
      expect(decodeTime(min)).toBe(ts);
    });

    it('maxUlidForTime generates maximum ULID', () => {
      const ts = 1700000000000;
      const max = maxUlidForTime(ts);
      expect(max.length).toBe(26);
      expect(max.slice(10)).toBe('Z'.repeat(16));
      expect(decodeTime(max)).toBe(ts);
    });

    it('range helpers work for queries', () => {
      const ts = 1700000000000;
      const min = minUlidForTime(ts);
      const max = maxUlidForTime(ts);

      resetMonotonic();
      const id = ulid(ts);

      expect(id >= min).toBe(true);
      expect(id <= max).toBe(true);
    });
  });

  describe('Crockford Base32 Compliance', () => {
    it('excludes I, L, O, U characters', () => {
      const excludedChars = ['I', 'L', 'O', 'U'];
      for (let i = 0; i < 100; i++) {
        const id = ulid();
        for (const char of excludedChars) {
          expect(id.toUpperCase().includes(char)).toBe(false);
        }
      }
    });

    it('timestamp portion encodes correctly', () => {
      const id = ulid(0);
      expect(id.slice(0, 10)).toBe('0'.repeat(10));
    });
  });
});
