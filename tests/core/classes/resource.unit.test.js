/**
 * Resource Unit Tests
 *
 * Isolated unit tests for Resource class methods.
 * Tests configuration, ID generation, hooks, and utilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Resource } from '#src/resource.class.js';
import { MemoryClient } from '#src/clients/memory-client.class.js';

describe('Resource Unit Tests', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = new MemoryClient({
      bucket: 'test-bucket',
      keyPrefix: 'test-prefix'
    });
  });

  describe('Constructor Validation', () => {
    it('should throw error when name is missing', () => {
      expect(() => new Resource({
        client: mockClient,
        attributes: { name: 'string' }
      })).toThrow("Resource 'name' is required");
    });

    it('should throw error when name is not a string', () => {
      expect(() => new Resource({
        name: 123,
        client: mockClient,
        attributes: { name: 'string' }
      })).toThrow("Resource 'name' must be a string");
    });

    it('should throw error when name is empty', () => {
      expect(() => new Resource({
        name: '   ',
        client: mockClient,
        attributes: { name: 'string' }
      })).toThrow("Resource 'name' cannot be empty");
    });

    it('should throw error when client is missing', () => {
      expect(() => new Resource({
        name: 'test',
        attributes: { name: 'string' }
      })).toThrow("S3 'client' is required");
    });

    it('should throw error when attributes are missing', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient
      })).toThrow("Resource 'attributes' are required");
    });

    it('should throw error when attributes is not an object', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: 'not-an-object'
      })).toThrow("Resource 'attributes' must be an object");
    });

    it('should throw error when attributes is an array', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: ['name', 'email']
      })).toThrow("Resource 'attributes' must be an object");
    });

    it('should throw error when attributes is empty', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: {}
      })).toThrow("Resource 'attributes' cannot be empty");
    });

    it('should throw error when version is not a string', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        version: 123
      })).toThrow("Resource 'version' must be a string");
    });

    it('should throw error when behavior is not a string', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        behavior: 123
      })).toThrow("Resource 'behavior' must be a string");
    });

    it('should throw error when observers is not an array', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        observers: 'not-an-array'
      })).toThrow("Resource 'observers' must be an array");
    });

    it('should throw error when boolean fields have wrong type', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        timestamps: 'true'
      })).toThrow("Resource 'timestamps' must be a boolean");
    });

    it('should create resource with valid minimal config', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.name).toBe('test');
      expect(resource.client).toBe(mockClient);
    });
  });

  describe('ID Generator Configuration', () => {
    it('should use default ID generator (22 chars)', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      const id = resource.idGenerator();

      expect(typeof id).toBe('string');
      expect(id.length).toBe(22);
    });

    it('should accept custom ID size', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idSize: 8
      });

      const id = resource.idGenerator();

      expect(typeof id).toBe('string');
      expect(id.length).toBe(8);
    });

    it('should accept idGenerator as number (size)', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: 16
      });

      const id = resource.idGenerator();

      expect(id.length).toBe(16);
    });

    it('should accept custom ID generator function', () => {
      let counter = 0;
      const customGenerator = () => `custom-${++counter}`;

      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: customGenerator
      });

      expect(resource.idGenerator()).toBe('custom-1');
      expect(resource.idGenerator()).toBe('custom-2');
    });

    it('should convert non-string ID to string', () => {
      const numericGenerator = () => 12345;

      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: numericGenerator
      });

      const id = resource.idGenerator();

      expect(typeof id).toBe('string');
      expect(id).toBe('12345');
    });

    it('should throw error for invalid idGenerator', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: { invalid: true }
      })).toThrow("idGenerator");
    });

    it('should throw error for negative idGenerator size', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: -5
      })).toThrow("must be greater than 0");
    });

    it('should recognize incremental string config', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      expect(resource._incrementalConfig).toBe('incremental');
    });

    it('should recognize incremental with start value', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: 'incremental:1000'
      });

      expect(resource._incrementalConfig).toBe('incremental:1000');
    });

    it('should recognize incremental object config', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', start: 500 }
      });

      expect(resource._incrementalConfig).toEqual({ type: 'incremental', start: 500 });
    });
  });

  describe('$schema Property', () => {
    it('should expose configuration via $schema', () => {
      const resource = new Resource({
        name: 'users',
        client: mockClient,
        attributes: { name: 'string', email: 'string' },
        behavior: 'body-overflow',
        timestamps: true
      });

      expect(resource.$schema.name).toBe('users');
      expect(resource.$schema.behavior).toBe('body-overflow');
      expect(resource.$schema.timestamps).toBe(true);
    });

    it('should include attributes in $schema', () => {
      const resource = new Resource({
        name: 'users',
        client: mockClient,
        attributes: {
          name: 'string|required',
          email: 'string|email'
        }
      });

      expect(resource.$schema.attributes.name).toBe('string|required');
      expect(resource.$schema.attributes.email).toBe('string|email');
    });

    it('should include metadata timestamps', () => {
      const resource = new Resource({
        name: 'users',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.$schema._createdAt).toBeDefined();
      expect(resource.$schema._updatedAt).toBeDefined();
      expect(typeof resource.$schema._createdAt).toBe('number');
    });

    it('should freeze $schema to prevent mutations', () => {
      const resource = new Resource({
        name: 'users',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(Object.isFrozen(resource.$schema)).toBe(true);
    });

    it('should not include client in $schema', () => {
      const resource = new Resource({
        name: 'users',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.$schema.client).toBeUndefined();
    });

    it('should not include database in $schema', () => {
      const resource = new Resource({
        name: 'users',
        client: mockClient,
        attributes: { name: 'string' },
        database: { id: 'test-db' }
      });

      expect(resource.$schema.database).toBeUndefined();
    });
  });

  describe('Hooks System', () => {
    it('should initialize all hook arrays', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      const expectedHooks = [
        'beforeInsert', 'afterInsert',
        'beforeUpdate', 'afterUpdate',
        'beforeDelete', 'afterDelete',
        'beforeGet', 'afterGet',
        'beforeList', 'afterList',
        'beforeQuery', 'afterQuery',
        'beforePatch', 'afterPatch',
        'beforeReplace', 'afterReplace',
        'beforeExists', 'afterExists',
        'beforeCount', 'afterCount',
        'beforeGetMany', 'afterGetMany',
        'beforeDeleteMany', 'afterDeleteMany'
      ];

      for (const hookName of expectedHooks) {
        expect(Array.isArray(resource.hooks[hookName])).toBe(true);
      }
    });

    it('should register custom hooks', () => {
      const beforeInsert = vi.fn();
      const afterInsert = vi.fn();

      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        hooks: {
          beforeInsert: [beforeInsert],
          afterInsert: [afterInsert]
        }
      });

      expect(resource.hooks.beforeInsert.length).toBeGreaterThan(0);
      expect(resource.hooks.afterInsert.length).toBeGreaterThan(0);
    });
  });

  describe('Partition Validation', () => {
    it('should accept valid partition config', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: {
          name: 'string',
          region: 'string'
        },
        partitions: {
          byRegion: {
            fields: { region: 'string' }
          }
        }
      });

      expect(resource.config.partitions.byRegion).toBeDefined();
    });

    it('should throw error when partition is not an object', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        partitions: {
          byRegion: 'not-an-object'
        }
      })).toThrow("Partition 'byRegion' must be an object");
    });

    it('should throw error when partition lacks fields property', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        partitions: {
          byRegion: {}
        }
      })).toThrow("Partition 'byRegion' must have a 'fields' property");
    });

    it('should throw error when partition fields is not an object', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        partitions: {
          byRegion: { fields: 'not-an-object' }
        }
      })).toThrow("Partition 'byRegion.fields' must be an object");
    });

    it('should throw error when partition field type is not a string', () => {
      expect(() => new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        partitions: {
          byRegion: { fields: { region: 123 } }
        }
      })).toThrow("must be a string");
    });
  });

  describe('Default Values', () => {
    it('should use default version v1', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.version).toBe('1');
    });

    it('should use default passphrase', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.passphrase).toBe('secret');
    });

    it('should use custom passphrase when provided', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        passphrase: 'custom-passphrase'
      });

      expect(resource.passphrase).toBe('custom-passphrase');
    });

    it('should use default bcryptRounds of 10', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.bcryptRounds).toBe(10);
    });

    it('should use custom bcryptRounds when provided', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        bcryptRounds: 12
      });

      expect(resource.bcryptRounds).toBe(12);
    });

    it('should default strictValidation to true', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.strictValidation).toBe(true);
    });

    it('should default paranoid to true', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.config.paranoid).toBe(true);
    });
  });

  describe('getIdGeneratorType', () => {
    it('should return "custom" for function generator', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idGenerator: () => 'custom-id'
      });

      expect(resource.idGeneratorType).toBe('custom');
    });

    it('should return "nanoid" for default generator', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.idGeneratorType).toBe('nanoid');
    });

    it('should store idSize', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        idSize: 16
      });

      expect(resource.idSize).toBe(16);
    });
  });

  describe('hasAsyncIdGenerator', () => {
    it('should return false for standard generator', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.hasAsyncIdGenerator()).toBe(false);
    });
  });

  describe('Export', () => {
    it('should export resource definition', () => {
      const resource = new Resource({
        name: 'users',
        client: mockClient,
        attributes: {
          name: 'string|required',
          email: 'string|email'
        },
        behavior: 'body-overflow',
        timestamps: true,
        version: '2'
      });

      const exported = resource.export();

      expect(exported.name).toBe('users');
      expect(exported.version).toBe('2');
      expect(exported.behavior).toBe('body-overflow');
      expect(exported.attributes).toBeDefined();
    });
  });

  describe('Instance ID', () => {
    it('should generate unique instance ID', () => {
      const resource1 = new Resource({
        name: 'test1',
        client: mockClient,
        attributes: { name: 'string' }
      });

      const resource2 = new Resource({
        name: 'test2',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource1._instanceId).toBeDefined();
      expect(resource2._instanceId).toBeDefined();
      expect(resource1._instanceId).not.toBe(resource2._instanceId);
    });
  });

  describe('Events Configuration', () => {
    it('should set asyncEvents mode', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        asyncEvents: false
      });

      // Default is async, so disabling should change behavior
      expect(resource.config.asyncEvents).toBe(false);
    });

    it('should store events disabled flag', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        disableEvents: true
      });

      expect(resource.eventsDisabled).toBe(true);
    });
  });

  describe('CreatedBy Tracking', () => {
    it('should default createdBy to user', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' }
      });

      expect(resource.config.createdBy).toBe('user');
    });

    it('should track plugin as creator', () => {
      const resource = new Resource({
        name: 'test',
        client: mockClient,
        attributes: { name: 'string' },
        createdBy: 'CachePlugin'
      });

      expect(resource.config.createdBy).toBe('CachePlugin');
    });
  });
});
