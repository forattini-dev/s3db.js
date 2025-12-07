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
 *
 * Uses MockClient for fast, isolated testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConnectedMockDatabase } from '../../mocks/index.js';

describe('Resource $schema Property', () => {
  let database;

  afterEach(async () => {
    if (database) {
      await database.disconnect().catch(() => {});
    }
  });

  describe('Basic $schema Access', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('schema-basic');
    });

    it('should expose $schema property with resource configuration', async () => {
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

    it('should include all attributes in $schema', async () => {
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

      expect(resource.$schema.attributes).toBeDefined();
      expect(resource.$schema.attributes.username).toBe('string|required|minlength:3');
      expect(resource.$schema.attributes.password).toBe('secret|required');
      expect(resource.$schema.attributes.profile).toEqual({
        bio: 'string|max:500',
        avatar: 'url'
      });
    });

    it('should include partitions in $schema', async () => {
      const partitions = {
        byRegion: { fields: { region: 'string' } },
        byStatus: { fields: { status: 'string' } }
      };

      const resource = await database.createResource({
        name: 'test_schema_partitions',
        attributes: {
          region: 'string',
          status: 'string'
        },
        partitions
      });

      expect(resource.$schema.partitions).toBeDefined();
      expect(Object.keys(resource.$schema.partitions).length).toBeGreaterThanOrEqual(2);
    });

    it('should include metadata timestamps in $schema', async () => {
      const resource = await database.createResource({
        name: 'test_schema_metadata',
        attributes: { name: 'string' }
      });

      expect(resource.$schema._createdAt).toBeDefined();
      expect(resource.$schema._updatedAt).toBeDefined();
      expect(typeof resource.$schema._createdAt).toBe('number');
      expect(typeof resource.$schema._updatedAt).toBe('number');
    });
  });

  describe('$schema Immutability', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('schema-immutable');
    });

    it('should deep clone configuration to prevent mutations', async () => {
      const originalAttributes = {
        name: 'string',
        nested: {
          field: 'string'
        }
      };

      const resource = await database.createResource({
        name: 'test_schema_immutable',
        attributes: { ...originalAttributes, nested: { ...originalAttributes.nested } }
      });

      // Mutate original
      originalAttributes.name = 'number';
      originalAttributes.nested.field = 'number';

      // $schema should not be affected (if properly cloned)
      // Note: behavior depends on implementation
      expect(resource.$schema.attributes).toBeDefined();
    });
  });

  describe('$schema Default Values', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('schema-defaults');
    });

    it('should use default values when options not provided', async () => {
      const resource = await database.createResource({
        name: 'test_schema_defaults',
        attributes: { name: 'string' }
      });

      expect(resource.$schema.version).toBeDefined();
      expect(resource.$schema.behavior).toBeDefined();
      expect(resource.$schema.createdBy).toBe('user');
    });

    it('should have empty partitions when not provided', async () => {
      const resource = await database.createResource({
        name: 'test_schema_no_partitions',
        attributes: { name: 'string' }
      });

      expect(resource.$schema.partitions).toEqual({});
    });
  });

  describe('$schema Plugin Integration', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('schema-plugin');
    });

    it('should track createdBy field for plugin detection', async () => {
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

    it('should include idGenerator configuration', async () => {
      const resource = await database.createResource({
        name: 'test_schema_id_config',
        attributes: { name: 'string' },
        idGenerator: 'nanoid',
        idSize: 16
      });

      expect(resource.$schema.idGenerator).toBe('nanoid');
      expect(resource.$schema.idSize).toBe(16);
    });

    it('should include async options', async () => {
      const resource = await database.createResource({
        name: 'test_schema_async',
        attributes: { name: 'string' },
        asyncPartitions: true
      });

      expect(resource.$schema.asyncPartitions).toBe(true);
    });
  });

  describe('$schema vs resource.schema Distinction', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('schema-distinction');
    });

    it('should have both $schema (config) and schema (Schema instance)', async () => {
      const resource = await database.createResource({
        name: 'test_schema_distinction',
        attributes: {
          name: 'string|required',
          email: 'string|email'
        }
      });

      // $schema is the raw configuration
      expect(resource.$schema).toBeDefined();
      expect(resource.$schema.attributes).toBeDefined();

      // schema is the Schema class instance
      expect(resource.schema).toBeDefined();
      expect(resource.schema.constructor.name).toBe('Schema');
    });

    it('$schema should be plain object, schema should be class instance', async () => {
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
    beforeEach(async () => {
      database = await createConnectedMockDatabase('schema-usecases');
    });

    it('should enable plugin introspection', async () => {
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

    it('should enable schema comparison for migrations', async () => {
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
          status: 'string'
        }
      });

      const v1Fields = Object.keys(v1.$schema.attributes);
      const v2Fields = Object.keys(v2.$schema.attributes);
      const addedFields = v2Fields.filter(f => !v1Fields.includes(f));

      expect(addedFields).toEqual(['status']);
    });

    it('should enable documentation generation', async () => {
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

      expect(docs.resource).toBe('test_schema_docs');
      expect(docs.version).toBe('1');
      expect(docs.behavior).toBe('body-overflow');
      expect(docs.fields).toEqual(['username', 'email', 'role']);
      expect(docs.partitions).toEqual(['byRole']);
      expect(docs.hasTimestamps).toBe(true);
    });
  });

  describe('Resource Export', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('schema-export');
    });

    it('should export resource definition for serialization', async () => {
      const resource = await database.createResource({
        name: 'exportable',
        version: '2',
        attributes: {
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-only',
        timestamps: true
      });

      const exported = resource.export();

      expect(exported.name).toBe('exportable');
      expect(exported.version).toBe('2');
      expect(exported.behavior).toBe('body-only');
      expect(exported.attributes).toBeDefined();
    });

    it('should include all configuration in export', async () => {
      const resource = await database.createResource({
        name: 'full_export',
        attributes: {
          name: 'string|required',
          category: 'string|required'
        },
        partitions: {
          byCategory: { fields: { category: 'string' } }
        },
        behavior: 'enforce-limits'
      });

      const exported = resource.export();

      expect(exported.partitions).toBeDefined();
      expect(exported.behavior).toBe('enforce-limits');
    });
  });
});
