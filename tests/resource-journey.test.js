import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-journey-' + Date.now());

describe('Resource Journey', () => {
  let client;

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    })
  });

  test('Resource Creation and Configuration Journey', async () => {
    // 1. Create resource with basic configuration
    const resource = new Resource({
      client,
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true',
        bio: 'string|optional',
        tags: 'array|items:string',
        region: 'string|optional',
        ageGroup: 'string|optional'
      },
      options: {
        timestamps: true,
        partitions: {
          byRegion: {
            fields: {
              region: 'string|maxlength:2'
            }
          },
          byAgeGroup: {
            fields: {
              ageGroup: 'string'
            }
          }
        }
      }
    });

    // 2. Verify resource structure
    expect(resource.name).toBe('users');
    expect(resource.attributes.name).toBe('string|required');
    expect(resource.attributes.email).toBe('email|required');
    expect(resource.options.timestamps).toBe(true);
    expect(resource.options.partitions).toBeDefined();
    expect(resource.options.partitions.byRegion).toBeDefined();
    expect(resource.options.partitions.byAgeGroup).toBeDefined();

    // 3. Verify schema was created
    expect(resource.schema).toBeDefined();
    expect(resource.schema.name).toBe('users');

    // 4. Verify hooks were set up
    expect(resource.hooks).toBeDefined();
    expect(resource.hooks.preInsert).toBeDefined();
    expect(resource.hooks.afterInsert).toBeDefined();
    expect(resource.hooks.preUpdate).toBeDefined();
    expect(resource.hooks.afterUpdate).toBeDefined();
    expect(resource.hooks.preDelete).toBeDefined();
    expect(resource.hooks.afterDelete).toBeDefined();

    // 5. Verify partition hooks were automatically added
    expect(resource.hooks.afterInsert).toHaveLength(1);
    expect(resource.hooks.afterDelete).toHaveLength(1);

    // 6. Test data validation
    const validData = {
      name: 'João Silva',
      email: 'joao@example.com',
      age: 30,
      bio: 'Desenvolvedor Full Stack',
      tags: ['javascript', 'node.js', 'react'],
      region: 'BR',
      ageGroup: 'adult'
    };

    const validationResult = await resource.validate(validData);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.data).toBeDefined();

    // 7. Test invalid data validation
    const invalidData = {
      name: 'João Silva',
      // Missing required email
      age: 'not a number', // Wrong type
      region: 'BR',
      ageGroup: 'adult'
    };

    const invalidValidationResult = await resource.validate(invalidData);
    expect(invalidValidationResult.isValid).toBe(false);
    expect(invalidValidationResult.errors).toBeDefined();
    expect(invalidValidationResult.errors.length).toBeGreaterThan(0);

    // 8. Test partition key generation
    const regionKey = resource.getPartitionKey({ partitionName: 'byRegion', id: 'test-id', data: validData });
    expect(regionKey).toContain('resource=users');
    expect(regionKey).toContain('partition=byRegion');
    expect(regionKey).toContain('region=BR');
    expect(regionKey).toContain('id=test-id');

    const ageGroupKey = resource.getPartitionKey({ partitionName: 'byAgeGroup', id: 'test-id', data: validData });
    expect(ageGroupKey).toContain('partition=byAgeGroup');
    expect(ageGroupKey).toContain('ageGroup=adult');

    // 9. Test definition hash generation
    const hash1 = resource.getDefinitionHash();
    const hash2 = resource.getDefinitionHash();
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);

    // 10. Test resource key generation
    const resourceKey = resource.getResourceKey('test-id');
    expect(resourceKey).toContain('resource=users');
    expect(resourceKey).toContain('v=1');
    expect(resourceKey).toContain('id=test-id');
  });

  test('Resource Attribute Updates Journey', async () => {
    const resource = new Resource({
      client,
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'number|required'
      }
    });

    // 1. Verify initial attributes
    expect(resource.attributes.name).toBe('string|required');
    expect(resource.attributes.price).toBe('number|required');
    expect(Object.keys(resource.attributes)).toHaveLength(2);

    // 2. Update attributes
    const newAttributes = {
      name: 'string|required',
      price: 'number|required',
      category: 'string|optional',
      description: 'string|optional',
      tags: 'array|items:string'
    };

    const updateResult = resource.updateAttributes(newAttributes);

    // 3. Verify old and new attributes
    expect(updateResult.oldAttributes).toEqual({
      name: 'string|required',
      price: 'number|required'
    });
    expect(updateResult.newAttributes).toEqual(newAttributes);

    // 4. Verify resource was updated
    expect(resource.attributes).toEqual(newAttributes);
    expect(Object.keys(resource.attributes)).toHaveLength(5);

    // 5. Verify schema was rebuilt
    expect(resource.schema.attributes).toEqual(newAttributes);

    // 6. Test validation with new attributes
    const validData = {
      name: 'Laptop',
      price: 999.99,
      category: 'electronics',
      description: 'High-performance laptop',
      tags: ['computer', 'portable']
    };

    const validationResult = await resource.validate(validData);
    expect(validationResult.isValid).toBe(true);
  });

  test('Resource with Timestamps Journey', async () => {
    const resource = new Resource({
      client,
      name: 'events',
      attributes: {
        title: 'string|required',
        description: 'string|optional'
      },
      options: {
        timestamps: true
      }
    });

    // 1. Verify timestamp attributes were added
    expect(resource.attributes.createdAt).toBe('string|optional');
    expect(resource.attributes.updatedAt).toBe('string|optional');

    // 2. Verify timestamp partitions were automatically created
    expect(resource.options.partitions.byCreatedDate).toBeDefined();
    expect(resource.options.partitions.byUpdatedDate).toBeDefined();
    expect(resource.options.partitions.byCreatedDate.fields.createdAt).toBe('date|maxlength:10');
    expect(resource.options.partitions.byUpdatedDate.fields.updatedAt).toBe('date|maxlength:10');

    // 3. Test data with timestamps
    const testData = {
      title: 'Test Event',
      description: 'Test Description'
    };

    // Simulate what happens during insert (timestamps are added)
    const dataWithTimestamps = {
      ...testData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const validationResult = await resource.validate(dataWithTimestamps);
    expect(validationResult.isValid).toBe(true);

    // 4. Test partition key generation with timestamps
    const createdDateKey = resource.getPartitionKey({ partitionName: 'byCreatedDate', id: 'test-id', data: dataWithTimestamps });
    expect(createdDateKey).toContain('createdAt=');
    expect(createdDateKey).toMatch(/createdAt=\d{4}-\d{2}-\d{2}/);

    const updatedDateKey = resource.getPartitionKey({ partitionName: 'byUpdatedDate', id: 'test-id', data: dataWithTimestamps });
    expect(updatedDateKey).toContain('updatedAt=');
    expect(updatedDateKey).toMatch(/updatedAt=\d{4}-\d{2}-\d{2}/);
  });

  test('Resource Hook Management Journey', async () => {
    const resource = new Resource({
      client,
      name: 'orders',
      attributes: {
        orderId: 'string|required',
        amount: 'number|required'
      }
    });

    const hookCalls = [];

    // 1. Add hooks
    resource.addHook('preInsert', (data) => {
      hookCalls.push('preInsert');
      data.processed = true;
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      hookCalls.push('afterInsert');
      data.notified = true;
      return data;
    });

    resource.addHook('preUpdate', (data) => {
      hookCalls.push('preUpdate');
      data.validated = true;
      return data;
    });

    // 2. Verify hooks were added
    expect(resource.hooks.preInsert).toHaveLength(1);
    expect(resource.hooks.afterInsert).toHaveLength(1);
    expect(resource.hooks.preUpdate).toHaveLength(1);

    // 3. Test hook execution
    const testData = { orderId: 'ORD-001', amount: 100.50 };

    const preInsertResult = await resource.executeHooks('preInsert', testData);
    expect(preInsertResult.processed).toBe(true);
    expect(hookCalls).toContain('preInsert');

    const afterInsertResult = await resource.executeHooks('afterInsert', { id: 'test-id', ...preInsertResult });
    expect(afterInsertResult.notified).toBe(true);
    expect(hookCalls).toContain('afterInsert');

    const preUpdateResult = await resource.executeHooks('preUpdate', { amount: 150.75 });
    expect(preUpdateResult.validated).toBe(true);
    expect(hookCalls).toContain('preUpdate');

    // 4. Verify execution order
    expect(hookCalls).toEqual(['preInsert', 'afterInsert', 'preUpdate']);
  });

  test('Resource Error Handling Journey', async () => {
    const resource = new Resource({
      client,
      name: 'test',
      attributes: {
        name: 'string|required',
        email: 'email|required'
      }
    });

    // 1. Test validation errors
    const invalidData = {
      name: 'Test User'
      // Missing required email
    };

    const validationResult = await resource.validate(invalidData);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errors).toBeDefined();
    expect(validationResult.errors.length).toBeGreaterThan(0);

    // 2. Test partition validation errors
    expect(() => {
      new Resource({
        client,
        name: 'invalid',
        attributes: {
          name: 'string|required'
        },
        options: {
          partitions: {
            invalidPartition: {
              fields: {
                nonExistentField: 'string'
              }
            }
          }
        }
      });
    }).toThrow(/Partition 'invalidPartition' uses field 'nonExistentField'/);

    // 3. Test invalid partition name
    expect(() => {
      resource.getPartitionKey({ partitionName: 'nonExistentPartition', id: 'id', data: {} });
    }).toThrow(/Partition 'nonExistentPartition' not found/);

    // 4. Test paranoid mode protection
    try {
      await resource.deleteAll({ paranoid: false }); // Should fail - paranoid mode enabled by default
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('paranoid');
    }

    // Test with paranoid mode disabled
    const nonParanoidResource = new Resource({
      client,
      name: 'non-paranoid-test',
      attributes: {
        name: 'string|required'
      },
      options: {
        paranoid: false
      }
    });

    // This should work
    await nonParanoidResource.deleteAll({ paranoid: false });

    // 5. Test content validation
    await expect(
      resource.setContent({ id: 'test-id', buffer: 'not a buffer', contentType: 'text/plain' })
    ).rejects.toThrow('Key [resource=test/v=1/id=test-id] does not exists');
  });

  test('Resource Configuration Options Journey', async () => {
    // 1. Test default options
    const defaultResource = new Resource({
      client,
      name: 'default',
      attributes: {
        name: 'string|required'
      }
    });

    expect(defaultResource.options.cache).toBe(false);
    expect(defaultResource.options.autoDecrypt).toBe(true);
    expect(defaultResource.options.timestamps).toBe(false);
    expect(defaultResource.options.partitions).toEqual({});
    expect(defaultResource.options.paranoid).toBe(true);

    // 2. Test custom options
    const customResource = new Resource({
      client,
      name: 'custom',
      attributes: {
        name: 'string|required'
      },
      options: {
        cache: true,
        autoDecrypt: false,
        timestamps: true,
        paranoid: false,
        partitions: {
          byName: {
            fields: {
              name: 'string|maxlength:10'
            }
          }
        }
      }
    });

    expect(customResource.options.cache).toBe(true);
    expect(customResource.options.autoDecrypt).toBe(false);
    expect(customResource.options.timestamps).toBe(true);
    expect(customResource.options.paranoid).toBe(false);
    expect(customResource.options.partitions.byName).toBeDefined();

    // 3. Test that timestamps automatically add partitions
    expect(customResource.options.partitions.byCreatedDate).toBeDefined();
    expect(customResource.options.partitions.byUpdatedDate).toBeDefined();
  });

  test('Resource Schema Integration Journey', async () => {
    const resource = new Resource({
      client,
      name: 'complex',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true',
        tags: 'array|items:string',
        metadata: 'object|optional'
      },
      passphrase: 'custom-secret',
      version: '2'
    });

    // 1. Verify schema integration
    expect(resource.schema.name).toBe('complex');
    expect(resource.schema.passphrase).toBe('custom-secret');
    expect(resource.schema.version).toBe('2');

    // 2. Test schema export
    const exportedSchema = resource.export();
    expect(exportedSchema.name).toBe('complex');
    expect(exportedSchema.attributes).toEqual(resource.attributes);

    // 3. Test data mapping and unmapping
    const testData = {
      name: 'Test User',
      email: 'test@example.com',
      age: 25,
      active: true,
      tags: ['tag1', 'tag2'],
      metadata: { key: 'value' }
    };

    const validationResult = await resource.validate(testData);
    expect(validationResult.isValid).toBe(true);

    // 4. Test schema validation
    const invalidData = {
      name: 'Test User',
      email: 'invalid-email',
      age: 'not a number',
      tags: 'not an array'
    };

    const invalidValidationResult = await resource.validate(invalidData);
    expect(invalidValidationResult.isValid).toBe(false);
    expect(invalidValidationResult.errors).toBeDefined();
  });

  test('Resource definition hash is stable and deterministic', () => {
    const def = {
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional'
      },
      options: {
        timestamps: true,
        partitions: {
          byEmail: {
            fields: { email: 'string' }
          }
        }
      }
    };
    const r1 = new Resource({ ...def, client });
    const r2 = new Resource({ ...def, client });
    expect(r1.getDefinitionHash()).toBe(r2.getDefinitionHash());

    // Mudando um atributo, o hash deve mudar
    const r3 = new Resource({
      ...def,
      attributes: { ...def.attributes, extra: 'string|optional' },
      client
    });
    expect(r3.getDefinitionHash()).not.toBe(r1.getDefinitionHash());
  });
}); 