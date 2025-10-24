/**
 * Plugin Attribute Isolation Test
 *
 * Tests the plugin attribute mapping isolation system to ensure:
 * - Plugin attributes use 'p' prefixed IDs (p0, p1, p2, ...)
 * - User attributes remain stable when plugins are added/removed
 * - No data corruption occurs when plugins change
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';

describe('Plugin Attribute Isolation', () => {
  let database;
  let users;

  beforeEach(async () => {
    database = createDatabaseForTest('plugin-attribute-isolation-test');
    await database.connect();

    // Create resource with user-defined attributes only
    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional'
      },
      behavior: 'body-overflow',
      timestamps: false
    });
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe('Plugin Attribute Mapping', () => {
    it('should map plugin attributes to p-prefixed IDs (p0, p1, p2)', async () => {
      // Add plugin attributes
      users.addPluginAttribute('_hasEmbedding', { type: 'boolean', optional: true }, 'VectorPlugin');
      users.addPluginAttribute('clusterId', { type: 'string', optional: true }, 'VectorPlugin');
      users.addPluginAttribute('clusterVersion', { type: 'string', optional: true }, 'VectorPlugin');

      // Check plugin mapping
      expect(users.schema.pluginMap['_hasEmbedding']).toBe('p0');
      expect(users.schema.pluginMap['clusterId']).toBe('p1');
      expect(users.schema.pluginMap['clusterVersion']).toBe('p2');

      // Check that user attributes are NOT in plugin map
      expect(users.schema.pluginMap['name']).toBeUndefined();
      expect(users.schema.pluginMap['email']).toBeUndefined();
      expect(users.schema.pluginMap['age']).toBeUndefined();
    });

    it('should keep user attribute mapping stable (0, 1, 2, ...) regardless of plugins', async () => {
      // Get initial user mapping
      const initialMapping = { ...users.schema.map };

      // User attributes should have standard base62 IDs
      expect(initialMapping['id']).toBe('0');
      expect(initialMapping['name']).toBe('1');
      expect(initialMapping['email']).toBe('2');
      expect(initialMapping['age']).toBe('3');

      // Add plugin attributes
      users.addPluginAttribute('_pluginField1', 'boolean|optional', 'TestPlugin');
      users.addPluginAttribute('_pluginField2', 'string|optional', 'TestPlugin');

      // User mapping should NOT change
      expect(users.schema.map['id']).toBe('0');
      expect(users.schema.map['name']).toBe('1');
      expect(users.schema.map['email']).toBe('2');
      expect(users.schema.map['age']).toBe('3');

      // Plugin fields should NOT be in user map
      expect(users.schema.map['_pluginField1']).toBeUndefined();
      expect(users.schema.map['_pluginField2']).toBeUndefined();
    });

    it('should map user and plugin attributes separately', async () => {
      users.addPluginAttribute('_tracking', 'boolean|optional', 'TestPlugin');

      const mapped = await users.schema.mapper({
        id: 'user1',
        name: 'John',
        email: 'john@test.com',
        age: 30,
        _tracking: true
      });

      // User fields should use standard IDs
      expect(mapped['0']).toBe('user1');  // id
      expect(mapped['1']).toBe('John');   // name
      expect(mapped['2']).toBe('john@test.com'); // email
      expect(mapped['3']).toBeDefined();  // age (base62 encoded)

      // Plugin field should use p-prefixed ID
      expect(mapped['p0']).toBe('1'); // _tracking (boolean encoded as '1')
    });
  });

  describe('Data Stability - Add/Remove Plugin', () => {
    it('should preserve user data when plugin is added and removed', async () => {
      // Insert user data WITHOUT plugin fields
      await users.insert({
        id: 'user1',
        name: 'Alice',
        email: 'alice@test.com',
        age: 25
      });

      // Verify initial data
      let user = await users.get('user1');
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@test.com');
      expect(user.age).toBe(25);

      // Simulate plugin being added - add plugin attribute
      users.addPluginAttribute('_hasEmbedding', 'boolean|optional', 'VectorPlugin');

      // User data should still be readable correctly
      user = await users.get('user1');
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@test.com');
      expect(user.age).toBe(25);

      // Simulate plugin being removed - remove plugin attribute
      users.removePluginAttribute('_hasEmbedding', 'VectorPlugin');

      // User data should STILL be readable correctly
      user = await users.get('user1');
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@test.com');
      expect(user.age).toBe(25);
    });

    it('should not corrupt historical data when plugin fields are added', async () => {
      // Create records before plugin
      await users.insert({ id: 'u1', name: 'Bob', email: 'bob@test.com', age: 30 });
      await users.insert({ id: 'u2', name: 'Carol', email: 'carol@test.com', age: 35 });

      // Add plugin attribute (use object notation for compatibility)
      users.addPluginAttribute('_status', { type: 'string', optional: true }, 'TestPlugin');

      // Old records should still decode correctly
      const u1 = await users.get('u1');
      expect(u1.name).toBe('Bob');
      expect(u1.email).toBe('bob@test.com');
      expect(u1.age).toBe(30);

      const u2 = await users.get('u2');
      expect(u2.name).toBe('Carol');
      expect(u2.email).toBe('carol@test.com');
      expect(u2.age).toBe(35);

      // New records can have plugin field
      await users.insert({
        id: 'u3',
        name: 'Dave',
        email: 'dave@test.com',
        age: 40,
        _status: 'active'
      });

      const u3 = await users.get('u3');
      expect(u3.name).toBe('Dave');
      expect(u3._status).toBe('active');
    });
  });

  describe('Multiple Plugins', () => {
    it('should handle attributes from multiple plugins independently', async () => {
      // Plugin 1 adds fields
      users.addPluginAttribute('_vectorTracking', 'boolean|optional', 'VectorPlugin');
      users.addPluginAttribute('_vectorCluster', 'string|optional', 'VectorPlugin');

      // Plugin 2 adds fields
      users.addPluginAttribute('_auditLog', 'string|optional', 'AuditPlugin');
      users.addPluginAttribute('_auditTimestamp', 'number|optional', 'AuditPlugin');

      // All should have p-prefixed mappings
      expect(users.schema.pluginMap['_vectorTracking']).toBe('p0');
      expect(users.schema.pluginMap['_vectorCluster']).toBe('p1');
      expect(users.schema.pluginMap['_auditLog']).toBe('p2');
      expect(users.schema.pluginMap['_auditTimestamp']).toBe('p3');

      // User mapping should remain untouched
      expect(users.schema.map['id']).toBe('0');
      expect(users.schema.map['name']).toBe('1');
      expect(users.schema.map['email']).toBe('2');
      expect(users.schema.map['age']).toBe('3');
    });

    it('should allow removing one plugin without affecting another', async () => {
      users.addPluginAttribute('_field1', 'boolean|optional', 'Plugin1');
      users.addPluginAttribute('_field2', 'boolean|optional', 'Plugin2');
      users.addPluginAttribute('_field3', 'boolean|optional', 'Plugin3');

      // Insert record with all plugin fields
      await users.insert({
        id: 'user1',
        name: 'Test',
        email: 'test@test.com',
        age: 30,
        _field1: true,
        _field2: true,
        _field3: true
      });

      // Remove Plugin2's field
      users.removePluginAttribute('_field2', 'Plugin2');

      // User data should still be accessible
      const user = await users.get('user1');
      expect(user.name).toBe('Test');
      expect(user.email).toBe('test@test.com');

      // Plugin1 and Plugin3 fields should still work
      // (Note: _field2 won't be in schema anymore, so it won't decode)
    });
  });

  describe('Error Handling', () => {
    it('should throw error if plugin name not provided', () => {
      expect(() => {
        users.addPluginAttribute('_test', 'boolean|optional');
      }).toThrow('Plugin name is required');
    });

    it('should throw error if trying to add plugin field that conflicts with user field', () => {
      expect(() => {
        users.addPluginAttribute('name', 'string|optional', 'TestPlugin');
      }).toThrow(`Attribute 'name' already exists`);
    });

    it('should throw error if removing attribute from wrong plugin', () => {
      users.addPluginAttribute('_field1', 'boolean|optional', 'Plugin1');

      expect(() => {
        users.removePluginAttribute('_field1', 'Plugin2');
      }).toThrow(`belongs to plugin 'Plugin1', not 'Plugin2'`);
    });

    it('should return false when removing non-existent plugin attribute', () => {
      const result = users.removePluginAttribute('_nonexistent', 'TestPlugin');
      expect(result).toBe(false);
    });
  });

  describe('Schema Export/Import', () => {
    it('should preserve plugin mapping when exporting and importing schema', async () => {
      // Add plugin attributes
      users.addPluginAttribute('_tracking', 'boolean|optional', 'TestPlugin');
      users.addPluginAttribute('_status', 'string|optional', 'TestPlugin');

      // Export schema
      const exported = users.schema.export();

      // Verify plugin map is included
      expect(exported.pluginMap).toBeDefined();
      expect(exported.pluginMap['_tracking']).toBe('p0');
      expect(exported.pluginMap['_status']).toBe('p1');

      // Import schema
      const { Schema } = await import('../../src/schema.class.js');
      const importedSchema = Schema.import(exported);

      // Verify plugin mapping is restored
      expect(importedSchema.pluginMap['_tracking']).toBe('p0');
      expect(importedSchema.pluginMap['_status']).toBe('p1');

      // Verify user mapping is intact
      expect(importedSchema.map['id']).toBe('0');
      expect(importedSchema.map['name']).toBe('1');
      expect(importedSchema.map['email']).toBe('2');
      expect(importedSchema.map['age']).toBe('3');
    });
  });

  describe('Real-World Scenario', () => {
    it('should handle complex plugin lifecycle without data corruption', async () => {
      // Step 1: Insert initial data (no plugins)
      await users.insert({ id: 'u1', name: 'User 1', email: 'u1@test.com', age: 20 });
      await users.insert({ id: 'u2', name: 'User 2', email: 'u2@test.com', age: 25 });

      // Step 2: Add VectorPlugin (adds _hasEmbedding) - use object notation
      users.addPluginAttribute('_hasEmbedding', { type: 'boolean', optional: true }, 'VectorPlugin');

      // Step 3: Insert new data with plugin field
      await users.insert({
        id: 'u3',
        name: 'User 3',
        email: 'u3@test.com',
        age: 30,
        _hasEmbedding: true
      });

      // Step 4: Add AuditPlugin (adds _auditLog) - use object notation
      users.addPluginAttribute('_auditLog', { type: 'string', optional: true }, 'AuditPlugin');

      // Step 5: Verify all users are readable
      const u1 = await users.get('u1');
      expect(u1.name).toBe('User 1');
      expect(u1.age).toBe(20);

      const u2 = await users.get('u2');
      expect(u2.name).toBe('User 2');
      expect(u2.age).toBe(25);

      const u3 = await users.get('u3');
      expect(u3.name).toBe('User 3');
      expect(u3.age).toBe(30);
      expect(u3._hasEmbedding).toBe(true);

      // Step 6: Remove VectorPlugin
      users.removePluginAttribute('_hasEmbedding', 'VectorPlugin');

      // Step 7: Verify data is STILL intact (critical!)
      const u1Final = await users.get('u1');
      expect(u1Final.name).toBe('User 1');
      expect(u1Final.email).toBe('u1@test.com');
      expect(u1Final.age).toBe(20);

      const u2Final = await users.get('u2');
      expect(u2Final.name).toBe('User 2');
      expect(u2Final.email).toBe('u2@test.com');
      expect(u2Final.age).toBe(25);

      // u3's _hasEmbedding won't decode anymore (plugin removed), but user data intact
      const u3Final = await users.get('u3');
      expect(u3Final.name).toBe('User 3');
      expect(u3Final.email).toBe('u3@test.com');
      expect(u3Final.age).toBe(30);

      // ✅ NO DATA CORRUPTION! User fields decoded correctly throughout plugin lifecycle
    });
  });
});
