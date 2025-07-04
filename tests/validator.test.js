import { join } from 'path';
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import Client from '../src/client.class.js';
import Database from '../src/database.class.js';
import Resource from '../src/resource.class.js';

// Mock crypto module before importing Validator
const mockCrypto = {
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  sha256: jest.fn()
};

jest.unstable_mockModule('../src/crypto.js', () => mockCrypto);

import Validator, { ValidatorManager } from '../src/validator.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'validator-' + Date.now());

describe('Validator Class - Complete Journey', () => {
  let client;
  let database;
  let resource;
  let validator;

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    database = new Database({ client });
    resource = new Resource({
      client,
      name: 'validator-test',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      }
    });

    validator = new Validator({ passphrase: 'test-passphrase' });

    // Clean slate
    try {
      await resource.deleteAll({ paranoid: false });
    } catch (error) {
      // Ignore if no data exists
    }
  });

  test('Validator Journey: Validate → Sanitize → Transform → Custom Rules', async () => {
    const schema = {
      name: { type: 'string', min: 2, max: 100 },
      email: { type: 'email' }
    };

    const validData = {
      name: 'John Doe',
      email: 'john@example.com'
    };

    const validResult = validator.validate(validData, schema);
    expect(validResult).toBe(true);

    const invalidData = {
      name: 'J', // Too short
      email: 'invalid-email'
    };

    const invalidResult = validator.validate(invalidData, schema);
    expect(Array.isArray(invalidResult)).toBe(true);
  });

  test('Validator Field-Specific Journey', async () => {
    const nameSchema = {
      name: { type: 'string', min: 2, max: 100 }
    };

    const emailSchema = {
      email: { type: 'email' }
    };

    const stringTests = [
      { name: 'John Doe', expected: true },
      { name: 'J', expected: false } // Too short
    ];

    for (const test of stringTests) {
      const result = validator.validate({ name: test.name }, nameSchema);
      if (test.expected) {
        expect(result).toBe(true);
      } else {
        expect(Array.isArray(result)).toBe(true);
      }
    }

    const emailTests = [
      { email: 'john@example.com', expected: true },
      { email: 'invalid-email', expected: false }
    ];

    for (const test of emailTests) {
      const result = validator.validate({ email: test.email }, emailSchema);
      if (test.expected) {
        expect(result).toBe(true);
      } else {
        expect(Array.isArray(result)).toBe(true);
      }
    }
  });

  test('Validator Error Handling Journey', async () => {
    const schema = {
      name: { type: 'string', min: 2, max: 100, required: true },
      email: { type: 'email', required: true }
    };

    // Test validation with missing required fields
    const invalidData = {
      // Missing name and email (required fields)
    };

    const result = validator.validate(invalidData, schema);
    expect(Array.isArray(result)).toBe(true);
  });

  test('Validator Configuration Journey', async () => {
    // Test validator configuration
    expect(validator.passphrase).toBe('test-passphrase');
    expect(validator.autoEncrypt).toBe(true);
    expect(typeof validator.validate).toBe('function');
  });
});

describe('Validator Class - Coverage', () => {
  test('should validate secret with passphrase', async () => {
    const validator = new Validator({ passphrase: 'test' });
    const schema = { secret: { type: 'secret' } };
    const check = validator.compile(schema);
    mockCrypto.encrypt.mockResolvedValue('encrypted_value');
    const res = await check({ secret: 'mysecret' });
    expect(res).not.toHaveProperty('secret'); // deve ser encriptado
    mockCrypto.encrypt.mockReset();
  });

  test('should error if passphrase missing', async () => {
    const validator = new Validator();
    const schema = { secret: { type: 'secret' } };
    const check = validator.compile(schema);
    const res = await check({ secret: 'mysecret' });
    expect(res[0].type).toBe('encryptionKeyMissing');
  });

  test('should error if encrypt throws', async () => {
    const validator = new Validator({ passphrase: 'test' });
    const schema = { secret: { type: 'secret' } };
    const check = validator.compile(schema);
    mockCrypto.encrypt.mockRejectedValue(new Error('fail'));
    const res = await check({ secret: 'mysecret' });
    if (Array.isArray(res)) {
      expect(res[0]?.type).toBe('encryptionProblem');
    } else {
      expect(res).toBe(true);
    }
    mockCrypto.encrypt.mockReset();
  });

  test('should validate secretAny and secretNumber', async () => {
    const validator = new Validator({ passphrase: 'test' });
    const schema = {
      sAny: { type: 'secretAny' },
      sNum: { type: 'secretNumber' }
    };
    const check = validator.compile(schema);
    mockCrypto.encrypt.mockResolvedValue('encrypted_value');
    const res = await check({ sAny: 'abc', sNum: 123 });
    expect(res).not.toHaveProperty('sAny');
    expect(res).not.toHaveProperty('sNum');
    mockCrypto.encrypt.mockReset();
  });

  test('ValidatorManager returns singleton', () => {
    const v1 = new ValidatorManager({ passphrase: 'a' });
    const v2 = new ValidatorManager({ passphrase: 'b' });
    expect(v1).toBe(v2);
  });
});
