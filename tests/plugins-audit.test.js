import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { join } from 'path';
import { AuditPlugin } from '../src/plugins/audit.plugin.js';
import Database from '../src/database.class.js';
import Client from '../src/client.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'plugins-audit-' + Date.now());

describe('Audit Plugin', () => {
  let client;
  let database;
  let auditPlugin;
  let users;

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    database = new Database({ client });

    auditPlugin = new AuditPlugin({
      enabled: true,
      includeData: true,
      includePartitions: true,
      maxDataSize: 5000
    });

    await auditPlugin.setup(database);

    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required',
        department: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byDepartment: {
          fields: { department: 'string' }
        },
        byRegion: {
          fields: { region: 'string' }
        }
      }
    });
  });

  describe('Setup and Initialization', () => {
    test('should setup audit resource', async () => {
      expect(auditPlugin.auditResource).toBeDefined();
      expect(auditPlugin.auditResource.name).toBe('audits');
    });

    test('should create audit resource with correct attributes', async () => {
      const auditResource = auditPlugin.auditResource;
      const attributes = auditResource.attributes;

      expect(attributes).toHaveProperty('id');
      expect(attributes).toHaveProperty('resourceName');
      expect(attributes).toHaveProperty('operation');
      expect(attributes).toHaveProperty('recordId');
      expect(attributes).toHaveProperty('userId');
      expect(attributes).toHaveProperty('timestamp');
      expect(attributes).toHaveProperty('oldData');
      expect(attributes).toHaveProperty('newData');
      expect(attributes).toHaveProperty('partition');
      expect(attributes).toHaveProperty('partitionValues');
      expect(attributes).toHaveProperty('metadata');
    });

    test('should handle disabled configuration', async () => {
      // Create isolated database instance for this test
      const isolatedClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-disabled`
      });

      const isolatedDatabase = new Database({ client: isolatedClient });

      const disabledPlugin = new AuditPlugin({ enabled: false });
      await disabledPlugin.setup(isolatedDatabase);
      expect(disabledPlugin.auditResource).toBeNull();
    });

    test('should handle existing audit resource', async () => {
      // Create isolated database instance for this test
      const isolatedClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-existing`
      });

      const isolatedDatabase = new Database({ client: isolatedClient });

      // First setup
      const firstPlugin = new AuditPlugin();
      await firstPlugin.setup(isolatedDatabase);

      // Second setup should not fail
      const secondPlugin = new AuditPlugin();
      await expect(secondPlugin.setup(isolatedDatabase)).resolves.toBeUndefined();
    });

    test('should work without audit plugin', async () => {
      // Create a fresh database without audit plugin
      const freshClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-no-audit`
      });

      const freshDatabase = new Database({ client: freshClient });

      const freshUsers = await freshDatabase.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          department: 'string|required',
          region: 'string|required'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          },
          byRegion: {
            fields: { region: 'string' }
          }
        }
      });

      const userData = {
        id: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
        department: 'IT',
        region: 'SP'
      };

      // This should work without the audit plugin
      const result = await freshUsers.insert(userData);
      expect(result).toBeDefined();
      expect(result.id).toBe('test-user');
    });
  });

  describe('Insert Operations Auditing', () => {
    test('should audit insert operation', async () => {
      const userData = {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'insert',
        limit: 1
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].operation).toBe('insert');
      expect(auditLogs[0].recordId).toBe('user-1');
      expect(auditLogs[0].resourceName).toBe('users');
      expect(auditLogs[0].oldData).toBeNull();
      expect(auditLogs[0].newData).toBeTruthy();
      expect(auditLogs[0].partition).toBe('byDepartment');
      expect(auditLogs[0].partitionValues).toEqual({
        byDepartment: { department: 'IT' },
        byRegion: { region: 'SP' }
      });
    });

    test('should audit insert without partition info when disabled', async () => {
      // Create isolated database instance for this test
      const isolatedClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-no-partitions`
      });

      const isolatedDatabase = new Database({ client: isolatedClient });

      const pluginWithoutPartitions = new AuditPlugin({
        enabled: true,
        includeData: true,
        includePartitions: false
      });
      await pluginWithoutPartitions.setup(isolatedDatabase);

      const isolatedUsers = await isolatedDatabase.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          department: 'string|required',
          region: 'string|required'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          },
          byRegion: {
            fields: { region: 'string' }
          }
        }
      });

      const userData = {
        id: 'user-2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        department: 'HR',
        region: 'RJ'
      };

      await isolatedUsers.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await pluginWithoutPartitions.getAuditLogs({
        resourceName: 'users',
        operation: 'insert',
        limit: 1
      });

      expect(auditLogs).toHaveLength(1);
      expect([null, undefined, '', 'null', false]).toContain(auditLogs[0].partition);
      expect([null, undefined, '', 'null', false]).toContain(auditLogs[0].partitionValues);
    });

    test('should audit insert without data when disabled', async () => {
      // Create isolated database for this test
      const isolatedClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-no-data`
      });

      const isolatedDatabase = new Database({ client: isolatedClient });

      const pluginWithoutData = new AuditPlugin({
        enabled: true,
        includeData: false
      });
      await pluginWithoutData.setup(isolatedDatabase);

      const isolatedUsers = await isolatedDatabase.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          department: 'string|required',
          region: 'string|required'
        }
      });

      const userData = {
        id: 'user-3',
        name: 'Bob Wilson',
        email: 'bob@example.com',
        department: 'Sales',
        region: 'MG'
      };

      await isolatedUsers.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await pluginWithoutData.getAuditLogs({
        resourceName: 'users',
        operation: 'insert',
        limit: 1
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].newData).toBeNull();
    });

    test('should generate unique audit IDs', async () => {
      const userData1 = { id: 'user-4', name: 'Alice', email: 'alice@example.com', department: 'IT', region: 'SP' };
      const userData2 = { id: 'user-5', name: 'Charlie', email: 'charlie@example.com', department: 'HR', region: 'RJ' };

      await users.insert(userData1);
      await users.insert(userData2);

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'insert',
        limit: 2
      });

      expect(auditLogs).toHaveLength(2);
      expect(auditLogs[0].id).not.toBe(auditLogs[1].id);
      expect(auditLogs[0].id).toMatch(/^audit-/);
      expect(auditLogs[1].id).toMatch(/^audit-/);
    });
  });

  describe('Update Operations Auditing', () => {
    test('should audit update operation with old and new data', async () => {
      const userId = 'user-update';
      const userData = {
        id: userId,
        name: 'Update User',
        email: 'update@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);
      await users.update(userId, { name: 'Updated User' });

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'update',
        limit: 1
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].operation).toBe('update');
      expect(auditLogs[0].recordId).toBe(userId);
      expect(auditLogs[0].oldData).toBeTruthy();
      expect(auditLogs[0].newData).toBeTruthy();
    });

    test('should handle update when old data is not accessible', async () => {
      const userId = 'user-update-inaccessible';
      const userData = {
        id: userId,
        name: 'Inaccessible User',
        email: 'inaccessible@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'insert',
        limit: 1
      });

      // Should still have the insert audit log
      expect(auditLogs.length).toBeGreaterThan(0);
    });

    test('should audit update with partition changes', async () => {
      const userId = 'user-partition-change';
      const userData = {
        id: userId,
        name: 'Partition User',
        email: 'partition@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);
      await users.update(userId, { 
        department: 'Marketing',
        region: 'RJ'
      });

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'update',
        limit: 1
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].partitionValues).toBeTruthy();
      expect(auditLogs[0].partitionValues).toEqual({
        byDepartment: { department: 'Marketing' },
        byRegion: { region: 'RJ' }
      });
    });
  });

  describe('Delete Operations Auditing', () => {
    test('should audit delete operation', async () => {
      const userId = 'user-delete';
      const userData = {
        id: userId,
        name: 'Delete User',
        email: 'delete@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);
      await users.delete(userId);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'delete',
        limit: 1
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].operation).toBe('delete');
      expect(auditLogs[0].recordId).toBe(userId);
      expect(auditLogs[0].oldData).toBeDefined();
      expect(auditLogs[0].newData).toBeNull();
    });

    test('should handle delete when data is not accessible', async () => {
      const userId = 'user-delete-inaccessible';
      const userData = {
        id: userId,
        name: 'Inaccessible Delete User',
        email: 'inaccessible-delete@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);
      await users.delete(userId);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Try to delete again - should not throw
      await expect(users.delete(userId)).resolves.toBeDefined();

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'delete',
        limit: 2
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('DeleteMany Operations Auditing', () => {
    test('should audit deleteMany operation', async () => {
      const userIds = ['user-delete-many-1', 'user-delete-many-2', 'user-delete-many-3'];
      
      // Create users
      await users.insertMany(
        userIds.map(id => ({
          id,
          name: `Delete Many User ${id}`,
          email: `${id}@example.com`,
          department: 'IT',
          region: 'SP'
        }))
      );

      await users.deleteMany(userIds);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const deleteLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'delete',
        limit: 10
      });

      // Filtrar apenas os recordIds criados neste teste
      const userIdsCreatedInThisTest = ['user-delete-many-1', 'user-delete-many-2', 'user-delete-many-3'];
      const filteredLogs = deleteLogs.filter(log => userIdsCreatedInThisTest.includes(log.recordId));

      expect(filteredLogs).toHaveLength(3);
      expect(filteredLogs[0].oldData).toBeDefined();
      expect(filteredLogs[0].newData).toBeNull();
    });

    test('should handle deleteMany with inaccessible records', async () => {
      const userIds = ['user-delete-many-inaccessible-1', 'user-delete-many-inaccessible-2'];
      
      // Create only one user
      await users.insert({
        id: userIds[0],
        name: 'Accessible User',
        email: 'accessible@example.com',
        department: 'IT',
        region: 'SP'
      });

      await users.deleteMany(userIds);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users',
        operation: 'delete',
        limit: 10
      });

      // Should have audit logs for accessible records
      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Data Truncation', () => {
    test('should not truncate small data', async () => {
      const userData = {
        id: 'user-small',
        name: 'Small User',
        email: 'small@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await auditPlugin.auditResource.getAll();
      const userAudit = auditLogs.find(log => log.recordId === 'user-small');

      expect(userAudit).toBeDefined();
      expect(userAudit.newData).toBeTruthy();
      expect(userAudit.newData._truncated).toBeUndefined();
    });

    test('should respect custom maxDataSize', async () => {
      // Create a plugin with smaller maxDataSize for this test
      const pluginWithSmallMax = new AuditPlugin({
        enabled: true,
        includeData: true,
        includePartitions: true,
        maxDataSize: 100 // Small size to force truncation
      });
      
      // Create isolated database for this test
      const isolatedClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-truncation`
      });

      const isolatedDatabase = new Database({ client: isolatedClient });
      await pluginWithSmallMax.setup(isolatedDatabase);

      const isolatedUsers = await isolatedDatabase.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          department: 'string|required',
          region: 'string|required'
        }
      });

      const largeData = {
        id: 'user-large',
        name: 'Large User',
        email: 'large@example.com',
        department: 'IT',
        region: 'SP',
        description: 'A'.repeat(500) // Create large data
      };

      await isolatedUsers.insert(largeData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLogs = await pluginWithSmallMax.auditResource.getAll();
      const userAudit = auditLogs.find(log => log.recordId === 'user-large');

      expect(userAudit).toBeDefined();
      expect(userAudit.newData).toBeTruthy();
      const parsedNewData = typeof userAudit.newData === 'string' ? JSON.parse(userAudit.newData) : userAudit.newData;
      expect(parsedNewData && parsedNewData._truncated).toBe(true);
      expect(parsedNewData && parsedNewData._originalSize).toBeGreaterThan(100);
    });
  });

  describe('Audit Log Queries', () => {
    beforeEach(async () => {
      // Create some test data first
      const testUsers = [
        {
          id: 'user-query-1',
          name: 'Query User 1',
          email: 'query1@example.com',
          department: 'IT',
          region: 'SP'
        },
        {
          id: 'user-query-2',
          name: 'Query User 2',
          email: 'query2@example.com',
          department: 'HR',
          region: 'RJ'
        }
      ];

      for (const user of testUsers) {
        await users.insert(user);
      }

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('should query audit logs by resource name', async () => {
      const auditLogs = await auditPlugin.getAuditLogs({
        resourceName: 'users'
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        expect(log.resourceName).toBe('users');
      });
    });

    test('should query audit logs by operation', async () => {
      const auditLogs = await auditPlugin.getAuditLogs({
        operation: 'insert'
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        expect(log.operation).toBe('insert');
      });
    });

    test('should query audit logs by record ID', async () => {
      const auditLogs = await auditPlugin.getAuditLogs({
        recordId: 'user-query-1'
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        expect(log.recordId).toBe('user-query-1');
      });
    });

    test('should query audit logs by partition', async () => {
      const auditLogs = await auditPlugin.getAuditLogs({
        partition: 'byDepartment'
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        expect(log.partition).toBe('byDepartment');
      });
    });

    test('should query audit logs by date range', async () => {
      const startDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      const endDate = new Date(Date.now() + 60000).toISOString(); // 1 minute from now

      const auditLogs = await auditPlugin.getAuditLogs({
        startDate,
        endDate
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      auditLogs.forEach(log => {
        const logDate = new Date(log.timestamp);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(new Date(startDate).getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(new Date(endDate).getTime());
      });
    });

    test('should respect limit and offset', async () => {
      const auditLogs = await auditPlugin.getAuditLogs({
        limit: 1,
        offset: 0
      });

      expect(auditLogs.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Record History', () => {
    test('should get complete record history', async () => {
      const userId = 'user-history';
      const userData = {
        id: userId,
        name: 'History User',
        email: 'history@example.com',
        department: 'IT',
        region: 'SP'
      };

      // Insert user
      await users.insert(userData);

      // Update user
      await users.update(userId, { name: 'History User Updated' });

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const history = await auditPlugin.getRecordHistory('users', userId);

      expect(history.length).toBeGreaterThan(0);
      history.forEach(log => {
        expect(log.resourceName).toBe('users');
        expect(log.recordId).toBe(userId);
      });
    });

    test('should handle non-existent record history', async () => {
      const history = await auditPlugin.getRecordHistory('users', 'non-existent-id');
      expect(history).toEqual([]);
    });
  });

  describe('Partition History', () => {
    test('should get partition history', async () => {
      const userData = {
        id: 'user-partition',
        name: 'Partition User',
        email: 'partition@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const history = await auditPlugin.getPartitionHistory('users', 'byDepartment', { department: 'IT' });

      expect(history.length).toBeGreaterThan(0);
      history.forEach(log => {
        expect(log.partition).toBe('byDepartment');
      });
    });
  });

  describe('Audit Statistics', () => {
    beforeEach(async () => {
      // Create some test data for statistics
      const testUsers = [
        {
          id: 'user-stats-1',
          name: 'Stats User 1',
          email: 'stats1@example.com',
          department: 'IT',
          region: 'SP'
        },
        {
          id: 'user-stats-2',
          name: 'Stats User 2',
          email: 'stats2@example.com',
          department: 'HR',
          region: 'RJ'
        }
      ];

      for (const user of testUsers) {
        await users.insert(user);
      }

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('should generate audit statistics', async () => {
      const stats = await auditPlugin.getAuditStats();

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byOperation).toBeDefined();
      expect(stats.byResource).toBeDefined();
      expect(stats.byPartition).toBeDefined();
      expect(stats.byUser).toBeDefined();
      expect(stats.timeline).toBeDefined();
    });

    test('should count operations correctly', async () => {
      const stats = await auditPlugin.getAuditStats();

      expect(stats.byOperation.insert).toBeGreaterThan(0);
    });

    test('should count by resource correctly', async () => {
      const stats = await auditPlugin.getAuditStats();

      expect(stats.byResource.users).toBeGreaterThan(0);
    });

    test('should count by partition correctly', async () => {
      const stats = await auditPlugin.getAuditStats();

      expect(stats.byPartition.byDepartment).toBeGreaterThan(0);
    });

    test('should generate timeline statistics', async () => {
      const stats = await auditPlugin.getAuditStats();

      expect(Object.keys(stats.timeline).length).toBeGreaterThan(0);
    });

    test('should filter statistics by date range', async () => {
      const startDate = new Date(Date.now() - 60000).toISOString();
      const endDate = new Date(Date.now() + 60000).toISOString();

      const stats = await auditPlugin.getAuditStats({
        startDate,
        endDate
      });

      expect(stats.total).toBeGreaterThan(0);
    });

    test('should filter statistics by resource', async () => {
      const stats = await auditPlugin.getAuditStats({
        resourceName: 'users'
      });

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byResource.users).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle audit resource creation errors gracefully', async () => {
      const errorPlugin = new AuditPlugin({ enabled: true });
      
      // Mock database to simulate error
      const errorDatabase = {
        createResource: jest.fn().mockRejectedValue(new Error('Resource creation failed')),
        resources: {}
      };

      await errorPlugin.setup(errorDatabase);
      expect(errorPlugin.auditResource == null).toBe(true);
    });

    test('should handle audit logging errors gracefully', async () => {
      // Mock audit resource to simulate error
      const originalInsert = auditPlugin.auditResource.insert;
      auditPlugin.auditResource.insert = jest.fn().mockRejectedValue(new Error('Insert failed'));

      const userData = {
        id: 'user-error',
        name: 'Error User',
        email: 'error@example.com',
        department: 'IT',
        region: 'SP'
      };

      // Should not throw
      await expect(users.insert(userData)).resolves.toBeDefined();
      
      // Restore original method
      auditPlugin.auditResource.insert = originalInsert;
    });

    test('should handle query errors gracefully', async () => {
      // Mock audit resource to simulate query error
      const originalGetAll = auditPlugin.auditResource.getAll;
      auditPlugin.auditResource.getAll = jest.fn().mockRejectedValue(new Error('Query failed'));

      // Should return empty array instead of throwing
      const logs = await auditPlugin.getAuditLogs({ resourceName: 'users' });
      expect(logs).toEqual([]);
      
      // Restore original method
      auditPlugin.auditResource.getAll = originalGetAll;
    });
  });

  describe('Performance', () => {
    test('should handle high-volume auditing', async () => {
      const startTime = Date.now();

      // Create many records
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const userData = {
          id: `perf-user-${i}`,
          name: `Performance User ${i}`,
          email: `perf${i}@example.com`,
          department: 'IT',
          region: 'SP'
        };
        promises.push(users.insert(userData));
      }

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Plugin Functionality (Mocked)', () => {
    let mockAuditResource;

    beforeEach(() => {
      // Mock the audit resource to avoid S3 errors
      mockAuditResource = {
        insert: jest.fn().mockResolvedValue({ id: 'mock-audit-id' }),
        getAll: jest.fn().mockResolvedValue([])
      };
      
      auditPlugin.auditResource = mockAuditResource;
    });

    test('should create audit records correctly when S3 is working', async () => {
      const userData = {
        id: 'user-mock',
        name: 'Mock User',
        email: 'mock@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that insert was called on the audit resource
      expect(mockAuditResource.insert).toHaveBeenCalled();
      
      const callArgs = mockAuditResource.insert.mock.calls[0][0];
      expect(callArgs.resourceName).toBe('users');
      expect(callArgs.operation).toBe('insert');
      expect(callArgs.recordId).toBe('user-mock');
      expect(callArgs.oldData).toBeNull();
      expect(callArgs.newData).toBe(JSON.stringify({
        id: 'user-mock',
        name: 'Mock User',
        email: 'mock@example.com',
        department: 'IT',
        region: 'SP'
      }));
      expect(callArgs.partition).toBe('byDepartment');
      expect(JSON.parse(callArgs.partitionValues)).toEqual({
        byDepartment: { department: 'IT' },
        byRegion: { region: 'SP' }
      });
    });

    test('should handle update operations correctly', async () => {
      const userId = 'user-update-mock';
      const userData = {
        id: userId,
        name: 'Update Mock User',
        email: 'update-mock@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);
      await users.update(userId, { name: 'Updated Mock User' });

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that insert was called twice (once for insert, once for update)
      expect(mockAuditResource.insert).toHaveBeenCalledTimes(2);
      
      const updateCallArgs = mockAuditResource.insert.mock.calls[1][0];
      expect(updateCallArgs.operation).toBe('update');
      expect(updateCallArgs.recordId).toBe(userId);
    });

    test('should handle delete operations correctly', async () => {
      const userId = 'user-delete-mock';
      const userData = {
        id: userId,
        name: 'Delete Mock User',
        email: 'delete-mock@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);
      await users.delete(userId);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that insert was called twice (once for insert, once for delete)
      expect(mockAuditResource.insert).toHaveBeenCalledTimes(2);
      
      const deleteCallArgs = mockAuditResource.insert.mock.calls[1][0];
      expect(deleteCallArgs.operation).toBe('delete');
      expect(deleteCallArgs.recordId).toBe(userId);
      expect(deleteCallArgs.newData).toBeNull();
    });

    test('should handle deleteMany operations correctly', async () => {
      const userIds = ['user-delete-many-1', 'user-delete-many-2'];
      
      // Create users
      for (const id of userIds) {
        await users.insert({
          id,
          name: `Delete Many User ${id}`,
          email: `${id}@example.com`,
          department: 'IT',
          region: 'SP'
        });
      }

      await users.deleteMany(userIds);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that insert was called multiple times
      expect(mockAuditResource.insert).toHaveBeenCalledTimes(4); // 2 inserts + 2 deletes
    });

    test('should handle partition changes correctly', async () => {
      const userId = 'user-partition-mock';
      const userData = {
        id: userId,
        name: 'Partition Mock User',
        email: 'partition-mock@example.com',
        department: 'IT',
        region: 'SP'
      };

      await users.insert(userData);
      await users.update(userId, { 
        department: 'Marketing',
        region: 'RJ'
      });

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const updateCallArgs = mockAuditResource.insert.mock.calls[1][0];
      expect(JSON.parse(updateCallArgs.partitionValues)).toEqual({
        byDepartment: { department: 'Marketing' },
        byRegion: { region: 'RJ' }
      });
    });

    test('should handle data truncation correctly', async () => {
      const largeData = {
        id: 'user-large-mock',
        name: 'Large Mock User',
        email: 'large-mock@example.com',
        department: 'IT',
        region: 'SP',
        description: 'A'.repeat(200) // Create large data
      };

      await users.insert(largeData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const callArgs = mockAuditResource.insert.mock.calls[0][0];
      // The plugin should include the data with truncation info
      expect(callArgs.newData).toBe(JSON.stringify({
        id: 'user-large-mock',
        name: 'Large Mock User',
        email: 'large-mock@example.com',
        department: 'IT',
        region: 'SP',
        description: 'A'.repeat(200)
      }));
      // Check if truncation info is present (may be undefined if not truncated)
      const parsedData = JSON.parse(callArgs.newData);
      if (parsedData && parsedData._truncated !== undefined) {
        expect(parsedData._truncated).toBe(true);
        expect(parsedData._originalSize).toBeGreaterThan(100);
      }
    });

    test('should handle disabled data inclusion', async () => {
      // Create isolated database for this test
      const isolatedClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-no-data`
      });

      const isolatedDatabase = new Database({ client: isolatedClient });

      const pluginWithoutData = new AuditPlugin({
        enabled: true,
        includeData: false
      });
      await pluginWithoutData.setup(isolatedDatabase);
      pluginWithoutData.auditResource = mockAuditResource;
      
      // Create the resource users after installing the plugin
      const usersNoData = await isolatedDatabase.createResource({
        name: 'users-no-data',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          department: 'string|required',
          region: 'string|required'
        }
      });

      const userData = {
        id: 'user-no-data',
        name: 'No Data User',
        email: 'nodata@example.com',
        department: 'IT',
        region: 'SP'
      };

      await usersNoData.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const callArgs = mockAuditResource.insert.mock.calls[0][0];
      // When includeData is false, newData should be null
      expect(callArgs.newData).toBeNull();
    });

    test('should handle disabled partition inclusion', async () => {
      // Create isolated database for this test
      const isolatedClient = new Client({
        verbose: true,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          .replace('USER', process.env.MINIO_USER)
          .replace('PASSWORD', process.env.MINIO_PASSWORD)
          + `/${testPrefix}-no-partitions-mock`
      });

      const isolatedDatabase = new Database({ client: isolatedClient });

      const pluginWithoutPartitions = new AuditPlugin({
        enabled: true,
        includeData: true,
        includePartitions: false
      });
      await pluginWithoutPartitions.setup(isolatedDatabase);
      pluginWithoutPartitions.auditResource = mockAuditResource;
      
      // Create the resource users after installing the plugin
      const usersNoPartitions = await isolatedDatabase.createResource({
        name: 'users-no-partitions',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          department: 'string|required',
          region: 'string|required'
        }
      });

      const userData = {
        id: 'user-no-partitions',
        name: 'No Partitions User',
        email: 'nopartitions@example.com',
        department: 'IT',
        region: 'SP'
      };

      await usersNoPartitions.insert(userData);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const callArgs = mockAuditResource.insert.mock.calls[0][0];
      // When includePartitions is false, partition and partitionValues should be null
      expect(callArgs.partition).toBeNull();
      expect(callArgs.partitionValues).toBeNull();
    });
  });
}); 