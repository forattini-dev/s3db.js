/**
 * Validator Unit Tests
 *
 * Tests the validation system using fastest-validator.
 * Tests type validation, constraints, and error handling.
 */

import { describe, it, expect } from 'vitest';
import { ValidatorManager } from '#src/validator.class.js';

describe('Validator Unit Tests', () => {
  describe('ValidatorManager', () => {
    describe('Basic Type Validation', () => {
      it('should validate string type', () => {
        const validator = new ValidatorManager();
        const schema = { name: { type: 'string' } };
        const compiled = validator.compile(schema);

        expect(compiled({ name: 'hello' })).toBe(true);
        expect(compiled({ name: 123 })).not.toBe(true);
      });

      it('should validate number type', () => {
        const validator = new ValidatorManager();
        const schema = { count: { type: 'number' } };
        const compiled = validator.compile(schema);

        expect(compiled({ count: 42 })).toBe(true);
        expect(compiled({ count: 3.14 })).toBe(true);
        expect(compiled({ count: 'not a number' })).not.toBe(true);
      });

      it('should validate boolean type', () => {
        const validator = new ValidatorManager();
        const schema = { active: { type: 'boolean' } };
        const compiled = validator.compile(schema);

        expect(compiled({ active: true })).toBe(true);
        expect(compiled({ active: false })).toBe(true);
        expect(compiled({ active: 'true' })).toBe(true);
        expect(compiled({ active: 'false' })).toBe(true);
        expect(compiled({ active: 1 })).toBe(true);
        expect(compiled({ active: 0 })).toBe(true);
        expect(compiled({ active: 'invalid' })).not.toBe(true);
      });

      it('should validate array type', () => {
        const validator = new ValidatorManager();
        const schema = { items: { type: 'array' } };
        const compiled = validator.compile(schema);

        expect(compiled({ items: [] })).toBe(true);
        expect(compiled({ items: [1, 2, 3] })).toBe(true);
        expect(compiled({ items: 'not an array' })).not.toBe(true);
      });

      it('should validate object type', () => {
        const validator = new ValidatorManager();
        const schema = { data: { type: 'object' } };
        const compiled = validator.compile(schema);

        expect(compiled({ data: {} })).toBe(true);
        expect(compiled({ data: { key: 'value' } })).toBe(true);
      });
    });

    describe('Required/Optional Fields', () => {
      it('should require fields marked as required', () => {
        const validator = new ValidatorManager();
        const schema = {
          name: { type: 'string' },
          email: { type: 'string', optional: false }
        };
        const compiled = validator.compile(schema);

        // Missing required field should fail
        const result = compiled({ name: 'John' });
        expect(result).not.toBe(true);
      });

      it('should allow missing optional fields', () => {
        const validator = new ValidatorManager();
        const schema = {
          name: { type: 'string' },
          bio: { type: 'string', optional: true }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ name: 'John' })).toBe(true);
      });

      it('should handle nullable fields', () => {
        const validator = new ValidatorManager();
        const schema = {
          value: { type: 'string', nullable: true }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ value: 'test' })).toBe(true);
        expect(compiled({ value: null })).toBe(true);
      });
    });

    describe('String Constraints', () => {
      it('should validate minlength constraint', () => {
        const validator = new ValidatorManager();
        const schema = {
          password: { type: 'string', min: 8 }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ password: 'longpassword' })).toBe(true);
        expect(compiled({ password: 'short' })).not.toBe(true);
      });

      it('should validate maxlength constraint', () => {
        const validator = new ValidatorManager();
        const schema = {
          code: { type: 'string', max: 5 }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ code: 'ABC' })).toBe(true);
        expect(compiled({ code: 'TOOLONGCODE' })).not.toBe(true);
      });

      it('should validate pattern constraint', () => {
        const validator = new ValidatorManager();
        const schema = {
          code: { type: 'string', pattern: /^[A-Z]{3}$/ }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ code: 'ABC' })).toBe(true);
        expect(compiled({ code: 'abc' })).not.toBe(true);
        expect(compiled({ code: 'ABCD' })).not.toBe(true);
      });

      it('should validate email format', () => {
        const validator = new ValidatorManager();
        const schema = {
          email: { type: 'email' }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ email: 'test@example.com' })).toBe(true);
        expect(compiled({ email: 'invalid-email' })).not.toBe(true);
      });

      it('should validate url format', () => {
        const validator = new ValidatorManager();
        const schema = {
          website: { type: 'url' }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ website: 'https://example.com' })).toBe(true);
        expect(compiled({ website: 'not-a-url' })).not.toBe(true);
      });
    });

    describe('Number Constraints', () => {
      it('should validate min constraint', () => {
        const validator = new ValidatorManager();
        const schema = {
          age: { type: 'number', min: 0 }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ age: 25 })).toBe(true);
        expect(compiled({ age: 0 })).toBe(true);
        expect(compiled({ age: -5 })).not.toBe(true);
      });

      it('should validate max constraint', () => {
        const validator = new ValidatorManager();
        const schema = {
          percentage: { type: 'number', max: 100 }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ percentage: 50 })).toBe(true);
        expect(compiled({ percentage: 100 })).toBe(true);
        expect(compiled({ percentage: 150 })).not.toBe(true);
      });

      it('should validate integer constraint', () => {
        const validator = new ValidatorManager();
        const schema = {
          count: { type: 'number', integer: true }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ count: 42 })).toBe(true);
        expect(compiled({ count: 3.14 })).not.toBe(true);
      });

      it('should validate positive constraint', () => {
        const validator = new ValidatorManager();
        const schema = {
          price: { type: 'number', positive: true }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ price: 99.99 })).toBe(true);
        expect(compiled({ price: 0 })).not.toBe(true);
        expect(compiled({ price: -10 })).not.toBe(true);
      });
    });

    describe('Enum Validation', () => {
      it('should validate enum values', () => {
        const validator = new ValidatorManager();
        const schema = {
          status: { type: 'enum', values: ['active', 'inactive', 'pending'] }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ status: 'active' })).toBe(true);
        expect(compiled({ status: 'inactive' })).toBe(true);
        expect(compiled({ status: 'unknown' })).not.toBe(true);
      });

      it('should handle numeric enum values', () => {
        const validator = new ValidatorManager();
        const schema = {
          priority: { type: 'enum', values: [1, 2, 3] }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ priority: 1 })).toBe(true);
        expect(compiled({ priority: 2 })).toBe(true);
        expect(compiled({ priority: 5 })).not.toBe(true);
      });
    });

    describe('Array Validation', () => {
      it('should validate array items type', () => {
        const validator = new ValidatorManager();
        const schema = {
          tags: { type: 'array', items: 'string' }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ tags: ['a', 'b', 'c'] })).toBe(true);
        expect(compiled({ tags: [1, 2, 3] })).not.toBe(true);
      });

      it('should validate array length constraints', () => {
        const validator = new ValidatorManager();
        const schema = {
          items: { type: 'array', min: 1, max: 5 }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ items: [1] })).toBe(true);
        expect(compiled({ items: [1, 2, 3, 4, 5] })).toBe(true);
        expect(compiled({ items: [] })).not.toBe(true);
        expect(compiled({ items: [1, 2, 3, 4, 5, 6] })).not.toBe(true);
      });
    });

    describe('Nested Object Validation', () => {
      it('should validate nested objects', () => {
        const validator = new ValidatorManager();
        const schema = {
          profile: {
            type: 'object',
            props: {
              name: { type: 'string' },
              age: { type: 'number' }
            }
          }
        };
        const compiled = validator.compile(schema);

        expect(compiled({
          profile: { name: 'John', age: 30 }
        })).toBe(true);

        expect(compiled({
          profile: { name: 'John', age: 'thirty' }
        })).not.toBe(true);
      });

      it('should validate deeply nested objects', () => {
        const validator = new ValidatorManager();
        const schema = {
          data: {
            type: 'object',
            props: {
              level1: {
                type: 'object',
                props: {
                  level2: {
                    type: 'object',
                    props: {
                      value: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        };
        const compiled = validator.compile(schema);

        expect(compiled({
          data: {
            level1: {
              level2: {
                value: 'deep'
              }
            }
          }
        })).toBe(true);
      });
    });

    describe('Error Messages', () => {
      it('should return error details for invalid data', () => {
        const validator = new ValidatorManager();
        const schema = {
          name: { type: 'string' },
          age: { type: 'number', min: 0 }
        };
        const compiled = validator.compile(schema);

        const result = compiled({ name: 123, age: -5 });

        // Result should be an array of errors
        expect(result).not.toBe(true);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      });

      it('should include field information in errors', () => {
        const validator = new ValidatorManager();
        const schema = {
          email: { type: 'email' }
        };
        const compiled = validator.compile(schema);

        const result = compiled({ email: 'invalid' });

        expect(result).not.toBe(true);
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].field).toBe('email');
      });
    });

    describe('Custom Types', () => {
      it('should validate date type', () => {
        const validator = new ValidatorManager();
        const schema = {
          createdAt: { type: 'date' }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ createdAt: new Date() })).toBe(true);
      });

      it('should validate any type', () => {
        const validator = new ValidatorManager();
        const schema = {
          data: { type: 'any' }
        };
        const compiled = validator.compile(schema);

        expect(compiled({ data: 'string' })).toBe(true);
        expect(compiled({ data: 123 })).toBe(true);
        expect(compiled({ data: { nested: true } })).toBe(true);
        expect(compiled({ data: [1, 2, 3] })).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty schema', () => {
        const validator = new ValidatorManager();
        const schema = {};
        const compiled = validator.compile(schema);

        expect(compiled({})).toBe(true);
        expect(compiled({ extra: 'field' })).toBe(true);
      });

      it('should handle special characters in field names', () => {
        const validator = new ValidatorManager();
        const schema = {
          'field-with-dash': { type: 'string' },
          'field_with_underscore': { type: 'string' }
        };
        const compiled = validator.compile(schema);

        expect(compiled({
          'field-with-dash': 'value1',
          'field_with_underscore': 'value2'
        })).toBe(true);
      });
    });
  });
});
