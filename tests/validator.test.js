import { describe, expect, test } from '@jest/globals';

import {
  Validator,
  ValidatorManager,
} from '../src/validator.class.js';

const DEFAULT_PASSPHRASE = '$ecret';

describe('Validator Class - Complete Journey', () => {

  test('Validator Journey: Create → Configure → Compile → Validate → Encrypt/Decrypt', async () => {

    // 1. Create validator with configuration
    const validator = new Validator({ 
      passphrase: DEFAULT_PASSPHRASE,
      customMessages: {
        required: 'Field is required',
        email: 'Invalid email format'
      }
    });

    expect(validator).toBeDefined();
    expect(validator.passphrase).toBe(DEFAULT_PASSPHRASE);
    

    // 2. Test basic validation rules
    const basicSchema = {
      $$async: true,
      name: 'string|required|min:2|max:50',
      email: 'email|required',
      age: 'number|positive|integer|max:120',
      active: 'boolean|default:true',
      website: 'url|optional'
    };

    const basicValidator = validator.compile(basicSchema);
    
    // Valid data
    const validData = {
      name: 'João Silva',
      email: 'joao@example.com',
      age: 30,
      website: 'https://joao.dev'
    };

    const validResult = await basicValidator(validData);
    expect(validResult).toBe(true);
    expect(validData.active).toBe(true); // Default value applied
    

    // 3. Test validation errors
    
    const invalidData = {
      name: 'J', // Too short
      email: 'invalid-email', // Invalid format
      age: -5, // Negative
      website: 'not-a-url'
    };

    const invalidResult = await basicValidator(invalidData);
    expect(Array.isArray(invalidResult)).toBe(true);
    expect(invalidResult.length).toBeGreaterThan(0);
    
    // Check specific error types
    const errors = invalidResult;
    expect(errors.some(e => e.type === 'stringMin')).toBe(true);
    expect(errors.some(e => e.type === 'email')).toBe(true);
    expect(errors.some(e => e.type === 'numberPositive')).toBe(true);
    

    // 4. Test secret field encryption
    
    const secretSchema = {
      $$async: true,
      username: 'string|required',
      password: 'secret|required|min:8',
      email: 'email|required'
    };

    const secretValidator = validator.compile(secretSchema);
    
    const userData = {
      username: 'testuser',
      password: 'mysecretpassword123',
      email: 'test@example.com'
    };

    const secretResult = await secretValidator(userData);
    expect(secretResult).toBe(true);
    
    // Password should be encrypted (if encryption is enabled)
    

    // 5. Test nested object validation
    
    const nestedSchema = {
      $$async: true,
      name: 'string|required',
      profile: {
        type: 'object',
        props: {
          bio: 'string|optional|max:500',
          social: {
            type: 'object',
            props: {
              twitter: 'string|optional',
              github: 'string|optional'
            }
          },
          preferences: {
            type: 'object',
            props: {
              theme: 'string|optional|default:dark',
              notifications: 'boolean|default:true'
            }
          }
        }
      }
    };

    const nestedValidator = validator.compile(nestedSchema);
    
    const nestedData = {
      name: 'Maria Santos',
      profile: {
        bio: 'Desenvolvedora Full Stack',
        social: {
          twitter: '@maria_dev',
          github: 'maria-santos'
        },
        preferences: {
          theme: 'light'
          // notifications will get default value
        }
      }
    };

    const nestedResult = await nestedValidator(nestedData);
    expect(nestedResult).toBe(true);
    expect(nestedData.profile.preferences.notifications).toBe(true); // Default applied
    

    // 6. Test array validation
    
    const arraySchema = {
      $$async: true,
      name: 'string|required',
      tags: {
        type: 'array',
        items: 'string|min:2',
        min: 1,
        max: 5
      },
      scores: {
        type: 'array',
        items: 'number|positive',
        optional: true
      }
    };

    const arrayValidator = validator.compile(arraySchema);
    
    const arrayData = {
      name: 'Test User',
      tags: ['javascript', 'node.js', 'react'],
      scores: [85, 92, 78, 94]
    };

    const arrayResult = await arrayValidator(arrayData);
    expect(arrayResult).toBe(true);
    

    // 7. Test array validation errors
    
    const invalidArrayData = {
      name: 'Test User',
      tags: ['js', 'a'], // Items too short
      scores: [85, -10, 78] // Negative number
    };

    const arrayErrorResult = await arrayValidator(invalidArrayData);
    expect(Array.isArray(arrayErrorResult)).toBe(true);
    expect(arrayErrorResult.length).toBeGreaterThan(0);
    

    // 8. Test validation manager functionality
    
    // Test simple validation without custom functions
    const simpleSchema = {
      $$async: true,
      email: 'email|required',
      confirmPassword: 'string|required|min:8'
    };

    const simpleValidator = validator.compile(simpleSchema);
    
    // Valid case
    const validEmails = {
      email: 'test@example.com',
      confirmPassword: 'password123'
    };
    
    const simpleValidResult = await simpleValidator(validEmails);
    expect(simpleValidResult).toBe(true);
    
    // Invalid case
    const invalidEmails = {
      email: 'invalid-email',
      confirmPassword: '123' // Too short
    };
    
    const simpleInvalidResult = await simpleValidator(invalidEmails);
    expect(Array.isArray(simpleInvalidResult)).toBe(true);
    expect(simpleInvalidResult.length).toBeGreaterThan(0);
    

    // 9. Test ValidatorManager singleton
    
    const manager1 = new ValidatorManager();
    const manager2 = new ValidatorManager();
    
    expect(manager1).toBe(manager2); // Should be the same instance
    

    // 10. Test error handling for missing passphrase
    
    const validatorWithoutPassphrase = new Validator();
    const secretSchemaCheck = validatorWithoutPassphrase.compile({ password: 'secret' });
    
    const testData = { password: 'test-password' };
    const result = await secretSchemaCheck(testData);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.some(e => e.type === 'encryptionKeyMissing')).toBe(true);
    

    // 11. Test async vs sync behavior
    
    // Sync behavior (default)
    const syncValidator = new Validator({ passphrase: DEFAULT_PASSPHRASE });
    const syncSchema = { password: 'secret' };
    const syncCheck = syncValidator.compile(syncSchema);
    
    const syncData = { password: 'my-password' };
    await syncCheck(syncData);
    expect(syncData.password).toBeInstanceOf(Promise);
    
    // Async behavior (explicit)
    const asyncSchema = {
      $$async: true,
      password: 'secret'
    };
    const asyncCheck = syncValidator.compile(asyncSchema);
    
    const asyncData = { password: 'my-password' };
    await asyncCheck(asyncData);
    expect(asyncData.password).not.toBeInstanceOf(Promise);
    

    // 12. Test simplified real-world scenario
    
    const realWorldSchema = {
      $$async: true,
      // User basic info
      firstName: 'string|required|min:2|max:50',
      lastName: 'string|required|min:2|max:50', 
      email: 'email|required',
      password: 'secret|required|min:8',
      
      // User profile
      profile: {
        type: 'object',
        props: {
          bio: 'string|optional|max:200',
          age: 'number|optional|min:18|max:120'
        }
      },
      
      // User preferences
      preferences: {
        type: 'object',
        props: {
          newsletter: 'boolean|default:false',
          notifications: 'boolean|default:true',
          language: { type: 'string', default: 'en', enum: ['en', 'pt', 'es', 'fr'] }
        }
      }
    };

    const realWorldValidator = validator.compile(realWorldSchema);
    
    const realWorldData = {
      firstName: 'Ana',
      lastName: 'Silva',
      email: 'ana.silva@example.com',
      password: 'securePassword123!',
      profile: {
        bio: 'Desenvolvedora apaixonada por tecnologia',
        age: 30
      },
      preferences: {
        newsletter: true,
        language: 'pt'
      }
    };

    const realWorldResult = await realWorldValidator(realWorldData);
    expect(realWorldResult).toBe(true);
    expect(realWorldData.preferences.notifications).toBe(true); // Default applied
    

  });

  test('Validator Error Scenarios Journey', async () => {

    const validator = new Validator({ passphrase: DEFAULT_PASSPHRASE });

    // Test multiple validation errors
    
    const multiErrorSchema = {
      $$async: true,
      name: 'string|required|min:5',
      email: 'email|required',
      age: 'number|required|positive|max:100',
      website: 'url|required'
    };

    const multiErrorValidator = validator.compile(multiErrorSchema);
    
    const badData = {
      name: 'Jo', // Too short
      email: 'bad-email', // Invalid format
      age: -5, // Negative
      website: 'not-url' // Invalid URL
      // Missing required fields will also cause errors
    };

    const errors = await multiErrorValidator(badData);
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(3);
    

    // Test edge cases
    
    const edgeSchema = {
      $$async: true,
      emptyString: 'string|optional',
      nullValue: 'string|optional',
      undefinedValue: 'string|optional',
      zeroNumber: 'number|optional',
      falseBoolean: 'boolean|optional'
    };

    const edgeValidator = validator.compile(edgeSchema);
    
    const edgeData = {
      emptyString: '',
      nullValue: null,
      undefinedValue: undefined,
      zeroNumber: 0,
      falseBoolean: false
    };

    const edgeResult = await edgeValidator(edgeData);
    expect(edgeResult).toBe(true);
    

  });
});
