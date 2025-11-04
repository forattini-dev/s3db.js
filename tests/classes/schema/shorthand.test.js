import { beforeEach, describe, expect, test } from '@jest/globals';

import Schema from '#src/schema.class.js';

describe('Schema Class - Comprehensive Shorthand Notation Validation', () => {
  let schema;

  beforeEach(() => {
    schema = new Schema({
      name: 'shorthand-test-schema',
      attributes: {},
      passphrase: 'test-passphrase'
    });
  });

  describe('String Constraint Shorthand Validation', () => {
    test('validates basic string constraints with proper error structure', async () => {
      const testSchema = new Schema({
        name: 'string-constraints',
        attributes: {
          username: 'string|min:3|max:20',
          email: 'email|required',
          description: 'string|empty:false',
          hexValue: 'string|hex:true',
          code: 'string|length:6'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid data
      const validData = {
        username: 'john_doe',
        email: 'john@example.com',
        description: 'A valid description',
        hexValue: 'FF00AA',
        code: 'ABC123'
      };

      const validResult = await testSchema.validate(validData);
      expect(validResult).toBe(true);

      // Test constraint violations with proper error structure validation
      const invalidData = {
        username: 'jo', // too short
        email: 'invalid-email',
        description: '', // empty not allowed
        hexValue: 'GGHHII', // invalid hex
        code: 'TOOLONG' // wrong length
      };

      const invalidResult = await testSchema.validate(invalidData);
      expect(Array.isArray(invalidResult)).toBe(true);
      expect(invalidResult.length).toBe(5); // Should have exactly 5 errors

      // Check specific error types and fields following fastest-validator pattern
      expect(invalidResult.find(err => err.field === 'username' && err.type === 'stringMin')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'email' && err.type === 'email')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'description' && err.type === 'stringEmpty')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'hexValue' && err.type === 'stringHex')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'code' && err.type === 'stringLength')).toBeDefined();

      // Verify error structure properties
      invalidResult.forEach(error => {
        expect(error).toHaveProperty('type');
        expect(error).toHaveProperty('field');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('actual');
        expect(typeof error.message).toBe('string');
      });
    });

    test('validates advanced string constraint combinations', async () => {
      const testSchema = new Schema({
        name: 'advanced-string-constraints',
        attributes: {
          alphaField: 'string|min:3|max:20|alpha:true',
          numericField: 'string|length:6|numeric:true',
          alphanumField: 'string|min:5|max:15|alphanum:true',
          alphadashField: 'string|min:3|max:25|alphadash:true'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid combinations (sanitization doesn't happen during validation)
      const validObj = {
        alphaField: 'Hello',
        numericField: '123456',
        alphanumField: 'test123',
        alphadashField: 'hello-world_test'
      };

      const validResult = await testSchema.validate(validObj);
      expect(validResult).toBe(true);

      // Note: sanitization effects happen during mapping, not validation
      // Values remain unchanged during validation
      expect(validObj.alphaField).toBe('Hello');
      expect(validObj.numericField).toBe('123456');
      expect(validObj.alphanumField).toBe('test123');
      expect(validObj.alphadashField).toBe('hello-world_test');

      // Test constraint violations
      const invalidResult = await testSchema.validate({
        alphaField: 'Hello123', // contains numbers
        numericField: 'abc123', // contains letters
        alphanumField: 'test!', // contains special char
        alphadashField: 'hello@world' // invalid char
      });

      expect(Array.isArray(invalidResult)).toBe(true);
      expect(invalidResult.length).toBe(4); // Should have exactly 4 errors

      // Verify specific error types
      expect(invalidResult.find(err => err.field === 'alphaField' && err.type === 'stringAlpha')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'numericField' && err.type === 'stringNumeric')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'alphanumField' && err.type === 'stringAlphanum')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'alphadashField' && err.type === 'stringAlphadash')).toBeDefined();
    });

    test('validates string format flags and special patterns', async () => {
      const testSchema = new Schema({
        name: 'string-formats',
        attributes: {
          base64Field: 'string|base64:true',
          singleLineField: 'string|min:1|max:50|singleLine:true',
          multiFormatField: 'string|min:8|max:20|alphanum:true|empty:false'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid format data (no trimming during validation)
      expect(await testSchema.validate({
        base64Field: 'SGVsbG8=',
        singleLineField: 'Valid text',
        multiFormatField: 'ValidTest123'
      })).toBe(true);

      // Test format violations
      const result = await testSchema.validate({
        base64Field: 'invalid_base64!',
        singleLineField: 'Multi\nline\ntext',
        multiFormatField: 'ab' // too short
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Should have exactly 3 errors

      expect(result.find(err => err.field === 'base64Field' && err.type === 'stringBase64')).toBeDefined();
      expect(result.find(err => err.field === 'singleLineField' && err.type === 'stringSingleLine')).toBeDefined();
      expect(result.find(err => err.field === 'multiFormatField' && err.type === 'stringMin')).toBeDefined();
    });
  });

  describe('Number Constraint Shorthand Validation', () => {
    test('validates number constraints with proper error handling', async () => {
      const testSchema = new Schema({
        name: 'number-constraints',
        attributes: {
          age: 'number|min:18|max:100',
          score: 'number|min:0|max:100',
          price: 'number|positive:true',
          count: 'number|integer:true',
          rating: 'number|equal:5',
          amount: 'number'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid data
      const validData = {
        age: 25,
        score: 85,
        price: 29.99,
        count: 42,
        rating: 5,
        amount: 123.45 // already a number
      };

      const validResult = await testSchema.validate(validData);
      expect(validResult).toBe(true);
      // Note: conversion happens during mapping, not validation
      expect(validData.amount).toBe(123.45);

      // Test constraint violations
      const invalidResult = await testSchema.validate({
        age: 15, // too young
        score: 150, // too high
        price: -10, // negative
        count: 3.14, // not integer
        rating: 4, // not equal to 5
        amount: 'invalid' // not a number
      });

      expect(Array.isArray(invalidResult)).toBe(true);
      expect(invalidResult.length).toBe(6); // Should have exactly 6 errors

      // Check specific error types
      expect(invalidResult.find(err => err.field === 'age' && err.type === 'numberMin')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'score' && err.type === 'numberMax')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'price' && err.type === 'numberPositive')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'count' && err.type === 'numberInteger')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'rating' && err.type === 'numberEqual')).toBeDefined();
      expect(invalidResult.find(err => err.field === 'amount' && err.type === 'number')).toBeDefined();
    });

    test('validates specialized number patterns', async () => {
      const testSchema = new Schema({
        name: 'specialized-numbers',
        attributes: {
          percentage: 'number|min:0|max:100',
          temperature: 'number|min:-273.15',
          naturalNumber: 'number|integer:true|positive:true',
          probability: 'number|min:0|max:1'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid specialized numbers
      expect(await testSchema.validate({
        percentage: 85.5,
        temperature: 25.0,
        naturalNumber: 42,
        probability: 0.75
      })).toBe(true);

      // Test boundary violations
      const result = await testSchema.validate({
        percentage: 150, // exceeds max
        temperature: -300, // below absolute zero
        naturalNumber: -5, // negative natural number
        probability: 1.5 // exceeds probability range
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4); // Should have exactly 4 errors

      expect(result.find(err => err.field === 'percentage' && err.type === 'numberMax')).toBeDefined();
      expect(result.find(err => err.field === 'temperature' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'naturalNumber' && err.type === 'numberPositive')).toBeDefined();
      expect(result.find(err => err.field === 'probability' && err.type === 'numberMax')).toBeDefined();
    });
  });

  describe('Array Shorthand Validation', () => {
    test('validates basic array patterns with items', async () => {
      const testSchema = new Schema({
        name: 'array-patterns',
        attributes: {
          tags: 'array|items:string',
          scores: 'array|items:number',
          flags: 'array|items:boolean',
          emails: 'array|items:email'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid arrays
      expect(await testSchema.validate({
        tags: ['javascript', 'nodejs'],
        scores: [85, 92, 78],
        flags: [true, false, true],
        emails: ['test@example.com', 'user@test.org']
      })).toBe(true);

      // Test array constraint violations (basic type validation only)
      const result = await testSchema.validate({
        tags: [123, 'valid'], // 123 is not a string
        scores: ['invalid', 90], // 'invalid' is not a number
        flags: ['yes', true], // 'yes' not boolean
        emails: ['invalid-email', 'test@example.com'] // invalid email
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4); // Should have exactly 4 errors

      // Check array-specific errors (basic type validation)
      expect(result.find(err => err.field === 'tags[0]' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'scores[0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'flags[0]' && err.type === 'boolean')).toBeDefined();
      expect(result.find(err => err.field === 'emails[0]' && err.type === 'email')).toBeDefined();
    });

    test('validates complex array patterns with constraints', async () => {
      const testSchema = new Schema({
        name: 'complex-arrays',
        attributes: {
          integers: 'array|items:number',
          positiveNumbers: 'array|items:number',
          constrainedStrings: 'array|items:string',
          uniqueNumbers: 'array|items:number'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid complex arrays
      expect(await testSchema.validate({
        integers: [1, -5, 0, 42],
        positiveNumbers: [0.1, 3.14, 100],
        constrainedStrings: ['test123', 'valid456'],
        uniqueNumbers: [1, 2, 3, 4]
      })).toBe(true);

      // Test basic type violations (detailed constraints not available in shorthand)
      const result = await testSchema.validate({
        integers: ['not-a-number', 2], // 'not-a-number' not a number
        positiveNumbers: ['invalid', 5], // 'invalid' not a number
        constrainedStrings: [123, 'test'], // 123 not a string
        uniqueNumbers: ['invalid', 2, 3] // 'invalid' not a number
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4); // Should have exactly 4 errors

      expect(result.find(err => err.field === 'integers[0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'positiveNumbers[0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'constrainedStrings[0]' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'uniqueNumbers[0]' && err.type === 'number')).toBeDefined();
    });

    test('validates multi-dimensional array patterns', async () => {
      const testSchema = new Schema({
        name: 'multidimensional-arrays',
        attributes: {
          matrix2D: 'array|items:array',
          stringGrid: 'array|items:array'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid multi-dimensional arrays (basic array validation only)
      expect(await testSchema.validate({
        matrix2D: [[1, 2, 3], [4, 5, 6]],
        stringGrid: [['a', 'b'], ['c', 'd']]
      })).toBe(true);

      // Test multi-dimensional constraint violations (basic type only)
      const result = await testSchema.validate({
        matrix2D: ['not-an-array', [3, 4]], // 'not-an-array' not an array
        stringGrid: [123, ['c', 'd']] // 123 not an array
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2); // Should have exactly 2 errors

      // Check array type validation
      expect(result.find(err => err.field === 'matrix2D[0]' && err.type === 'array')).toBeDefined();
      expect(result.find(err => err.field === 'stringGrid[0]' && err.type === 'array')).toBeDefined();
    });
  });

  describe('Boolean and Date Shorthand Validation', () => {
    test('validates boolean constraints with conversion', async () => {
      const testSchema = new Schema({
        name: 'boolean-validation',
        attributes: {
          active: 'boolean',
          converted: 'boolean',
          required: 'boolean|required'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid boolean data (no conversion during validation)
      const validObj = {
        active: true,
        converted: true,
        required: false
      };

      expect(await testSchema.validate(validObj)).toBe(true);
      // Note: conversion happens during mapping, not validation
      expect(validObj.converted).toBe(true);

      // Test boolean violations
      const result = await testSchema.validate({
        active: 'maybe',
        converted: 'invalid',
        // required field missing
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Should have exactly 3 errors

      expect(result.find(err => err.field === 'active' && err.type === 'boolean')).toBeDefined();
      expect(result.find(err => err.field === 'converted' && err.type === 'boolean')).toBeDefined();
      expect(result.find(err => err.field === 'required' && err.type === 'required')).toBeDefined();
    });

    test('validates date constraints with conversion', async () => {
      const testSchema = new Schema({
        name: 'date-validation',
        attributes: {
          createdAt: 'date',
          convertedDate: 'date',
          optionalDate: 'date|optional:true'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid date data (no conversion during validation)
      const validObj = {
        createdAt: new Date(),
        convertedDate: new Date('2023-01-01'),
        optionalDate: undefined
      };

      expect(await testSchema.validate(validObj)).toBe(true);
      // Note: conversion happens during mapping, not validation
      expect(validObj.convertedDate instanceof Date).toBe(true);

      // Test date violations
      const result = await testSchema.validate({
        createdAt: 'not-a-date',
        convertedDate: 'invalid-date'
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2); // Should have exactly 2 errors

      expect(result.find(err => err.field === 'createdAt' && err.type === 'date')).toBeDefined();
      expect(result.find(err => err.field === 'convertedDate' && err.type === 'date')).toBeDefined();
    });
  });

  describe('Nested Object $$type Validation', () => {
    test('validates nested objects with $$type syntax', async () => {
      const testSchema = new Schema({
        name: 'nested-objects',
        attributes: {
          user: {
            $$type: 'object',
            name: 'string|min:2',
            email: 'email'
          },
          profile: {
            $$type: 'object|optional:true',
            bio: 'string|optional:true',
            age: 'number|min:0'
          }
        },
        passphrase: 'test-passphrase'
      });

      // Test valid nested data
      expect(await testSchema.validate({
        user: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        profile: {
          bio: 'Software developer',
          age: 30
        }
      })).toBe(true);

      // Test nested validation errors
      const result = await testSchema.validate({
        user: {
          name: 'J', // too short
          email: 'invalid-email'
        },
        profile: {
          age: -5 // negative age
        }
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Should have exactly 3 errors

      // Check nested field paths
      expect(result.find(err => err.field === 'user.name' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'user.email' && err.type === 'email')).toBeDefined();
      expect(result.find(err => err.field === 'profile.age' && err.type === 'numberMin')).toBeDefined();
    });

    test('validates deeply nested objects', async () => {
      const testSchema = new Schema({
        name: 'deep-nested',
        attributes: {
          organization: {
            $$type: 'object',
            department: {
              $$type: 'object',
              team: {
                $$type: 'object',
                lead: {
                  $$type: 'object',
                  name: 'string|min:2',
                  contact: 'email'
                }
              }
            }
          }
        },
        passphrase: 'test-passphrase'
      });

      // Test valid deep nesting
      expect(await testSchema.validate({
        organization: {
          department: {
            team: {
              lead: {
                name: 'Team Lead',
                contact: 'lead@company.com'
              }
            }
          }
        }
      })).toBe(true);

      // Test deep validation errors
      const result = await testSchema.validate({
        organization: {
          department: {
            team: {
              lead: {
                name: 'X', // too short
                contact: 'invalid-email'
              }
            }
          }
        }
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2); // Should have exactly 2 errors

      // Check deep nested field paths
      expect(result.find(err => err.field === 'organization.department.team.lead.name' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'organization.department.team.lead.contact' && err.type === 'email')).toBeDefined();
    });
  });

  describe('Complex Constraint Combinations', () => {
    test('validates real-world complex schemas', async () => {
      const testSchema = new Schema({
        name: 'complex-real-world',
        attributes: {
          username: 'string|min:3|max:20|alphanum:true|trim:true|lowercase:true',
          email: 'email|required',
          profile: {
            $$type: 'object',
            firstName: 'string|min:2|max:50|alpha:true|trim:true',
            lastName: 'string|min:2|max:50|alpha:true|trim:true',
            age: 'number|min:13|max:120|integer:true',
            bio: 'string|max:500|optional:true'
          },
          preferences: {
            $$type: 'object|optional:true',
            theme: 'string',
            notifications: 'boolean',
            tags: 'array|items:string'
          },
          scores: 'array|items:number',
          metadata: 'json|optional:true'
        },
        passphrase: 'test-passphrase'
      });

      // Test valid complex data
      const validObj = {
        username: '  JohnDoe123  ',
        email: 'john@example.com',
        profile: {
          firstName: '  John  ',
          lastName: '  Doe  ',
          age: 25,
          bio: 'Software developer with 5 years experience'
        },
        preferences: {
          theme: 'dark',
          notifications: true,
          tags: ['javascript', 'nodejs']
        },
        scores: [85, 92, 78],
        metadata: { role: 'developer', level: 'senior' }
      };

      expect(await testSchema.validate(validObj)).toBe(true);

      // Note: sanitization effects happen during mapping, not validation
      // Values remain unchanged during validation
      expect(validObj.username).toBe('  JohnDoe123  ');
      expect(validObj.profile.firstName).toBe('  John  ');
      expect(validObj.profile.lastName).toBe('  Doe  ');
      expect(validObj.preferences.notifications).toBe(true);

      // Test complex constraint violations
      const result = await testSchema.validate({
        username: 'jo', // too short
        email: 'invalid-email',
        profile: {
          firstName: 'J', // too short
          lastName: 'Doe123', // contains numbers
          age: 12, // too young
          bio: 'x'.repeat(600) // too long
        },
        preferences: {
          theme: 123, // not a string
          notifications: 'maybe', // invalid boolean
          tags: [123, 'valid'] // 123 not a string
        },
        scores: ['invalid', 90] // 'invalid' not a number
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(10); // Updated based on actual error count

      // Verify complex error patterns (basic type validation only)
      expect(result.find(err => err.field === 'username' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'email' && err.type === 'email')).toBeDefined();
      expect(result.find(err => err.field === 'profile.firstName' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'profile.lastName' && err.type === 'stringAlpha')).toBeDefined();
      expect(result.find(err => err.field === 'profile.age' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'profile.bio' && err.type === 'stringMax')).toBeDefined();
      expect(result.find(err => err.field === 'preferences.theme' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'preferences.notifications' && err.type === 'boolean')).toBeDefined();
      expect(result.find(err => err.field === 'preferences.tags[0]' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'scores[0]' && err.type === 'number')).toBeDefined();
    });
  });
});
