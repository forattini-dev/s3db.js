import { describe, it, expect } from 'vitest';
import {
  generateId,
  detectIdFormat,
  URL_SAFE,
  isValidUuidv7,
  isValidUlid
} from '#src/concerns/id/index.js';

describe('ID Module Index', () => {
  describe('generateId()', () => {
    it('generates sid by default', () => {
      const id = generateId();
      expect(id.length).toBe(21);
      for (const char of id) {
        expect(URL_SAFE.includes(char)).toBe(true);
      }
    });

    it('generates sid with format option', () => {
      const id = generateId({ format: 'sid' });
      expect(id.length).toBe(21);
    });

    it('generates sid with size option', () => {
      const id = generateId({ size: 10 });
      expect(id.length).toBe(10);
    });

    it('generates sid with alphabet option', () => {
      const id = generateId({ alphabet: 'NUMERIC', size: 10 });
      expect(/^\d+$/.test(id)).toBe(true);
    });

    it('generates uuid (uuidv7)', () => {
      const id = generateId({ format: 'uuid' });
      expect(isValidUuidv7(id)).toBe(true);
    });

    it('generates uuidv7 explicitly', () => {
      const id = generateId({ format: 'uuidv7' });
      expect(isValidUuidv7(id)).toBe(true);
    });

    it('generates uuidv7 with timestamp', () => {
      const ts = 1700000000000;
      const id = generateId({ format: 'uuidv7', timestamp: ts });
      expect(isValidUuidv7(id)).toBe(true);
    });

    it('generates ulid', () => {
      const id = generateId({ format: 'ulid' });
      expect(isValidUlid(id)).toBe(true);
    });

    it('generates ulid with timestamp', () => {
      const ts = 1700000000000;
      const id = generateId({ format: 'ulid', timestamp: ts });
      expect(isValidUlid(id)).toBe(true);
    });
  });

  describe('detectIdFormat()', () => {
    it('detects uuidv7', () => {
      const id = generateId({ format: 'uuidv7' });
      expect(detectIdFormat(id)).toBe('uuidv7');
    });

    it('detects uuid v4 as uuid', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      expect(detectIdFormat(id)).toBe('uuid');
    });

    it('detects ulid', () => {
      const id = generateId({ format: 'ulid' });
      expect(detectIdFormat(id)).toBe('ulid');
    });

    it('detects sid', () => {
      const id = generateId({ format: 'sid' });
      expect(detectIdFormat(id)).toBe('sid');
    });

    it('returns null for unknown format', () => {
      expect(detectIdFormat('x')).toBeNull();
      expect(detectIdFormat('')).toBeNull();
    });

    it('returns null for very long strings', () => {
      expect(detectIdFormat('a'.repeat(100))).toBeNull();
    });
  });
});
