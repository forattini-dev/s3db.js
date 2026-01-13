import { describe, it, expect, beforeEach } from 'vitest';
import { Schema, type SchemaRegistry, type PluginSchemaRegistry } from '../../../src/schema.class.js';

describe('Schema Registry', () => {
  describe('generateMappingFromRegistry', () => {
    it('should preserve existing indices for attributes', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { name: 0, email: 1, status: 2 },
        burned: []
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string',
          status: 'string'
        },
        schemaRegistry: existingRegistry
      });

      expect(schema.map['name']).toBe('0');
      expect(schema.map['email']).toBe('1');
      expect(schema.map['status']).toBe('2');
    });

    it('should work without existing registry (creates new one)', () => {
      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string'
        }
      });

      expect(schema.map['name']).toBeDefined();
      expect(schema.map['email']).toBeDefined();
    });

    it('should assign new indices for new attributes without changing existing ones', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 2,
        mapping: { name: 0, email: 1 },
        burned: []
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          age: 'number',
          email: 'string'
        },
        schemaRegistry: existingRegistry
      });

      expect(schema.map['name']).toBe('0');
      expect(schema.map['email']).toBe('1');
      expect(schema.map['age']).toBe('2');
      expect(schema._registryChanged).toBe(true);

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['name']).toBe(0);
      expect(updatedRegistry?.mapping['email']).toBe(1);
      expect(updatedRegistry?.mapping['age']).toBe(2);
      expect(updatedRegistry?.nextIndex).toBe(3);
    });

    it('should burn indices for removed attributes', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { name: 0, email: 1, status: 2 },
        burned: []
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          status: 'string'
        },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['name']).toBe(0);
      expect(updatedRegistry?.mapping['status']).toBe(2);
      expect(updatedRegistry?.mapping['email']).toBeUndefined();
      expect(updatedRegistry?.burned).toHaveLength(1);
      expect(updatedRegistry?.burned[0].attribute).toBe('email');
      expect(updatedRegistry?.burned[0].index).toBe(1);
    });

    it('should not change registry when attributes are unchanged', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 2,
        mapping: { name: 0, email: 1 },
        burned: []
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string'
        },
        schemaRegistry: existingRegistry
      });

      expect(schema._registryChanged).toBe(false);
      expect(schema.needsRegistryPersistence()).toBe(false);
    });

    it('should handle nested attributes correctly', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { 'name': 0, 'profile': 1, 'profile.bio': 2 },
        burned: []
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          profile: {
            bio: 'string',
            avatar: 'string'
          }
        },
        schemaRegistry: existingRegistry
      });

      expect(schema.map['name']).toBe('0');
      expect(schema.map['profile']).toBe('1');
      expect(schema.map['profile.bio']).toBe('2');
      expect(schema.map['profile.avatar']).toBe('3');

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['profile.avatar']).toBe(3);
      expect(updatedRegistry?.nextIndex).toBe(4);
    });

    it('should never reuse burned indices', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 2,
        mapping: { name: 0 },
        burned: [{ index: 5, attribute: 'email', burnedAt: '2026-01-01', reason: 'removed' }]
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          newField: 'string',
          status: 'string'
        },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['newField']).toBe(6);
      expect(updatedRegistry?.mapping['status']).toBe(7);
      expect(updatedRegistry?.nextIndex).toBe(8);
    });

    it('should not duplicate burned entries when removing already burned attribute', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { name: 0, email: 1, status: 2 },
        burned: [{ index: 1, attribute: 'email', burnedAt: '2026-01-01', reason: 'removed' }]
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          status: 'string'
        },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.burned).toHaveLength(1);
      expect(updatedRegistry?.burned[0].attribute).toBe('email');
    });

    it('should handle single attribute schema', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 1,
        mapping: { onlyField: 0 },
        burned: []
      };

      const schema = new Schema({
        name: 'single',
        attributes: { onlyField: 'string' },
        schemaRegistry: existingRegistry
      });

      expect(schema.map['onlyField']).toBe('0');
      expect(schema._registryChanged).toBe(false);
    });
  });

  describe('generateInitialRegistry', () => {
    it('should generate registry from current mapping', () => {
      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string',
          age: 'number'
        }
      });

      const { schemaRegistry, pluginSchemaRegistry } = schema.generateInitialRegistry();

      expect(schemaRegistry.nextIndex).toBe(3);
      expect(Object.keys(schemaRegistry.mapping)).toHaveLength(3);
      expect(schemaRegistry.burned).toHaveLength(0);
      expect(pluginSchemaRegistry).toEqual({});
    });
  });

  describe('attribute order independence', () => {
    it('should produce same indices regardless of definition order', () => {
      const registry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 1, c: 2 },
        burned: []
      };

      const schema1 = new Schema({
        name: 'test',
        attributes: { a: 'string', b: 'string', c: 'string' },
        schemaRegistry: { ...registry, mapping: { ...registry.mapping } }
      });

      const schema2 = new Schema({
        name: 'test',
        attributes: { c: 'string', a: 'string', b: 'string' },
        schemaRegistry: { ...registry, mapping: { ...registry.mapping } }
      });

      expect(schema1.map['a']).toBe(schema2.map['a']);
      expect(schema1.map['b']).toBe(schema2.map['b']);
      expect(schema1.map['c']).toBe(schema2.map['c']);
    });

    it('should not corrupt data when adding attribute in middle', () => {
      const registry: SchemaRegistry = {
        nextIndex: 2,
        mapping: { a: 0, c: 1 },
        burned: []
      };

      const schema = new Schema({
        name: 'test',
        attributes: { a: 'string', b: 'string', c: 'string' },
        schemaRegistry: registry
      });

      expect(schema.map['a']).toBe('0');
      expect(schema.map['c']).toBe('1');
      expect(schema.map['b']).toBe('2');

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['b']).toBe(2);
    });
  });

  describe('plugin schema registry', () => {
    it('should handle plugin attributes with existing registry', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _createdAt: 'pauA', _updatedAt: 'pauB' },
          burned: []
        }
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _updatedAt: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry
      });

      expect(schema.pluginMap['_createdAt']).toBe('pauA');
      expect(schema.pluginMap['_updatedAt']).toBe('pauB');
    });

    it('should assign new keys for new plugin attributes', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _createdAt: 'pauA' },
          burned: []
        }
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _updatedAt: { type: 'string', __plugin__: 'audit' },
          _deletedAt: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry
      });

      const updatedPluginRegistry = schema.getPluginSchemaRegistry();
      expect(updatedPluginRegistry?.['audit']?.mapping['_createdAt']).toBe('pauA');
      expect(updatedPluginRegistry?.['audit']?.mapping['_updatedAt']).toBeDefined();
      expect(typeof updatedPluginRegistry?.['audit']?.mapping['_updatedAt']).toBe('string');
      expect(updatedPluginRegistry?.['audit']?.mapping['_deletedAt']).toBeDefined();
      expect(typeof updatedPluginRegistry?.['audit']?.mapping['_deletedAt']).toBe('string');
    });

    it('should burn removed plugin attributes', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _createdAt: 'pauA', _updatedAt: 'pauB', _deletedAt: 'pauC' },
          burned: []
        }
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _updatedAt: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry
      });

      const updatedPluginRegistry = schema.getPluginSchemaRegistry();
      expect(updatedPluginRegistry?.['audit']?.burned).toHaveLength(1);
      expect(updatedPluginRegistry?.['audit']?.burned[0].attribute).toBe('_deletedAt');
      expect(updatedPluginRegistry?.['audit']?.burned[0].key).toBe('pauC');
    });

    it('should not duplicate burned plugin entries', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _createdAt: 'pauA', _oldField: 'pauB' },
          burned: [{ key: 'pauB', attribute: '_oldField', burnedAt: '2026-01-01', reason: 'removed' }]
        }
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry
      });

      const updatedPluginRegistry = schema.getPluginSchemaRegistry();
      expect(updatedPluginRegistry?.['audit']?.burned).toHaveLength(1);
    });

    it('should handle multiple plugins', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _createdAt: 'pauA' },
          burned: []
        },
        ttl: {
          mapping: { _expiresAt: 'pttB' },
          burned: []
        }
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _expiresAt: { type: 'string', __plugin__: 'ttl' },
          _newTtlField: { type: 'string', __plugin__: 'ttl' }
        },
        pluginSchemaRegistry
      });

      const updatedPluginRegistry = schema.getPluginSchemaRegistry();
      expect(updatedPluginRegistry?.['audit']?.mapping['_createdAt']).toBe('pauA');
      expect(updatedPluginRegistry?.['ttl']?.mapping['_expiresAt']).toBe('pttB');
      expect(updatedPluginRegistry?.['ttl']?.mapping['_newTtlField']).toBeDefined();
      expect(typeof updatedPluginRegistry?.['ttl']?.mapping['_newTtlField']).toBe('string');
    });

    it('should work without existing plugin registry', () => {
      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' }
        }
      });

      expect(schema.pluginMap['_createdAt']).toBeDefined();
    });
  });

  describe('Schema methods', () => {
    it('getPluginSchemaRegistry should return undefined when no plugin registry', () => {
      const schema = new Schema({
        name: 'users',
        attributes: { name: 'string' }
      });

      expect(schema.getPluginSchemaRegistry()).toBeUndefined();
    });

    it('getSchemaRegistry should return undefined when no registry', () => {
      const schema = new Schema({
        name: 'users',
        attributes: { name: 'string' }
      });

      expect(schema.getSchemaRegistry()).toBeUndefined();
    });

    it('needsRegistryPersistence should return true after changes', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 1,
        mapping: { name: 0 },
        burned: []
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          newField: 'string'
        },
        schemaRegistry: existingRegistry
      });

      expect(schema.needsRegistryPersistence()).toBe(true);
    });

    it('generateInitialRegistry should include plugin registries', () => {
      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' }
        }
      });

      const { schemaRegistry, pluginSchemaRegistry } = schema.generateInitialRegistry();

      expect(schemaRegistry.nextIndex).toBeGreaterThan(0);
      expect(Object.keys(pluginSchemaRegistry)).toContain('audit');
    });
  });

  describe('edge cases', () => {
    it('should handle removing all attributes except one', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0, b: 1, c: 2, d: 3, e: 4 },
        burned: []
      };

      const schema = new Schema({
        name: 'test',
        attributes: { a: 'string' },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['a']).toBe(0);
      expect(updatedRegistry?.burned).toHaveLength(4);
      expect(updatedRegistry?.nextIndex).toBe(5);
    });

    it('should handle adding many new attributes at once', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 1,
        mapping: { existing: 0 },
        burned: []
      };

      const schema = new Schema({
        name: 'test',
        attributes: {
          existing: 'string',
          new1: 'string',
          new2: 'string',
          new3: 'string',
          new4: 'string'
        },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['existing']).toBe(0);
      expect(updatedRegistry?.mapping['new1']).toBe(1);
      expect(updatedRegistry?.mapping['new2']).toBe(2);
      expect(updatedRegistry?.mapping['new3']).toBe(3);
      expect(updatedRegistry?.mapping['new4']).toBe(4);
      expect(updatedRegistry?.nextIndex).toBe(5);
    });

    it('should preserve burned list when adding new attributes', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, c: 2 },
        burned: [{ index: 1, attribute: 'b', burnedAt: '2026-01-01', reason: 'removed' }]
      };

      const schema = new Schema({
        name: 'test',
        attributes: { a: 'string', c: 'string', d: 'string' },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.burned).toHaveLength(1);
      expect(updatedRegistry?.burned[0].index).toBe(1);
      expect(updatedRegistry?.mapping['d']).toBe(3);
    });

    it('should handle schema with only plugin attributes', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _createdAt: 'pauA' },
          burned: []
        }
      };

      const schema = new Schema({
        name: 'onlyPlugins',
        attributes: {
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _updatedAt: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry
      });

      expect(schema.pluginMap['_createdAt']).toBe('pauA');
      expect(schema.pluginMap['_updatedAt']).toBeDefined();
      expect(schema._registryChanged).toBe(true);
    });

    it('should handle deeply nested attributes', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 2,
        mapping: { name: 0, 'address': 1 },
        burned: []
      };

      const schema = new Schema({
        name: 'test',
        attributes: {
          name: 'string',
          address: {
            street: 'string',
            city: {
              name: 'string',
              zip: 'string'
            }
          }
        },
        schemaRegistry: existingRegistry
      });

      expect(schema.map['name']).toBe('0');
      expect(schema.map['address']).toBe('1');
      expect(schema.map['address.street']).toBeDefined();
      expect(schema.map['address.city.name']).toBeDefined();
      expect(schema.map['address.city.zip']).toBeDefined();

      const registry = schema.getSchemaRegistry();
      expect(registry?.mapping['name']).toBe(0);
      expect(registry?.mapping['address']).toBe(1);
      expect(registry?.mapping['address.street']).toBe(2);
      expect(registry?.mapping['address.city.name']).toBeDefined();
      expect(registry?.mapping['address.city.zip']).toBeDefined();
    });

    it('should handle concurrent schema changes simulation', () => {
      const registry1: SchemaRegistry = {
        nextIndex: 2,
        mapping: { a: 0, b: 1 },
        burned: []
      };

      const schema1 = new Schema({
        name: 'test',
        attributes: { a: 'string', b: 'string', c: 'string' },
        schemaRegistry: { ...registry1, mapping: { ...registry1.mapping } }
      });

      const schema2 = new Schema({
        name: 'test',
        attributes: { a: 'string', b: 'string', d: 'string' },
        schemaRegistry: { ...registry1, mapping: { ...registry1.mapping } }
      });

      expect(schema1.getSchemaRegistry()?.mapping['c']).toBe(2);
      expect(schema2.getSchemaRegistry()?.mapping['d']).toBe(2);
    });

    it('should handle large index numbers', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 1000,
        mapping: { existing: 999 },
        burned: []
      };

      const schema = new Schema({
        name: 'test',
        attributes: { existing: 'string', newField: 'string' },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['newField']).toBe(1000);
      expect(updatedRegistry?.nextIndex).toBe(1001);
    });

    it('should handle simultaneous addition and removal of attributes', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 1, c: 2 },
        burned: []
      };

      const schema = new Schema({
        name: 'test',
        attributes: { a: 'string', d: 'string' },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['a']).toBe(0);
      expect(updatedRegistry?.mapping['d']).toBe(3);
      expect(updatedRegistry?.mapping['b']).toBeUndefined();
      expect(updatedRegistry?.mapping['c']).toBeUndefined();
      expect(updatedRegistry?.burned).toHaveLength(2);
      expect(updatedRegistry?.burned.map(b => b.index).sort()).toEqual([1, 2]);
      expect(updatedRegistry?.nextIndex).toBe(4);
    });

    it('should fix nextIndex when corrupted to lower value than max burned', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 2,
        mapping: { a: 0 },
        burned: [
          { index: 1, attribute: 'old1', burnedAt: '2026-01-01', reason: 'removed' },
          { index: 10, attribute: 'old2', burnedAt: '2026-01-01', reason: 'removed' }
        ]
      };

      const schema = new Schema({
        name: 'test',
        attributes: { a: 'string', newField: 'string' },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['newField']).toBe(11);
      expect(updatedRegistry?.nextIndex).toBe(12);
      expect(schema._registryChanged).toBe(true);
    });

    it('should fix nextIndex when corrupted to lower value than max mapping', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 50 },
        burned: []
      };

      const schema = new Schema({
        name: 'test',
        attributes: { a: 'string', b: 'string', c: 'string' },
        schemaRegistry: existingRegistry
      });

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['a']).toBe(0);
      expect(updatedRegistry?.mapping['b']).toBe(50);
      expect(updatedRegistry?.mapping['c']).toBe(51);
      expect(updatedRegistry?.nextIndex).toBe(52);
    });
  });

  describe('plugin edge cases', () => {
    it('should preserve existing plugin keys and generate new ones', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _createdAt: 'pauX' },
          burned: [{ key: 'pauY', attribute: '_oldField', burnedAt: '2026-01-01', reason: 'removed' }]
        }
      };

      const schema = new Schema({
        name: 'test',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _newField: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry
      });

      const updatedPluginRegistry = schema.getPluginSchemaRegistry();
      expect(updatedPluginRegistry?.['audit']?.mapping['_createdAt']).toBe('pauX');
      expect(updatedPluginRegistry?.['audit']?.mapping['_newField']).toBeDefined();
      expect(typeof updatedPluginRegistry?.['audit']?.mapping['_newField']).toBe('string');
      expect(updatedPluginRegistry?.['audit']?.mapping['_newField']).not.toBe('pauY');
    });

    it('should handle plugin simultaneous addition and removal', () => {
      const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {
        audit: {
          mapping: { _a: 'pauA', _b: 'pauB', _c: 'pauC' },
          burned: []
        }
      };

      const schema = new Schema({
        name: 'test',
        attributes: {
          name: 'string',
          _a: { type: 'string', __plugin__: 'audit' },
          _d: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry
      });

      const updatedPluginRegistry = schema.getPluginSchemaRegistry();
      expect(updatedPluginRegistry?.['audit']?.mapping['_a']).toBe('pauA');
      expect(updatedPluginRegistry?.['audit']?.mapping['_d']).toBeDefined();
      expect(typeof updatedPluginRegistry?.['audit']?.mapping['_d']).toBe('string');
      expect(updatedPluginRegistry?.['audit']?.burned).toHaveLength(2);
      const burnedKeys = updatedPluginRegistry?.['audit']?.burned.map(b => b.key);
      expect(burnedKeys).toContain('pauB');
      expect(burnedKeys).toContain('pauC');
    });
  });

  describe('legacy map with registry', () => {
    it('should use legacy map for existing keys and registry for new ones', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 3,
        mapping: { name: 0, email: 1 },
        burned: [{ index: 2, attribute: 'oldField', burnedAt: '2026-01-01', reason: 'removed' }]
      };

      const legacyMap = { name: '0', email: '1' };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string',
          newField: 'string'
        },
        map: legacyMap,
        schemaRegistry: existingRegistry
      });

      expect(schema.map['name']).toBe('0');
      expect(schema.map['email']).toBe('1');
      expect(schema.map['newField']).toBeDefined();

      const updatedRegistry = schema.getSchemaRegistry();
      expect(updatedRegistry?.mapping['newField']).toBe(3);
      expect(updatedRegistry?.nextIndex).toBe(4);
      expect(schema._registryChanged).toBe(true);
    });

    it('should not change registry when legacy map covers all attributes', () => {
      const existingRegistry: SchemaRegistry = {
        nextIndex: 2,
        mapping: { name: 0, email: 1 },
        burned: []
      };

      const legacyMap = { name: '0', email: '1' };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string'
        },
        map: legacyMap,
        schemaRegistry: existingRegistry
      });

      expect(schema.map['name']).toBe('0');
      expect(schema.map['email']).toBe('1');
      expect(schema._registryChanged).toBe(false);
    });

    it('should handle legacy map with no registry gracefully', () => {
      const legacyMap = { name: '0', email: '1' };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string',
          newField: 'string'
        },
        map: legacyMap
      });

      expect(schema.map['name']).toBe('0');
      expect(schema.map['email']).toBe('1');
      expect(schema.map['newField']).toBeUndefined();
    });
  });

  describe('plugin map migration', () => {
    it('should preserve legacy hash keys from existing pluginMap', () => {
      const legacyPluginMap = {
        _createdAt: 'p1a2',
        _updatedAt: 'p3b4'
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _updatedAt: { type: 'string', __plugin__: 'audit' }
        },
        pluginMap: legacyPluginMap
      });

      expect(schema.pluginMap['_createdAt']).toBe('p1a2');
      expect(schema.pluginMap['_updatedAt']).toBe('p3b4');
    });

    it('should convert legacy numeric registry to string-based registry', () => {
      const legacyPluginRegistry: Record<string, SchemaRegistry> = {
        audit: {
          nextIndex: 2,
          mapping: { _createdAt: 0, _updatedAt: 1 },
          burned: []
        }
      };

      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _createdAt: { type: 'string', __plugin__: 'audit' },
          _updatedAt: { type: 'string', __plugin__: 'audit' }
        },
        pluginSchemaRegistry: legacyPluginRegistry
      });

      const updatedPluginRegistry = schema.getPluginSchemaRegistry();
      expect(updatedPluginRegistry?.['audit']?.mapping['_createdAt']).toBe('pau0');
      expect(updatedPluginRegistry?.['audit']?.mapping['_updatedAt']).toBe('pau1');
    });
  });

  describe('plugin namespace collision prevention', () => {
    it('should generate different keys for plugins with same 2-letter prefix', () => {
      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _auditCreated: { type: 'string', __plugin__: 'audit' },
          _authCreated: { type: 'string', __plugin__: 'auth' }
        }
      });

      const auditKey = schema.pluginMap['_auditCreated'];
      const authKey = schema.pluginMap['_authCreated'];

      expect(auditKey).toBeDefined();
      expect(authKey).toBeDefined();
      expect(auditKey).not.toBe(authKey);
    });

    it('should handle collision within same plugin', () => {
      const schema = new Schema({
        name: 'users',
        attributes: {
          name: 'string',
          _field1: { type: 'string', __plugin__: 'audit' },
          _field2: { type: 'string', __plugin__: 'audit' },
          _field3: { type: 'string', __plugin__: 'audit' }
        }
      });

      const keys = [
        schema.pluginMap['_field1'],
        schema.pluginMap['_field2'],
        schema.pluginMap['_field3']
      ];

      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(3);
    });
  });
});
