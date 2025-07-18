import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import BigqueryReplicator from '#src/plugins/replicators/bigquery-replicator.class.js';

describe('BigQuery Replicator Tests', () => {
  let replicator;

  afterEach(async () => {
    if (replicator && typeof replicator.cleanup === 'function') {
      await replicator.cleanup();
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
        transform: null
      }]);
      expect(replicator.resources.orders).toEqual([{
        table: 'orders_table', 
        actions: ['insert'],
        transform: null
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
        transform: null
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
        transform: transformFn
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
}); 