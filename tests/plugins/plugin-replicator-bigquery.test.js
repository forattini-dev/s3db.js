import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import BigqueryReplicator from '#src/plugins/replicators/bigquery-replicator.class.js';

describe('BigQuery Replicator Tests', () => {
  let replicator;

  afterEach(async () => {
    if (replicator && typeof replicator.stop === 'function') {
      await replicator.stop();
    }
  });

  describe('Configuration and Validation Tests', () => {
    test('validateConfig should return errors for missing projectId', () => {
      replicator = new BigqueryReplicator({
        datasetId: 'test_dataset'
      }, { users: 'users_table' });
      
      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('projectId is required');
    });

    test('validateConfig should return errors for missing datasetId', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project'
      }, { users: 'users_table' });
      
      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('datasetId is required');
    });

    test('validateConfig should pass with valid configuration', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, { users: 'users_table' });
      
      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Resource Configuration Parsing Tests', () => {
    test('should parse string resource configuration', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, {
        users: 'users_table',
        orders: 'orders_table'
      });

      expect(replicator.resources.users).toEqual([{
        table: 'users_table',
        actions: ['insert'],
        transform: null,
        mutability: 'append-only',
        tableOptions: null
      }]);
      expect(replicator.resources.orders).toEqual([{
        table: 'orders_table',
        actions: ['insert'],
        transform: null,
        mutability: 'append-only',
        tableOptions: null
      }]);
    });

    test('should parse object resource configuration', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, {
        users: {
          table: 'users_table',
          actions: ['insert', 'update', 'delete']
        }
      });

      expect(replicator.resources.users).toEqual([{
        table: 'users_table',
        actions: ['insert', 'update', 'delete'],
        transform: null,
        mutability: 'append-only',
        tableOptions: null
      }]);
    });
  });

  describe('Resource Filtering Tests', () => {
    beforeEach(() => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, {
        users: { table: 'users_table', actions: ['insert', 'update'] },
        orders: 'orders_table'
      });
    });

    test('shouldReplicateResource should return true for configured resources', () => {
      expect(replicator.shouldReplicateResource('users')).toBe(true);
      expect(replicator.shouldReplicateResource('orders')).toBe(true);
    });

    test('shouldReplicateResource should return false for unconfigured resource', () => {
      expect(replicator.shouldReplicateResource('products')).toBe(false);
    });
  });

  describe('Constructor Tests', () => {
    test('should initialize with correct properties', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        location: 'EU',
        credentials: { type: 'service_account' }
      }, { users: 'users_table' });

      expect(replicator.projectId).toBe('test-project');
      expect(replicator.datasetId).toBe('test_dataset');
      expect(replicator.location).toBe('EU');
      expect(replicator.credentials).toEqual({ type: 'service_account' });
      expect(replicator.bigqueryClient).toBeNull();
    });

    test('should use default location when not specified', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, { users: 'users_table' });

      expect(replicator.location).toBe('US');
    });
  });

  describe('Transform Function Tests', () => {
    test('should parse and store transform function', () => {
      const transformFn = (data) => ({ ...data, ip: data.ip || 'unknown' });

      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, {
        users: {
          table: 'users_table',
          actions: ['insert', 'update'],
          transform: transformFn
        }
      });

      expect(replicator.resources.users).toEqual([{
        table: 'users_table',
        actions: ['insert', 'update'],
        transform: transformFn,
        mutability: 'append-only',
        tableOptions: null
      }]);
    });

    test('should apply transform function correctly', () => {
      const transformFn = (data) => ({ ...data, ip: data.ip || 'unknown', processed: true });
      
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, {
        users: {
          table: 'users_table',
          transform: transformFn
        }
      });

      const originalData = { id: 'user1', name: 'John' };
      const transformedData = replicator.applyTransform(originalData, transformFn);

      expect(transformedData).toEqual({
        id: 'user1',
        name: 'John',
        ip: 'unknown',
        processed: true
      });
    });

    test('should return original data when no transform function provided', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, {
        users: 'users_table'
      });

      const originalData = { id: 'user1', name: 'John' };
      const transformedData = replicator.applyTransform(originalData, null);

      expect(transformedData).toEqual(originalData);
    });
  });

  describe('Base Functionality Tests', () => {
    test('should extend BaseReplicator', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, { users: 'users_table' });

      expect(replicator.name).toBe('BigqueryReplicator');
      expect(typeof replicator.initialize).toBe('function');
      expect(typeof replicator.cleanup).toBe('function');
    });
  });

  describe('Mutability Mode Tests', () => {
    test('should default to append-only mutability mode', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset'
      }, { users: 'users_table' });

      expect(replicator.mutability).toBe('append-only');
    });

    test('should accept valid mutability modes', () => {
      const modes = ['append-only', 'mutable', 'immutable'];

      modes.forEach(mode => {
        const testReplicator = new BigqueryReplicator({
          projectId: 'test-project',
          datasetId: 'test_dataset',
          mutability: mode
        }, { users: 'users_table' });

        expect(testReplicator.mutability).toBe(mode);
      });
    });

    test('should throw error for invalid mutability mode', () => {
      expect(() => {
        new BigqueryReplicator({
          projectId: 'test-project',
          datasetId: 'test_dataset',
          mutability: 'invalid-mode'
        }, { users: 'users_table' });
      }).toThrow('Invalid mutability mode: invalid-mode');
    });

    test('should propagate global mutability to resources', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'immutable'
      }, {
        users: 'users_table',
        orders: { table: 'orders_table' }
      });

      expect(replicator.resources.users[0].mutability).toBe('immutable');
      expect(replicator.resources.orders[0].mutability).toBe('immutable');
    });

    test('should allow per-resource mutability override', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'append-only'
      }, {
        users: {
          table: 'users_table',
          mutability: 'immutable'
        },
        orders: 'orders_table'
      });

      expect(replicator.resources.users[0].mutability).toBe('immutable');
      expect(replicator.resources.orders[0].mutability).toBe('append-only');
    });

    test('should validate per-resource mutability mode', () => {
      expect(() => {
        new BigqueryReplicator({
          projectId: 'test-project',
          datasetId: 'test_dataset'
        }, {
          users: {
            table: 'users_table',
            mutability: 'invalid'
          }
        });
      }).toThrow('Invalid mutability mode: invalid');
    });

    test('should include mutability in getTablesForResource', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'append-only'
      }, {
        users: {
          table: 'users_table',
          actions: ['insert', 'update'],
          mutability: 'immutable'
        }
      });

      const tables = replicator.getTablesForResource('users', 'insert');
      expect(tables).toEqual([{
        table: 'users_table',
        transform: null,
        mutability: 'immutable',
        tableOptions: null
      }]);
    });

    test('should add tracking fields for append-only mode', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'append-only'
      }, { users: 'users_table' });

      const data = { id: 'user1', name: 'John' };
      const tracked = replicator._addTrackingFields(data, 'update', 'append-only', 'user1');

      expect(tracked).toHaveProperty('_operation_type', 'update');
      expect(tracked).toHaveProperty('_operation_timestamp');
      expect(tracked).not.toHaveProperty('_is_deleted');
      expect(tracked).not.toHaveProperty('_version');
    });

    test('should add tracking fields for immutable mode', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'immutable'
      }, { users: 'users_table' });

      const data = { id: 'user1', name: 'John' };
      const tracked = replicator._addTrackingFields(data, 'delete', 'immutable', 'user1');

      expect(tracked).toHaveProperty('_operation_type', 'delete');
      expect(tracked).toHaveProperty('_operation_timestamp');
      expect(tracked).toHaveProperty('_is_deleted', true);
      expect(tracked).toHaveProperty('_version', 1);
    });

    test('should not add tracking fields for mutable mode', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'mutable'
      }, { users: 'users_table' });

      const data = { id: 'user1', name: 'John' };
      const tracked = replicator._addTrackingFields(data, 'update', 'mutable', 'user1');

      expect(tracked).not.toHaveProperty('_operation_type');
      expect(tracked).not.toHaveProperty('_operation_timestamp');
      expect(tracked).not.toHaveProperty('_is_deleted');
      expect(tracked).not.toHaveProperty('_version');
    });

    test('should increment version counter for immutable mode', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'immutable'
      }, { users: 'users_table' });

      const id = 'user1';
      expect(replicator._getNextVersion(id)).toBe(1);
      expect(replicator._getNextVersion(id)).toBe(2);
      expect(replicator._getNextVersion(id)).toBe(3);
    });

    test('should include mutability in getStatus', () => {
      replicator = new BigqueryReplicator({
        projectId: 'test-project',
        datasetId: 'test_dataset',
        mutability: 'immutable'
      }, { users: 'users_table' });

      const status = replicator.getStatus();
      expect(status.mutability).toBe('immutable');
    });
  });
}); 
