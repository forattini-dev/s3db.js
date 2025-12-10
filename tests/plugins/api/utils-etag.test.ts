import { describe, test, expect } from 'vitest';
import {
  generateETag,
  parseETag,
  etagMatches,
  validateIfMatch,
  validateIfNoneMatch,
  generateRecordETag
} from '../../../src/plugins/api/utils/etag.js';

describe('generateETag', () => {
  describe('basic generation', () => {
    test('generates etag for object', () => {
      const etag = generateETag({ name: 'test', value: 123 });
      expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
    });

    test('generates etag for string', () => {
      const etag = generateETag('hello world');
      expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
    });

    test('same data produces same etag', () => {
      const data = { foo: 'bar' };
      const etag1 = generateETag(data);
      const etag2 = generateETag(data);
      expect(etag1).toBe(etag2);
    });

    test('different data produces different etag', () => {
      const etag1 = generateETag({ foo: 'bar' });
      const etag2 = generateETag({ foo: 'baz' });
      expect(etag1).not.toBe(etag2);
    });
  });

  describe('weak option', () => {
    test('weak=true (default) adds W/ prefix', () => {
      const etag = generateETag('data');
      expect(etag.startsWith('W/')).toBe(true);
    });

    test('weak=false removes W/ prefix', () => {
      const etag = generateETag('data', { weak: false });
      expect(etag.startsWith('W/')).toBe(false);
      expect(etag).toMatch(/^"[a-f0-9]{16}"$/);
    });
  });

  describe('lastModified option', () => {
    test('includes timestamp when lastModified is provided', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const etag = generateETag('data', { lastModified: date });
      expect(etag).toContain(`-${date.getTime()}`);
    });

    test('accepts string date', () => {
      const dateStr = '2024-01-01T00:00:00Z';
      const etag = generateETag('data', { lastModified: dateStr });
      expect(etag).toContain(`-${new Date(dateStr).getTime()}`);
    });

    test('no timestamp when lastModified not provided', () => {
      const etag = generateETag('data');
      expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
    });
  });
});

describe('parseETag', () => {
  describe('null/empty handling', () => {
    test('returns null for null input', () => {
      expect(parseETag(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
      expect(parseETag(undefined)).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(parseETag('')).toBeNull();
    });
  });

  describe('weak etag parsing', () => {
    test('parses weak etag', () => {
      const result = parseETag('W/"abc123"');
      expect(result?.weak).toBe(true);
      expect(result?.hash).toBe('abc123');
    });

    test('parses strong etag', () => {
      const result = parseETag('"abc123"');
      expect(result?.weak).toBe(false);
      expect(result?.hash).toBe('abc123');
    });
  });

  describe('timestamp parsing', () => {
    test('parses etag with timestamp', () => {
      const result = parseETag('W/"abc123-1704067200000"');
      expect(result?.hash).toBe('abc123');
      expect(result?.timestamp).toBe(1704067200000);
    });

    test('parses etag without timestamp', () => {
      const result = parseETag('"abc123"');
      expect(result?.timestamp).toBeNull();
    });
  });

  describe('raw preservation', () => {
    test('preserves raw etag string', () => {
      const raw = 'W/"abc123-1234567890"';
      const result = parseETag(raw);
      expect(result?.raw).toBe(raw);
    });
  });
});

describe('etagMatches', () => {
  describe('null handling', () => {
    test('returns false when first etag is null', () => {
      expect(etagMatches(null, '"abc"')).toBe(false);
    });

    test('returns false when second etag is null', () => {
      expect(etagMatches('"abc"', null)).toBe(false);
    });

    test('returns false when both are null', () => {
      expect(etagMatches(null, null)).toBe(false);
    });
  });

  describe('weak comparison (default)', () => {
    test('matches same hash regardless of weak flag', () => {
      expect(etagMatches('W/"abc123"', '"abc123"')).toBe(true);
    });

    test('matches same hash with different timestamps', () => {
      expect(etagMatches('W/"abc-111"', 'W/"abc-222"')).toBe(true);
    });

    test('does not match different hashes', () => {
      expect(etagMatches('"abc"', '"xyz"')).toBe(false);
    });
  });

  describe('strong comparison', () => {
    test('requires exact match', () => {
      expect(etagMatches('W/"abc"', '"abc"', { weakComparison: false })).toBe(false);
    });

    test('matches identical etags', () => {
      expect(etagMatches('"abc"', '"abc"', { weakComparison: false })).toBe(true);
    });
  });
});

describe('validateIfMatch', () => {
  describe('no header', () => {
    test('returns true when header is null', () => {
      expect(validateIfMatch(null, '"abc"')).toBe(true);
    });

    test('returns true when header is undefined', () => {
      expect(validateIfMatch(undefined, '"abc"')).toBe(true);
    });
  });

  describe('wildcard (*)', () => {
    test('returns true when resource exists', () => {
      expect(validateIfMatch('*', '"abc"')).toBe(true);
    });

    test('returns false when resource does not exist', () => {
      expect(validateIfMatch('*', null)).toBe(false);
    });
  });

  describe('etag list', () => {
    test('returns true when etag matches single value', () => {
      expect(validateIfMatch('"abc"', '"abc"')).toBe(true);
    });

    test('returns true when etag matches one of multiple', () => {
      expect(validateIfMatch('"aaa", "bbb", "abc"', '"abc"')).toBe(true);
    });

    test('returns false when etag does not match', () => {
      expect(validateIfMatch('"xxx"', '"abc"')).toBe(false);
    });

    test('returns false when etag not in list', () => {
      expect(validateIfMatch('"aaa", "bbb"', '"ccc"')).toBe(false);
    });
  });
});

describe('validateIfNoneMatch', () => {
  describe('no header', () => {
    test('returns true when header is null', () => {
      expect(validateIfNoneMatch(null, '"abc"')).toBe(true);
    });

    test('returns true when header is undefined', () => {
      expect(validateIfNoneMatch(undefined, '"abc"')).toBe(true);
    });
  });

  describe('wildcard (*)', () => {
    test('returns false when resource exists', () => {
      expect(validateIfNoneMatch('*', '"abc"')).toBe(false);
    });

    test('returns true when resource does not exist', () => {
      expect(validateIfNoneMatch('*', null)).toBe(true);
    });
  });

  describe('etag list', () => {
    test('returns false when etag matches (304 Not Modified)', () => {
      expect(validateIfNoneMatch('"abc"', '"abc"')).toBe(false);
    });

    test('returns true when etag does not match (200 OK)', () => {
      expect(validateIfNoneMatch('"xxx"', '"abc"')).toBe(true);
    });

    test('returns false when any etag matches', () => {
      expect(validateIfNoneMatch('"aaa", "abc", "bbb"', '"abc"')).toBe(false);
    });
  });
});

describe('generateRecordETag', () => {
  describe('null handling', () => {
    test('returns null for null record', () => {
      expect(generateRecordETag(null)).toBeNull();
    });

    test('returns null for undefined record', () => {
      expect(generateRecordETag(undefined)).toBeNull();
    });
  });

  describe('timestamp detection', () => {
    test('uses _updatedAt when present', () => {
      const record = {
        _id: '123',
        _updatedAt: '2024-01-15T00:00:00Z',
        _createdAt: '2024-01-01T00:00:00Z',
        data: 'test'
      };
      const etag = generateRecordETag(record);
      expect(etag).toContain(new Date('2024-01-15T00:00:00Z').getTime().toString());
    });

    test('falls back to _createdAt when no _updatedAt', () => {
      const record = {
        _id: '123',
        _createdAt: '2024-01-01T00:00:00Z',
        data: 'test'
      };
      const etag = generateRecordETag(record);
      expect(etag).toContain(new Date('2024-01-01T00:00:00Z').getTime().toString());
    });

    test('generates etag without timestamp when no dates', () => {
      const record = { _id: '123', data: 'test' };
      const etag = generateRecordETag(record);
      expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
    });
  });

  describe('weak etag', () => {
    test('always generates weak etag', () => {
      const record = { _id: '123' };
      const etag = generateRecordETag(record);
      expect(etag?.startsWith('W/')).toBe(true);
    });
  });
});
