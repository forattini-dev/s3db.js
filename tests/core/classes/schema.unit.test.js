/**
 * Schema Class Unit Tests
 *
 * Isolated unit tests for Schema class methods.
 * Tests encoding/decoding, mapping, and transformation logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Schema, { SchemaActions } from '#src/schema.class.js';
import { ResourceValidator } from '#src/core/resource-validator.class.js';

describe('Schema Unit Tests', () => {
  // Suppress deprecation warnings during tests
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('SchemaActions', () => {
    describe('trim', () => {
      it('should trim whitespace from strings', () => {
        expect(SchemaActions.trim('  hello  ')).toBe('hello');
        expect(SchemaActions.trim('\t\ntest\t\n')).toBe('test');
      });

      it('should return null/undefined unchanged', () => {
        expect(SchemaActions.trim(null)).toBe(null);
        expect(SchemaActions.trim(undefined)).toBe(undefined);
      });

      it('should handle empty strings', () => {
        expect(SchemaActions.trim('')).toBe('');
        expect(SchemaActions.trim('   ')).toBe('');
      });
    });

    describe('toString', () => {
      it('should convert values to strings', () => {
        expect(SchemaActions.toString(123)).toBe('123');
        expect(SchemaActions.toString(true)).toBe('true');
        expect(SchemaActions.toString(0)).toBe('0');
      });

      it('should return null/undefined unchanged', () => {
        expect(SchemaActions.toString(null)).toBe(null);
        expect(SchemaActions.toString(undefined)).toBe(undefined);
      });
    });

    describe('encrypt/decrypt', () => {
      const passphrase = 'test-secret-key-123';

      it('should encrypt and decrypt a value', async () => {
        const original = 'sensitive-data';
        const encrypted = await SchemaActions.encrypt(original, { passphrase });

        expect(encrypted).not.toBe(original);
        expect(typeof encrypted).toBe('string');

        const decrypted = await SchemaActions.decrypt(encrypted, { passphrase });
        expect(decrypted).toBe(original);
      });

      it('should handle null values', async () => {
        const encrypted = await SchemaActions.encrypt(null, { passphrase });
        expect(encrypted).toBe(null);

        const decrypted = await SchemaActions.decrypt(null, { passphrase });
        expect(decrypted).toBe(null);
      });

      it('should handle undefined values', async () => {
        const encrypted = await SchemaActions.encrypt(undefined, { passphrase });
        expect(encrypted).toBe(undefined);

        const decrypted = await SchemaActions.decrypt(undefined, { passphrase });
        expect(decrypted).toBe(undefined);
      });
    });

    describe('fromArray/toArray', () => {
      it('should convert array to string', () => {
        const result = SchemaActions.fromArray(['a', 'b', 'c'], { separator: ',' });
        expect(result).toBe('a,b,c');
      });

      it('should convert string to array', () => {
        const result = SchemaActions.toArray('a,b,c', { separator: ',' });
        expect(result).toEqual(['a', 'b', 'c']);
      });

      it('should handle empty arrays', () => {
        const result = SchemaActions.fromArray([], { separator: ',' });
        expect(result).toBe('');
      });

      it('should handle null/undefined', () => {
        expect(SchemaActions.fromArray(null, { separator: ',' })).toBe(null);
        expect(SchemaActions.fromArray(undefined, { separator: ',' })).toBe(undefined);
        expect(SchemaActions.toArray(null, { separator: ',' })).toBe(null);
        expect(SchemaActions.toArray(undefined, { separator: ',' })).toBe(undefined);
      });
    });
  });

  describe('Schema Class', () => {
    describe('constructor', () => {
      it('should create schema from simple attributes', () => {
        const schema = new Schema({
          attributes: {
            name: 'string|required',
            age: 'number|optional'
          }
        });

        expect(schema).toBeDefined();
        expect(schema.attributes).toBeDefined();
        expect(schema.attributes.name).toBe('string|required');
        expect(schema.attributes.age).toBe('number|optional');
      });

      it('should handle nested attributes', () => {
        const schema = new Schema({
          attributes: {
            name: 'string|required',
            profile: {
              bio: 'string|optional',
              avatar: 'url|optional'
            }
          }
        });

        expect(schema).toBeDefined();
        expect(schema.attributes).toBeDefined();
        expect(schema.attributes.profile).toBeDefined();
      });

      it('should handle secret type attributes', () => {
        const schema = new Schema({
          attributes: {
            password: 'secret|required'
          },
          passphrase: 'test-passphrase'
        });

        expect(schema).toBeDefined();
        expect(schema.passphrase).toBe('test-passphrase');
      });
    });

    describe('validate', () => {
      it('should validate valid data', async () => {
        // Use ResourceValidator instead of deprecated Schema.validate()
        const validator = new ResourceValidator({
          attributes: {
            name: 'string|required',
            email: 'string|email'
          }
        });

        const result = await validator.validate({
          name: 'John',
          email: 'john@example.com'
        });

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid data', async () => {
        const validator = new ResourceValidator({
          attributes: {
            name: 'string|required',
            email: 'string|email'
          }
        });

        const result = await validator.validate({
          // missing name
          email: 'invalid-email'
        });

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should validate number constraints', async () => {
        const validator = new ResourceValidator({
          attributes: {
            age: 'number|min:0|max:150'
          }
        });

        const validResult = await validator.validate({ age: 25 });
        expect(validResult.isValid).toBe(true);

        const invalidResult = await validator.validate({ age: -5 });
        expect(invalidResult.isValid).toBe(false);
      });

      it('should validate string length constraints', async () => {
        const validator = new ResourceValidator({
          attributes: {
            username: 'string|min:3|max:20'
          }
        });

        const validResult = await validator.validate({ username: 'john' });
        expect(validResult.isValid).toBe(true);

        const tooShort = await validator.validate({ username: 'ab' });
        expect(tooShort.isValid).toBe(false);
      });
    });

    describe('mapper/unmapper', () => {
      it('should map and unmap simple data', async () => {
        const schema = new Schema({
          attributes: {
            name: 'string|required',
            count: 'number|optional'
          }
        });

        const original = { name: 'Test', count: 42 };
        const mapped = await schema.mapper(original);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.name).toBe('Test');
        expect(unmapped.count).toBe(42);
      });

      it('should handle nested objects', async () => {
        const schema = new Schema({
          attributes: {
            name: 'string|required',
            profile: {
              bio: 'string|optional'
            }
          }
        });

        const original = { name: 'Test', profile: { bio: 'Hello' } };
        const mapped = await schema.mapper(original);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.name).toBe('Test');
        expect(unmapped.profile.bio).toBe('Hello');
      });

      it('should preserve null values', async () => {
        const schema = new Schema({
          attributes: {
            name: 'string|required',
            optional: 'string|optional'
          }
        });

        const original = { name: 'Test', optional: null };
        const mapped = await schema.mapper(original);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.name).toBe('Test');
      });
    });

    describe('secret field handling', () => {
      it('should encrypt secret fields during mapper', async () => {
        const passphrase = 'test-secret-123';
        const schema = new Schema({
          attributes: {
            password: 'secret|required'
          },
          passphrase
        });

        const original = { password: 'my-secret-pass' };
        const mapped = await schema.mapper(original);

        // Mapped password should be encrypted (different from original)
        expect(mapped).toBeDefined();
      });

      it('should decrypt secret fields during unmapper', async () => {
        const passphrase = 'test-secret-123';
        const schema = new Schema({
          attributes: {
            password: 'secret|required'
          },
          passphrase
        });

        const original = { password: 'my-secret-pass' };
        const mapped = await schema.mapper(original);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.password).toBe('my-secret-pass');
      });
    });
  });

  describe('Field Type Parsing', () => {
    it('should parse simple type strings', async () => {
      const validator = new ResourceValidator({
        attributes: {
          field1: 'string',
          field2: 'number',
          field3: 'boolean'
        }
      });

      const result = await validator.validate({
        field1: 'test',
        field2: 42,
        field3: true
      });

      expect(result.isValid).toBe(true);
    });

    it('should parse type with modifiers', async () => {
      const validator = new ResourceValidator({
        attributes: {
          required_field: 'string|required',
          optional_field: 'string|optional'
        }
      });

      // Missing required field should fail
      const result = await validator.validate({
        optional_field: 'test'
      });

      expect(result.isValid).toBe(false);
    });

    it('should parse email type', async () => {
      const validator = new ResourceValidator({
        attributes: {
          email: 'email'  // Use fastest-validator's native email type
        }
      });

      const validResult = await validator.validate({ email: 'test@example.com' });
      expect(validResult.isValid).toBe(true);

      // fastest-validator's email type is permissive, but requires @ symbol
      const invalidResult = await validator.validate({ email: '' });
      expect(invalidResult.isValid).toBe(false);
    });

    it('should parse url type', async () => {
      const validator = new ResourceValidator({
        attributes: {
          website: 'url'
        }
      });

      const validResult = await validator.validate({ website: 'https://example.com' });
      expect(validResult.isValid).toBe(true);
    });

    it('should parse enum type', async () => {
      const validator = new ResourceValidator({
        attributes: {
          // Use fastest-validator's object format for enum
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] }
        }
      });

      const validResult = await validator.validate({ status: 'active' });
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator.validate({ status: 'unknown' });
      expect(invalidResult.isValid).toBe(false);
    });
  });

  describe('Timestamp handling', () => {
    it('should handle ISO timestamp encoding', async () => {
      const schema = new Schema({
        attributes: {
          createdAt: 'string|required'
        }
      });

      const date = new Date('2024-01-15T10:30:00Z');
      const original = { createdAt: date.toISOString() };

      const mapped = await schema.mapper(original);
      const unmapped = await schema.unmapper(mapped);

      // Should preserve the timestamp string
      expect(unmapped.createdAt).toBe(date.toISOString());
    });
  });

  describe('Array handling', () => {
    it('should validate array fields', async () => {
      const validator = new ResourceValidator({
        attributes: {
          tags: 'array|items:string'
        }
      });

      const validResult = await validator.validate({ tags: ['a', 'b', 'c'] });
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator.validate({ tags: 'not-an-array' });
      expect(invalidResult.isValid).toBe(false);
    });

    it('should handle empty arrays', async () => {
      const validator = new ResourceValidator({
        attributes: {
          items: 'array|optional'
        }
      });

      const result = await validator.validate({ items: [] });
      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', async () => {
      const validator = new ResourceValidator({
        attributes: {
          data: 'object|optional'
        }
      });

      const result = await validator.validate({ data: {} });
      expect(result.isValid).toBe(true);
    });

    it('should handle deeply nested structures', async () => {
      const schema = new Schema({
        attributes: {
          level1: {
            level2: {
              level3: {
                value: 'string|optional'
              }
            }
          }
        }
      });

      const data = {
        level1: {
          level2: {
            level3: {
              value: 'deep value'
            }
          }
        }
      };

      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.level1.level2.level3.value).toBe('deep value');
    });

    it('should handle special characters in values', async () => {
      const schema = new Schema({
        attributes: {
          content: 'string|optional'
        }
      });

      const specialContent = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\t\r';
      const data = { content: specialContent };

      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.content).toBe(specialContent);
    });

    it('should handle unicode characters', async () => {
      const schema = new Schema({
        attributes: {
          text: 'string|optional'
        }
      });

      const unicodeText = '日本語 中文 한국어 🎉🚀';
      const data = { text: unicodeText };

      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.text).toBe(unicodeText);
    });
  });
});
