import { cloneDeep } from 'lodash-es';

import Resource from '#src/resource.class.js';
import Schema from '#src/schema.class.js';
import { createClientForTest } from '#tests/config.js';

const buildSchema = () =>
  new Schema({
    name: 'validation-schema',
    attributes: {
      name: 'string|required',
      email: 'email|required',
      age: 'number|optional',
      active: 'boolean|default:true',
      password: 'secret'
    }
  });

describe('Schema.validate', () => {
  test('returns true for valid data and errors for invalid input', async () => {
    const schema = buildSchema();

    const validResult = await schema.validate({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      password: 'secret123'
    });
    expect(validResult).toBe(true);

    const invalidResult = await schema.validate({
      name: 'John Doe',
      email: 'invalid-email',
      age: 'not-a-number',
      active: 'not-a-boolean'
    });

    expect(Array.isArray(invalidResult)).toBe(true);
    expect(invalidResult).not.toHaveLength(0);
  });

  test('respects mutateOriginal option', async () => {
    const schema = buildSchema();
    const original = {
      name: '  Jane Smith  ',
      email: 'jane@example.com',
      age: 28,
      active: true,
      password: 'secret123'
    };

    const copy = cloneDeep(original);

    const resultWithoutMutation = await schema.validate(original, { mutateOriginal: false });
    expect(resultWithoutMutation).toBe(true);
    expect(original.name).toBe('  Jane Smith  ');

    const resultWithMutation = await schema.validate(copy, { mutateOriginal: true });
    expect(resultWithMutation).toBe(true);
    expect(copy.name).toBe('Jane Smith');
  });
});

describe('Schema validation options', () => {
  test('preprocesses optional nested objects before validation', () => {
    const attributes = {
      costCenter: 'string',
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
      costCenter: 'string',
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
    const schema = new Schema({
      name: 'nested-optional',
      attributes: {
        costCenter: 'string',
        team: 'string',
        webpush: {
          $$type: 'object|optional',
          enabled: 'boolean|optional|default:false',
          endpoint: 'string|optional'
        }
      }
    });

    await expect(
      schema.validate({ costCenter: '860290021', team: 'dp-martech-growth' })
    ).resolves.toBe(true);

    await expect(
      schema.validate({
        costCenter: '860290021',
        team: 'dp-martech-growth',
        webpush: { enabled: true, endpoint: 'https://example.com/push' }
      })
    ).resolves.toBe(true);

    const result = await schema.validate({ team: 'dp-martech-growth' });
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toHaveLength(0);
  });
});

describe('Schema + Resource integration', () => {
  test('validates optional nested objects through Resource.validate', async () => {
    const client = createClientForTest('schema-validation-integration');

    const resource = new Resource({
      client,
      name: 'users_v1',
      attributes: {
        costCenter: 'string',
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
          byCostCenter: { fields: { costCenter: 'string' } },
          byTeam: { fields: { team: 'string' } }
        }
      }
    });

    expect(resource.name).toBe('users_v1');

    const withoutWebpush = await resource.validate({
      costCenter: '860290021',
      team: 'dp-martech-growth',
      apiToken: 'test-token'
    });
    expect(withoutWebpush.isValid).toBe(true);
    expect(withoutWebpush.errors).toHaveLength(0);

    const withWebpush = await resource.validate({
      costCenter: '860290021',
      team: 'dp-martech-growth',
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
