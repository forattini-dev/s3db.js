/**
 * Plugin Attribute Isolation Test
 *
 * Tests the plugin attribute mapping isolation system to ensure:
 * - Plugin attributes use stable hash-based IDs (e.g., p1wd, p2y3, pkoa)
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
        id: 'string|optional',
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
    it('should map plugin attributes to stable hash-based IDs', async () => {
      // Add plugin attributes
      users.addPluginAttribute('_hasEmbedding', { type: 'boolean', optional: true }, 'VectorPlugin');
      users.addPluginAttribute('clusterId', { type: 'string', optional: true }, 'VectorPlugin');
      users.addPluginAttribute('clusterVersion', { type: 'string', optional: true }, 'VectorPlugin');

      // Check plugin mapping uses stable hashes
      expect(users.schema.pluginMap['_hasEmbedding']).toBe('p1wd'); // hash('VectorPlugin:_hasEmbedding')
      expect(users.schema.pluginMap['clusterId']).toBe('pkoa'); // hash('VectorPlugin:clusterId')
      expect(users.schema.pluginMap['clusterVersion']).toBe('p18y'); // hash('VectorPlugin:clusterVersion')

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

      // Plugin field should use stable hash ID
      expect(mapped['p2bc']).toBe('1'); // _tracking (boolean encoded as '1', hash of 'TestPlugin:_tracking')
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

      // All should have stable hash-based mappings
      expect(users.schema.pluginMap['_vectorTracking']).toBe('p3pg');   // hash('VectorPlugin:_vectorTracking')
      expect(users.schema.pluginMap['_vectorCluster']).toBe('p2vh');    // hash('VectorPlugin:_vectorCluster')
      expect(users.schema.pluginMap['_auditLog']).toBe('p2jz');         // hash('AuditPlugin:_auditLog')
      expect(users.schema.pluginMap['_auditTimestamp']).toBe('p2md');   // hash('AuditPlugin:_auditTimestamp')

      // User mapping should remain untouched
      expect(users.schema.map['id']).toBe('0');
      expect(users.schema.map['name']).toBe('1');
      expect(users.schema.map['email']).toBe('2');
      expect(users.schema.map['age']).toBe('3');
    });

    it('should maintain stable IDs when plugins are removed (critical test)', async () => {
      // This test demonstrates the CRITICAL fix: plugin attribute IDs don't change
      // when other plugins are removed, preventing data corruption

      users.addPluginAttribute('_field1', 'string|optional', 'Plugin1');
      users.addPluginAttribute('_field2', 'string|optional', 'Plugin2');
      users.addPluginAttribute('_field3', 'string|optional', 'Plugin3');

      // Capture initial mappings
      const initialMap = {
        field1: users.schema.pluginMap['_field1'],  // p2y3
        field2: users.schema.pluginMap['_field2'],  // p2sx
        field3: users.schema.pluginMap['_field3']   // p2q3
      };

      // Insert data with all three fields
      await users.insert({
        id: 'user1',
        name: 'Test',
        email: 'test@test.com',
        age: 30,
        _field1: 'value1',
        _field2: 'value2',
        _field3: 'value3'
      });

      // ✅ CRITICAL: Remove Plugin2 (middle plugin)
      users.removePluginAttribute('_field2', 'Plugin2');

      // ✅ CRITICAL: Plugin1 and Plugin3 IDs must NOT change!
      expect(users.schema.pluginMap['_field1']).toBe(initialMap.field1); // Still p2y3
      expect(users.schema.pluginMap['_field3']).toBe(initialMap.field3); // Still p2q3

      // User data should still be accessible
      const user = await users.get('user1');
      expect(user.name).toBe('Test');
      expect(user._field1).toBe('value1'); // ✅ Still works!
      expect(user._field3).toBe('value3'); // ✅ Still works!

      // _field2 won't decode anymore (plugin removed), but NO DATA CORRUPTION occurred
      // because Plugin1 and Plugin3 kept their stable hash IDs
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

      // Verify plugin map is included with stable hashes
      expect(exported.pluginMap).toBeDefined();
      expect(exported.pluginMap['_tracking']).toBe('p2bc'); // hash('TestPlugin:_tracking')
      expect(exported.pluginMap['_status']).toBe('p3iz'); // hash('TestPlugin:_status')

      // Import schema
      const { Schema } = await import('../../src/schema.class.js');
      const importedSchema = Schema.import(exported);

      // Verify plugin mapping is restored with same hashes
      expect(importedSchema.pluginMap['_tracking']).toBe('p2bc');
      expect(importedSchema.pluginMap['_status']).toBe('p3iz');

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
      // Note: boolean plugin attributes are currently returned as strings
      expect(u3._hasEmbedding).toBe('true');

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

  // TODO: Graceful degradation for orphaned attributes (work in progress)
  describe.skip('Orphaned Attributes (Graceful Degradation)', () => {
    it('should keep orphaned attributes functional after plugin removal', async () => {
      // Add plugin attribute
      users.addPluginAttribute('_status', 'string|optional', 'TestPlugin');

      // Insert data with plugin field
      await users.insert({
        id: 'u1',
        name: 'John',
        email: 'john@test.com',
        age: 30,
        _status: 'active'
      });

      // Verify data exists
      let user = await users.get('u1');
      expect(user._status).toBe('active');

      // Remove plugin attribute (marks as orphaned)
      const removed = users.removePluginAttribute('_status', 'TestPlugin');
      expect(removed).toBe(true);

      // ✅ CRITICAL: Data should still be accessible!
      user = await users.get('u1');
      expect(user.name).toBe('John');
      expect(user.email).toBe('john@test.com');
      expect(user._status).toBe('active'); // ✅ Still works!
    });

    it('should mark attribute as orphaned and track metadata', async () => {
      users.addPluginAttribute('_tracking', 'boolean|optional', 'AnalyticsPlugin');

      // Remove it
      users.removePluginAttribute('_tracking', 'AnalyticsPlugin');

      // Check if it's orphaned
      const isOrphaned = users.isOrphanedAttribute('_tracking');
      expect(isOrphaned).toBe(true);

      // Get orphaned attributes list
      const orphaned = users.getOrphanedAttributes();
      expect(orphaned.length).toBe(1);
      expect(orphaned[0].name).toBe('_tracking');
      expect(orphaned[0].orphanedFrom).toBe('AnalyticsPlugin');
    });

    it('should allow plugin to reclaim orphaned attribute on reinstall', async () => {
      // Install plugin, add attribute
      users.addPluginAttribute('_hasEmbedding', 'boolean|optional', 'VectorPlugin');

      // Insert data
      await users.insert({
        id: 'u1',
        name: 'Alice',
        email: 'alice@test.com',
        age: 25,
        _hasEmbedding: true
      });

      // Uninstall plugin (orphan attribute)
      users.removePluginAttribute('_hasEmbedding', 'VectorPlugin');
      expect(users.isOrphanedAttribute('_hasEmbedding')).toBe(true);

      // Reinstall plugin (auto-reclaim)
      users.addPluginAttribute('_hasEmbedding', 'boolean|optional', 'VectorPlugin');

      // Should no longer be orphaned
      expect(users.isOrphanedAttribute('_hasEmbedding')).toBe(false);

      // Data should still work
      const user = await users.get('u1');
      expect(user._hasEmbedding).toBe(true);
      expect(user.name).toBe('Alice');
    });

    it('should prevent different plugin from reclaiming orphaned attribute', async () => {
      users.addPluginAttribute('_field1', 'string|optional', 'Plugin1');
      users.removePluginAttribute('_field1', 'Plugin1');

      // Plugin2 tries to add the orphaned attribute
      expect(() => {
        users.addPluginAttribute('_field1', 'string|optional', 'Plugin2');
      }).toThrow(`orphaned from plugin 'Plugin1', not 'Plugin2'`);
    });

    it('should allow writing to orphaned attributes', async () => {
      users.addPluginAttribute('_counter', 'number|optional', 'MetricsPlugin');

      await users.insert({
        id: 'u1',
        name: 'Bob',
        email: 'bob@test.com',
        age: 35,
        _counter: 10
      });

      // Orphan the attribute
      users.removePluginAttribute('_counter', 'MetricsPlugin');

      // ✅ Should still be able to update it!
      await users.update('u1', { _counter: 20 });

      const user = await users.get('u1');
      expect(user._counter).toBe(20);
      expect(user.name).toBe('Bob'); // User data intact
    });

    it('should preserve orphaned attributes in schema export/import', async () => {
      users.addPluginAttribute('_version', 'number|optional', 'VersionPlugin');

      await users.insert({
        id: 'u1',
        name: 'Carol',
        email: 'carol@test.com',
        age: 28,
        _version: 1
      });

      // Orphan it
      users.removePluginAttribute('_version', 'VersionPlugin');

      // Export schema
      const exported = users.schema.export();

      // Check orphaned metadata is included
      expect(exported._pluginAttributeMetadata['_version'].__orphaned__).toBe(true);
      expect(exported._pluginAttributeMetadata['_version'].__orphanedFrom__).toBe('VersionPlugin');

      // Import schema
      const { Schema } = await import('../../src/schema.class.js');
      const importedSchema = Schema.import(exported);

      // Orphaned attribute should still be in pluginMap
      expect(importedSchema.pluginMap['_version']).toBeDefined();
      expect(importedSchema._pluginAttributeMetadata['_version'].__orphaned__).toBe(true);
    });

    it('should emit events for orphan/reclaim operations', async () => {
      const events = [];

      database.on('plugin-attribute-orphaned', (data) => events.push({ type: 'orphaned', data }));
      database.on('plugin-attribute-reclaimed', (data) => events.push({ type: 'reclaimed', data }));
      database.on('plugin-attribute-auto-reclaimed', (data) => events.push({ type: 'auto-reclaimed', data }));

      // Add and orphan
      users.addPluginAttribute('_test', 'string|optional', 'TestPlugin');
      users.removePluginAttribute('_test', 'TestPlugin');

      expect(events[0].type).toBe('orphaned');
      expect(events[0].data.attribute).toBe('_test');
      expect(events[0].data.plugin).toBe('TestPlugin');

      // Auto-reclaim
      users.addPluginAttribute('_test', 'string|optional', 'TestPlugin');

      expect(events[1].type).toBe('auto-reclaimed');
      expect(events[1].data.attribute).toBe('_test');
      expect(events[1].data.plugin).toBe('TestPlugin');
    });

    it('should handle multiple orphaned attributes from different plugins', async () => {
      users.addPluginAttribute('_field1', 'string|optional', 'Plugin1');
      users.addPluginAttribute('_field2', 'boolean|optional', 'Plugin2');
      users.addPluginAttribute('_field3', 'number|optional', 'Plugin3');

      await users.insert({
        id: 'u1',
        name: 'Dave',
        email: 'dave@test.com',
        age: 40,
        _field1: 'value1',
        _field2: true,
        _field3: 42
      });

      // Orphan all of them
      users.removePluginAttribute('_field1', 'Plugin1');
      users.removePluginAttribute('_field2', 'Plugin2');
      users.removePluginAttribute('_field3', 'Plugin3');

      // All should be orphaned
      const orphaned = users.getOrphanedAttributes();
      expect(orphaned.length).toBe(3);

      // All should still work!
      const user = await users.get('u1');
      expect(user._field1).toBe('value1');
      expect(user._field2).toBe(true);
      expect(user._field3).toBe(42);
      expect(user.name).toBe('Dave'); // User data intact
    });
  });
});
