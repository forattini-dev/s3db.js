import { describe, it, expect } from 'vitest';
import { isDangerousKey, sanitizeKeys, sanitizeDeep } from '../../src/concerns/safe-merge.js';

describe('safe-merge', () => {
  describe('isDangerousKey', () => {
    it('should detect __proto__ as dangerous', () => {
      expect(isDangerousKey('__proto__')).toBe(true);
    });

    it('should detect constructor as dangerous', () => {
      expect(isDangerousKey('constructor')).toBe(true);
    });

    it('should detect prototype as dangerous', () => {
      expect(isDangerousKey('prototype')).toBe(true);
    });

    it('should detect dangerous keys in dot-notation paths', () => {
      expect(isDangerousKey('__proto__.isAdmin')).toBe(true);
      expect(isDangerousKey('user.__proto__')).toBe(true);
      expect(isDangerousKey('foo.constructor.bar')).toBe(true);
      expect(isDangerousKey('a.b.prototype.c')).toBe(true);
    });

    it('should allow safe keys', () => {
      expect(isDangerousKey('name')).toBe(false);
      expect(isDangerousKey('user.name')).toBe(false);
      expect(isDangerousKey('profile.bio')).toBe(false);
      expect(isDangerousKey('data.items.0.value')).toBe(false);
    });

    it('should allow keys that contain dangerous substrings but are not dangerous', () => {
      expect(isDangerousKey('proto')).toBe(false);
      expect(isDangerousKey('_proto_')).toBe(false);
      expect(isDangerousKey('constructorName')).toBe(false);
      expect(isDangerousKey('prototypeId')).toBe(false);
    });
  });

  describe('sanitizeKeys', () => {
    it('should remove __proto__ key', () => {
      const input = { name: 'John', '__proto__': { isAdmin: true } };
      const result = sanitizeKeys(input);
      expect(result).toEqual({ name: 'John' });
      expect(Object.keys(result)).not.toContain('__proto__');
    });

    it('should remove constructor key', () => {
      const input = { name: 'John', constructor: { foo: 'bar' } };
      const result = sanitizeKeys(input);
      expect(result).toEqual({ name: 'John' });
    });

    it('should remove prototype key', () => {
      const input = { name: 'John', prototype: { isAdmin: true } };
      const result = sanitizeKeys(input);
      expect(result).toEqual({ name: 'John' });
    });

    it('should remove keys with dangerous dot-notation paths', () => {
      const input = {
        name: 'John',
        '__proto__.isAdmin': true,
        'user.__proto__': { foo: 'bar' }
      };
      const result = sanitizeKeys(input);
      expect(result).toEqual({ name: 'John' });
    });

    it('should preserve safe keys', () => {
      const input = { name: 'John', age: 30, 'profile.bio': 'Hello' };
      const result = sanitizeKeys(input);
      expect(result).toEqual(input);
    });

    it('should handle empty objects', () => {
      expect(sanitizeKeys({})).toEqual({});
    });
  });

  describe('sanitizeDeep', () => {
    it('should sanitize nested objects', () => {
      const input = {
        user: {
          name: 'John',
          __proto__: { isAdmin: true }
        }
      };
      const result = sanitizeDeep(input);
      expect(result).toEqual({ user: { name: 'John' } });
    });

    it('should sanitize arrays with objects', () => {
      const input = {
        items: [
          { name: 'Item 1', __proto__: { dangerous: true } },
          { name: 'Item 2' }
        ]
      };
      const result = sanitizeDeep(input);
      expect(result).toEqual({
        items: [
          { name: 'Item 1' },
          { name: 'Item 2' }
        ]
      });
    });

    it('should handle primitive values', () => {
      expect(sanitizeDeep('string')).toBe('string');
      expect(sanitizeDeep(42)).toBe(42);
      expect(sanitizeDeep(null)).toBe(null);
      expect(sanitizeDeep(undefined)).toBe(undefined);
      expect(sanitizeDeep(true)).toBe(true);
    });

    it('should preserve arrays of primitives', () => {
      expect(sanitizeDeep([1, 2, 3])).toEqual([1, 2, 3]);
      expect(sanitizeDeep(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('should deeply sanitize complex nested structures', () => {
      const input = {
        level1: {
          constructor: 'bad',
          level2: {
            prototype: 'also bad',
            level3: {
              __proto__: 'worst',
              safe: 'value'
            }
          }
        }
      };
      const result = sanitizeDeep(input);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              safe: 'value'
            }
          }
        }
      });
    });
  });

  describe('prototype pollution prevention', () => {
    it('should not pollute Object.prototype via sanitizeKeys', () => {
      const originalHasOwn = Object.prototype.hasOwnProperty;
      const maliciousInput = {
        '__proto__': { polluted: true },
        'name': 'test'
      };

      sanitizeKeys(maliciousInput);

      expect(({} as any).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty).toBe(originalHasOwn);
    });

    it('should handle attempts to pollute via constructor', () => {
      const maliciousInput = {
        'constructor': { prototype: { polluted: true } },
        'name': 'test'
      };

      const result = sanitizeKeys(maliciousInput);

      expect(result).toEqual({ name: 'test' });
      expect(({} as any).polluted).toBeUndefined();
    });
  });
});
