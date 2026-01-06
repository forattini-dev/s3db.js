import { describe, it, expect } from 'vitest';
import {
  joinS3Key,
  normalizeS3Key,
  isValidS3KeySegment,
  validateS3KeySegment
} from '../../src/concerns/s3-key.js';
import { ValidationError } from '../../src/errors.js';

describe('s3-key', () => {
  describe('joinS3Key', () => {
    it('joins segments with forward slashes', () => {
      expect(joinS3Key('resource=foo', 'data', 'id=123')).toBe('resource=foo/data/id=123');
    });

    it('collapses duplicate slashes', () => {
      expect(joinS3Key('resource=foo/', '/data', 'id=123')).toBe('resource=foo/data/id=123');
    });

    it('normalizes backslashes inside segments', () => {
      expect(joinS3Key('resource=foo\\bar', 'data')).toBe('resource=foo/bar/data');
    });
  });

  describe('normalizeS3Key', () => {
    it('replaces backslashes and collapses duplicate slashes', () => {
      expect(normalizeS3Key('foo\\bar//baz')).toBe('foo/bar/baz');
    });
  });

  describe('isValidS3KeySegment', () => {
    it('accepts url-friendly segments', () => {
      expect(isValidS3KeySegment('abc-123_def')).toBe(true);
    });

    it('rejects unsafe characters', () => {
      const invalidSegments = ['a/b', 'a=b', 'a%b', 'a\\b'];
      for (const segment of invalidSegments) {
        expect(isValidS3KeySegment(segment)).toBe(false);
      }
    });
  });

  describe('validateS3KeySegment', () => {
    it('accepts non-string values by coercion', () => {
      expect(() => validateS3KeySegment(123, 'id')).not.toThrow();
    });

    it('throws ValidationError for unsafe characters', () => {
      try {
        validateS3KeySegment('bad\\id', 'id');
        throw new Error('expected validateS3KeySegment to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const error = err as ValidationError;
        expect(error.statusCode).toBe(400);
        expect(error.field).toBe('id');
        expect(error.constraint).toBe('url-safe');
      }
    });
  });
});
