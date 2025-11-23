/**
 * Unit tests for filterProtectedFields utility
 */

import { describe, it, expect } from '@jest/globals';
import { filterProtectedFields } from '../../../src/plugins/api/utils/response-formatter.js';

describe('filterProtectedFields', () => {
  describe('basic filtering', () => {
    it('filters top-level fields', () => {
      const data = { id: '1', name: 'John', password: 'secret', ip: '1.2.3.4' };
      const result = filterProtectedFields(data, ['password', 'ip']);

      expect(result).toEqual({ id: '1', name: 'John' });
    });

    it('returns data unchanged when no protected fields', () => {
      const data = { id: '1', name: 'John' };
      const result = filterProtectedFields(data, []);

      expect(result).toEqual({ id: '1', name: 'John' });
    });

    it('returns data unchanged when protectedFields is null', () => {
      const data = { id: '1', name: 'John' };
      const result = filterProtectedFields(data, null);

      expect(result).toEqual({ id: '1', name: 'John' });
    });

    it('returns data unchanged when protectedFields is undefined', () => {
      const data = { id: '1', name: 'John' };
      const result = filterProtectedFields(data, undefined);

      expect(result).toEqual({ id: '1', name: 'John' });
    });
  });

  describe('nested field filtering', () => {
    it('filters nested fields with dot notation', () => {
      const data = {
        id: '1',
        metadata: {
          ip: '1.2.3.4',
          browser: 'Chrome',
          location: 'NYC'
        }
      };

      const result = filterProtectedFields(data, ['metadata.ip', 'metadata.location']);

      expect(result).toEqual({
        id: '1',
        metadata: {
          browser: 'Chrome'
        }
      });
    });

    it('filters deeply nested fields', () => {
      const data = {
        id: '1',
        user: {
          profile: {
            ssn: '123-45-6789',
            name: 'John',
            address: {
              street: '123 Main',
              secret: 'hidden'
            }
          }
        }
      };

      const result = filterProtectedFields(data, ['user.profile.ssn', 'user.profile.address.secret']);

      expect(result).toEqual({
        id: '1',
        user: {
          profile: {
            name: 'John',
            address: {
              street: '123 Main'
            }
          }
        }
      });
    });

    it('handles non-existent nested paths gracefully', () => {
      const data = { id: '1', name: 'John' };
      const result = filterProtectedFields(data, ['metadata.ip']);

      expect(result).toEqual({ id: '1', name: 'John' });
    });

    it('handles null intermediate values gracefully', () => {
      const data = { id: '1', metadata: null };
      const result = filterProtectedFields(data, ['metadata.ip']);

      expect(result).toEqual({ id: '1', metadata: null });
    });
  });

  describe('array filtering', () => {
    it('filters fields from array of objects', () => {
      const data = [
        { id: '1', name: 'John', ip: '1.2.3.4' },
        { id: '2', name: 'Jane', ip: '5.6.7.8' }
      ];

      const result = filterProtectedFields(data, ['ip']);

      expect(result).toEqual([
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' }
      ]);
    });

    it('filters nested fields from array of objects', () => {
      const data = [
        { id: '1', meta: { ip: '1.2.3.4', browser: 'Chrome' } },
        { id: '2', meta: { ip: '5.6.7.8', browser: 'Firefox' } }
      ];

      const result = filterProtectedFields(data, ['meta.ip']);

      expect(result).toEqual([
        { id: '1', meta: { browser: 'Chrome' } },
        { id: '2', meta: { browser: 'Firefox' } }
      ]);
    });
  });

  describe('edge cases', () => {
    it('returns null for null input', () => {
      const result = filterProtectedFields(null, ['ip']);
      expect(result).toBeNull();
    });

    it('returns primitives unchanged', () => {
      expect(filterProtectedFields('string', ['ip'])).toBe('string');
      expect(filterProtectedFields(123, ['ip'])).toBe(123);
      expect(filterProtectedFields(true, ['ip'])).toBe(true);
    });

    it('handles empty object', () => {
      const result = filterProtectedFields({}, ['ip']);
      expect(result).toEqual({});
    });

    it('handles empty array', () => {
      const result = filterProtectedFields([], ['ip']);
      expect(result).toEqual([]);
    });

    it('does not modify original object', () => {
      const original = { id: '1', ip: '1.2.3.4' };
      const originalCopy = { ...original };

      filterProtectedFields(original, ['ip']);

      expect(original).toEqual(originalCopy);
    });

    it('handles field that does not exist', () => {
      const data = { id: '1', name: 'John' };
      const result = filterProtectedFields(data, ['nonexistent']);

      expect(result).toEqual({ id: '1', name: 'John' });
    });

    it('handles mixed existing and non-existing fields', () => {
      const data = { id: '1', name: 'John', secret: 'hidden' };
      const result = filterProtectedFields(data, ['secret', 'nonexistent', 'also.missing']);

      expect(result).toEqual({ id: '1', name: 'John' });
    });
  });
});
