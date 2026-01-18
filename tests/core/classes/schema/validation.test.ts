import { cloneDeep } from 'lodash-es';

import Resource from '#src/resource.class.js';
import Schema from '#src/schema.class.js';
import { ResourceValidator } from '#src/core/resource-validator.class.js';
import { createClientForTest } from '#tests/config.js';

const validationAttributes = {
  name: 'string|required',
  email: 'email|required',
  age: 'number|optional',
  active: 'boolean|default:true',
  password: 'secret'
};

const buildValidator = () =>
  new ResourceValidator({
    attributes: validationAttributes,
    passphrase: 'test-passphrase'
  });

describe('ResourceValidator.validate', () => {
  test('returns isValid true for valid data and errors for invalid input', async () => {
    const validator = buildValidator();

    const validResult = await validator.validate({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      password: 'secret123'
    });
    expect(validResult.isValid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    const invalidResult = await validator.validate({
      name: 'John Doe',
      email: 'invalid-email',
      age: 'not-a-number',
      active: 'not-a-boolean'
    });

    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  test('respects mutateOriginal option', async () => {
    const validator = buildValidator();
    const original = {
      name: '  Jane Smith  ',
      email: 'jane@example.com',
      age: 28,
      active: true,
      password: 'secret123'
    };

    const copy = cloneDeep(original);

    const resultWithoutMutation = await validator.validate(original, { mutateOriginal: false });
    expect(resultWithoutMutation.isValid).toBe(true);
    expect(original.name).toBe('  Jane Smith  ');

    const resultWithMutation = await validator.validate(copy, { mutateOriginal: true });
    expect(resultWithMutation.isValid).toBe(true);
    expect(copy.name).toBe('Jane Smith');
  });
});

describe('Schema validation options', () => {
  test('preprocesses optional nested objects before validation', () => {
    const attributes = {
      department: 'string',
      team: 'string',
      scopes: 'string|optional',
      isActive: 'boolean|optional|default:true',
      apiToken: 'secret',
      webpush: {
        $$type: 'object|optional',
        enabled: 'boolean|optional|default:false',
        endpoint: 'string|optional',
        p256dh: 'string|optional',
        auth: 'string|optional'
      },
      metadata: 'string|optional'
    };

    const schema = new Schema({ name: 'preprocess', attributes });
    const processed = schema.preprocessAttributesForValidation(attributes);

    expect(processed.webpush).toBeDefined();
    expect(processed.webpush.type).toBe('object');
    expect(processed.webpush.optional).toBe(true);
    expect(processed.webpush.props.enabled).toEqual({ type: 'boolean', optional: true, default: false });
  });

  test('honours allNestedObjectsOptional option', () => {
    const attributes = {
      department: 'string',
      team: 'string',
      webpush: {
        enabled: 'boolean|optional|default:false',
        endpoint: 'string|optional'
      },
      requiredObject: {
        $$type: 'object|required',
        field: 'string'
      },
      optionalObject: {
        $$type: 'object|optional',
        field: 'string'
      }
    };

    const schema = new Schema({
      name: 'all-optional',
      attributes,
      options: { allNestedObjectsOptional: true }
    });

    const processed = schema.preprocessAttributesForValidation(attributes);
    expect(processed.webpush.optional).toBe(true);
    expect(processed.requiredObject.optional).toBeUndefined();
    expect(processed.optionalObject.optional).toBe(true);
  });

  test('preprocesses deeply nested optional objects', () => {
    const attributes = {
      a: 'string|required',
      b: { $$type: 'object|optional', x: 'number' },
      c: { $$type: 'object', y: 'string' },
      d: { $$type: 'object|optional', z: { $$type: 'object|optional', w: 'string' } }
    };

    const schema = new Schema({ name: 'nested', attributes });
    const processed = schema.preprocessAttributesForValidation(attributes);

    expect(processed.b.optional).toBe(true);
    expect(processed.c.optional).toBeUndefined();
    expect(processed.d.optional).toBe(true);
    expect(processed.d.props.z.optional).toBe(true);
  });

  test('validates nested optional objects', async () => {
    const nestedAttributes = {
      department: 'string',
      team: 'string',
      webpush: {
        $$type: 'object|optional',
        enabled: 'boolean|optional|default:false',
        endpoint: 'string|optional'
      }
    };

    const validator = new ResourceValidator({ attributes: nestedAttributes });

    const result1 = await validator.validate({ department: 'DEP-001', team: 'engineering-team' });
    expect(result1.isValid).toBe(true);

    const result2 = await validator.validate({
      department: 'DEP-001',
      team: 'engineering-team',
      webpush: { enabled: true, endpoint: 'https://example.com/push' }
    });
    expect(result2.isValid).toBe(true);

    const result3 = await validator.validate({ team: 'engineering-team' });
    expect(result3.isValid).toBe(false);
    expect(result3.errors.length).toBeGreaterThan(0);
  });
});

describe('Schema + Resource integration', () => {
  test('validates optional nested objects through Resource.validate', async () => {
    const client = createClientForTest('schema-validation-integration');

    const resource = new Resource({
      client,
      name: 'users_v1',
      attributes: {
        department: 'string',
        team: 'string',
        scopes: 'string|optional',
        isActive: 'boolean|optional|default:true',
        apiToken: 'secret',
        webpush: {
          $$type: 'object|optional',
          enabled: 'boolean|optional|default:false',
          endpoint: 'string|optional'
        },
        metadata: 'string|optional'
      },
      options: {
        timestamps: true,
        partitions: {
          byDepartment: { fields: { department: 'string' } },
          byTeam: { fields: { team: 'string' } }
        }
      }
    });

    expect(resource.name).toBe('users_v1');

    const withoutWebpush = await resource.validate({
      department: 'DEP-001',
      team: 'engineering-team',
      apiToken: 'test-token'
    });
    expect(withoutWebpush.isValid).toBe(true);
    expect(withoutWebpush.errors).toHaveLength(0);

    const withWebpush = await resource.validate({
      department: 'DEP-001',
      team: 'engineering-team',
      apiToken: 'test-token',
      webpush: {
        enabled: true,
        endpoint: 'https://example.com/push'
      }
    });
    expect(withWebpush.isValid).toBe(true);
    expect(withWebpush.errors).toHaveLength(0);
  });
});
