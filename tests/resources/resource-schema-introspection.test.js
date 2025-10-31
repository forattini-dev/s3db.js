/**
 * Resource $schema Property Tests
 *
 * Tests for the resource.$schema property that stores the literal
 * configuration object passed to createResource().
 *
 * This property is essential for:
 * - Plugin introspection
 * - Documentation generation
 * - Migration detection
 * - API schema generation
 */

import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

describe('Resource $schema Property', () => {
  let database;

  beforeAll(async () => {
    database = createDatabaseForTest('suite=resources/schema-introspection');
    await database.connect();
  });

  afterAll(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Basic $schema Access', () => {
    test('should expose $schema property with resource configuration', async () => {
      const resource = await database.createResource({
        name: 'test_schema_basic',
        version: '1',
        attributes: {
          name: 'string|required',
          email: 'string|email',
          age: 'number|min:0'
        },
        behavior: 'body-overflow',
        timestamps: true,
        paranoid: false
      });

      expect(resource.$schema).toBeDefined();
      expect(resource.$schema.name).toBe('test_schema_basic');
      expect(resource.$schema.version).toBe('1');
      expect(resource.$schema.behavior).toBe('body-overflow');
      expect(resource.$schema.timestamps).toBe(true);
      expect(resource.$schema.paranoid).toBe(false);
    });

    test('should include all attributes in $schema', async () => {
      const attributes = {
        username: 'string|required|minlength:3',
        password: 'secret|required',
        profile: {
          bio: 'string|max:500',
          avatar: 'url'
        }
      };

      const resource = await database.createResource({
        name: 'test_schema_attributes',
        attributes
      });

      expect(resource.$schema.attributes).toEqual(attributes);
      expect(resource.$schema.attributes.username).toBe('string|required|minlength:3');
      expect(resource.$schema.attributes.password).toBe('secret|required');
      expect(resource.$schema.attributes.profile).toEqual({
        bio: 'string|max:500',
        avatar: 'url'
      });
    });

    test('should include partitions in $schema', async () => {
      const partitions = {
        byRegion: { fields: { region: 'string' } },
        byStatus: { fields: { status: 'string' } },
        byDate: { fields: { createdDate: 'string' } }
      };

      const resource = await database.createResource({
        name: 'test_schema_partitions',
        attributes: {
          region: 'string',
          status: 'string',
          createdDate: 'string'
        },
        partitions
      });

      expect(resource.$schema.partitions).toEqual(partitions);
      expect(Object.keys(resource.$schema.partitions)).toHaveLength(3);
      expect(resource.$schema.partitions.byRegion).toEqual({ fields: { region: 'string' } });
    });

    test('should include guard functions in $schema', async () => {
      const guard = {
        insert: async (data) => data.role !== 'admin',
        update: async (id, data) => true,
        delete: async (id) => false
      };

      const resource = await database.createResource({
        name: 'test_schema_guard',
        attributes: { role: 'string' },
        guard
      });

      expect(resource.$schema.guard).toBeDefined();
      expect(resource.$schema.guard.insert).toBe(guard.insert);
      expect(resource.$schema.guard.update).toBe(guard.update);
      expect(resource.$schema.guard.delete).toBe(guard.delete);
    });

    test('should include metadata timestamps in $schema', async () => {
      const resource = await database.createResource({
        name: 'test_schema_metadata',
        attributes: { name: 'string' }
      });

      expect(resource.$schema._createdAt).toBeDefined();
      expect(resource.$schema._updatedAt).toBeDefined();
      expect(typeof resource.$schema._createdAt).toBe('number');
      expect(typeof resource.$schema._updatedAt).toBe('number');
      expect(resource.$schema._createdAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('$schema Immutability', () => {
    test('should deep clone configuration to prevent mutations', async () => {
      const originalAttributes = {
        name: 'string',
        nested: {
          field: 'string'
        }
      };

      const resource = await database.createResource({
        name: 'test_schema_immutable',
        attributes: originalAttributes
      });

      // Mutate original
      originalAttributes.name = 'number';
      originalAttributes.nested.field = 'number';
      originalAttributes.newField = 'boolean';

      // $schema should not be affected
      expect(resource.$schema.attributes.name).toBe('string');
      expect(resource.$schema.attributes.nested.field).toBe('string');
      expect(resource.$schema.attributes.newField).toBeUndefined();
    });

    test('should deep clone partitions to prevent mutations', async () => {
      const originalPartitions = {
        byRegion: { fields: { region: 'string' } }
      };

      const resource = await database.createResource({
        name: 'test_schema_partitions_immutable',
        attributes: { region: 'string' },
        partitions: originalPartitions
      });

      // Mutate original
      originalPartitions.byRegion.fields.region = 'number';
      originalPartitions.byCountry = { fields: { country: 'string' } };

      // $schema should not be affected
      expect(resource.$schema.partitions.byRegion.fields.region).toBe('string');
      expect(resource.$schema.partitions.byCountry).toBeUndefined();
    });
  });

  describe('$schema Default Values', () => {
    test('should use default values when options not provided', async () => {
      const resource = await database.createResource({
        name: 'test_schema_defaults',
        attributes: { name: 'string' }
      });

      expect(resource.$schema.version).toBe('1');
      expect(resource.$schema.behavior).toBe('body-overflow');
      expect(resource.$schema.timestamps).toBe(false);
      expect(resource.$schema.paranoid).toBe(true);
      expect(resource.$schema.partitions).toEqual({});
      expect(resource.$schema.createdBy).toBe('user');
    });

    test('should have undefined guard when not provided', async () => {
      const resource = await database.createResource({
        name: 'test_schema_no_guard',
        attributes: { name: 'string' }
      });

      expect(resource.$schema.guard).toBeUndefined();
    });

    test('should have empty partitions when not provided', async () => {
      const resource = await database.createResource({
        name: 'test_schema_no_partitions',
        attributes: { name: 'string' }
      });

      expect(resource.$schema.partitions).toEqual({});
    });
  });

  describe('$schema Plugin Integration', () => {
    test('should track createdBy field for plugin detection', async () => {
      const userResource = await database.createResource({
        name: 'test_schema_user_created',
        attributes: { name: 'string' },
        createdBy: 'user'
      });

      const pluginResource = await database.createResource({
        name: 'test_schema_plugin_created',
        attributes: { name: 'string' },
        createdBy: 'CachePlugin'
      });

      expect(userResource.$schema.createdBy).toBe('user');
      expect(pluginResource.$schema.createdBy).toBe('CachePlugin');
    });

    test('should include idGenerator configuration', async () => {
      const resource = await database.createResource({
        name: 'test_schema_id_config',
        attributes: { name: 'string' },
        idGenerator: 'nanoid',
        idSize: 16
      });

      expect(resource.$schema.idGenerator).toBe('nanoid');
      expect(resource.$schema.idSize).toBe(16);
    });

    test('should include async options', async () => {
      const resource = await database.createResource({
        name: 'test_schema_async',
        attributes: { name: 'string' },
        asyncPartitions: true,
        strictPartitions: false
      });

      expect(resource.$schema.asyncPartitions).toBe(true);
      expect(resource.$schema.strictPartitions).toBe(false);
    });
  });

  describe('$schema vs resource.schema Distinction', () => {
    test('should have both $schema (config) and schema (Schema instance)', async () => {
      const resource = await database.createResource({
        name: 'test_schema_distinction',
        attributes: {
          name: 'string|required',
          email: 'string|email'
        }
      });

      // $schema is the raw configuration
      expect(resource.$schema).toBeDefined();
      expect(resource.$schema.attributes).toEqual({
        name: 'string|required',
        email: 'string|email'
      });

      // schema is the Schema class instance
      expect(resource.schema).toBeDefined();
      expect(resource.schema.constructor.name).toBe('Schema');
      expect(resource.schema.fields).toBeDefined(); // Schema instance has different structure
    });

    test('$schema should be plain object, schema should be class instance', async () => {
      const resource = await database.createResource({
        name: 'test_schema_types',
        attributes: { name: 'string' }
      });

      expect(typeof resource.$schema).toBe('object');
      expect(resource.$schema.constructor.name).toBe('Object');

      expect(typeof resource.schema).toBe('object');
      expect(resource.schema.constructor.name).toBe('Schema');
    });
  });

  describe('$schema Use Cases', () => {
    test('should enable plugin introspection', async () => {
      const resource = await database.createResource({
        name: 'test_schema_introspection',
        attributes: {
          name: 'string|required',
          email: 'string|email',
          age: 'number'
        },
        partitions: {
          byAge: { fields: { age: 'number' } }
        },
        timestamps: true
      });

      // Plugin can analyze resource structure
      const analysis = {
        name: resource.$schema.name,
        totalAttributes: Object.keys(resource.$schema.attributes).length,
        hasPartitions: Object.keys(resource.$schema.partitions).length > 0,
        hasTimestamps: resource.$schema.timestamps,
        partitionCount: Object.keys(resource.$schema.partitions).length
      };

      expect(analysis.name).toBe('test_schema_introspection');
      expect(analysis.totalAttributes).toBe(3);
      expect(analysis.hasPartitions).toBe(true);
      expect(analysis.hasTimestamps).toBe(true);
      expect(analysis.partitionCount).toBe(1);
    });

    test('should enable schema comparison for migrations', async () => {
      const v1 = await database.createResource({
        name: 'test_schema_v1',
        version: '1',
        attributes: {
          name: 'string',
          email: 'string'
        }
      });

      const v2 = await database.createResource({
        name: 'test_schema_v2',
        version: '2',
        attributes: {
          name: 'string',
          email: 'string',
          status: 'string' // New field
        }
      });

      const v1Fields = Object.keys(v1.$schema.attributes);
      const v2Fields = Object.keys(v2.$schema.attributes);
      const addedFields = v2Fields.filter(f => !v1Fields.includes(f));

      expect(addedFields).toEqual(['status']);
    });

    test('should enable documentation generation', async () => {
      const resource = await database.createResource({
        name: 'test_schema_docs',
        version: '1',
        attributes: {
          username: 'string|required|minlength:3',
          email: 'string|required|email',
          role: 'string|enum:admin,user,guest'
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: {
          byRole: { fields: { role: 'string' } }
        }
      });

      // Generate simple documentation
      const docs = {
        resource: resource.$schema.name,
        version: resource.$schema.version,
        behavior: resource.$schema.behavior,
        fields: Object.keys(resource.$schema.attributes),
        partitions: Object.keys(resource.$schema.partitions),
        hasTimestamps: resource.$schema.timestamps
      };

      expect(docs).toEqual({
        resource: 'test_schema_docs',
        version: '1',
        behavior: 'body-overflow',
        fields: ['username', 'email', 'role'],
        partitions: ['byRole'],
        hasTimestamps: true
      });
    });
  });
});
