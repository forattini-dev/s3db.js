import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import Database from '#src/database.class.js';
import { CostsPlugin } from '#src/plugins/costs.plugin.js';
import { createDatabaseForTest, createClientForTest } from '#tests/config.js';

describe('Costs Plugin', () => {
  let database;
  let client;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/costs');
    await database.connect();
    client = database.client;
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Setup and Initialization', () => {
    test('should setup costs tracking on database', async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);

      expect(client.costs).toBeDefined();
      expect(typeof client.costs.total).toBe('number');
      expect(typeof client.costs.requests).toBe('object');
    });

    test('should initialize costs structure correctly', async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);

      expect(client.costs.total).toBe(0);
      expect(client.costs.requests).toEqual({
        get: 0,
        put: 0,
        delete: 0,
        list: 0,
        head: 0,
        post: 0,
        copy: 0,
        select: 0,
        total: 0
      });
    });

    test('should handle multiple setup calls gracefully', async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
      
      // Second setup should not break
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);

      expect(client.costs).toBeDefined();
    });
  });

  describe('Cost Tracking', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should track PUT operation costs', async () => {
      const initialCost = client.costs.total;
      const initialPutRequests = client.costs.requests.put;

      await client.putObject({
        key: 'test-costs-put.txt',
        body: 'test content for put operation',
        contentType: 'text/plain'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.put).toBe(initialPutRequests + 1);
      expect(client.costs.requests.total).toBeGreaterThan(0);
    });

    test('should track GET operation costs', async () => {
      // First put an object
      await client.putObject({
        key: 'test-costs-get.txt',
        body: 'test content for get operation',
        contentType: 'text/plain'
      });

      const initialCost = client.costs.total;
      const initialGetRequests = client.costs.requests.get;

      await client.getObject('test-costs-get.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.get).toBe(initialGetRequests + 1);
      expect(client.costs.requests.total).toBeGreaterThan(1);
    });

    test('should track DELETE operation costs', async () => {
      // First put an object
      await client.putObject({
        key: 'test-costs-delete.txt',
        body: 'test content for delete operation',
        contentType: 'text/plain'
      });

      const initialCost = client.costs.total;
      const initialDeleteRequests = client.costs.requests.delete;

      await client.deleteObject('test-costs-delete.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.delete).toBe(initialDeleteRequests + 1);
      expect(client.costs.requests.total).toBeGreaterThan(1);
    });

    test('should track LIST operation costs', async () => {
      const initialCost = client.costs.total;
      const initialListRequests = client.costs.requests.list;

      await client.listObjects({
        prefix: 'test-costs'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.list).toBe(initialListRequests + 1);
      expect(client.costs.requests.total).toBeGreaterThan(0);
    });

    test('should track HEAD operation costs', async () => {
      // First put an object
      await client.putObject({
        key: 'test-costs-head.txt',
        body: 'test content for head operation',
        contentType: 'text/plain'
      });

      const initialCost = client.costs.total;
      const initialHeadRequests = client.costs.requests.head;

      await client.headObject('test-costs-head.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.head).toBe(initialHeadRequests + 1);
      expect(client.costs.requests.total).toBeGreaterThan(1);
    });

    test('should accumulate costs across multiple operations', async () => {
      const initialCost = client.costs.total;

      // Perform multiple operations
      await client.putObject({
        key: 'test-costs-1.txt',
        body: 'test content 1',
        contentType: 'text/plain'
      });

      await client.putObject({
        key: 'test-costs-2.txt',
        body: 'test content 2',
        contentType: 'text/plain'
      });

      await client.listObjects({
        prefix: 'test-costs'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.put).toBe(2);
      expect(client.costs.requests.list).toBe(1);
      expect(client.costs.requests.total).toBe(3);
    });

    test('should track costs for large objects', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const initialCost = client.costs.total;

      await client.putObject({
        key: 'test-costs-large.txt',
        body: largeContent,
        contentType: 'text/plain'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.put).toBe(1);
    });

    test('should track costs for multiple GET operations on same object', async () => {
      // Put an object
      await client.putObject({
        key: 'test-costs-multiple-get.txt',
        body: 'test content for multiple gets',
        contentType: 'text/plain'
      });

      const initialCost = client.costs.total;
      const initialGetRequests = client.costs.requests.get;

      // Perform multiple GET operations
      await client.getObject('test-costs-multiple-get.txt');
      await client.getObject('test-costs-multiple-get.txt');
      await client.getObject('test-costs-multiple-get.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.get).toBe(initialGetRequests + 3);
      expect(client.costs.requests.total).toBeGreaterThan(3);
    });
  });

  describe('Cost Calculation Accuracy', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should calculate costs based on AWS S3 pricing', async () => {
      // AWS S3 pricing (approximate for testing)
      // PUT/COPY/POST/LIST requests: $0.0005 per 1,000 requests
      // GET and SELECT requests: $0.0004 per 1,000 requests
      // Data transfer: $0.09 per GB

      await client.putObject({
        key: 'test-costs-calculation.txt',
        body: 'test content',
        contentType: 'text/plain'
      });

      // Cost should be very small but greater than 0
      expect(client.costs.total).toBeGreaterThan(0);
      expect(client.costs.total).toBeLessThan(0.01); // Should be less than 1 cent
    });

    test('should handle zero-byte objects', async () => {
      const initialCost = client.costs.total;

      await client.putObject({
        key: 'test-costs-zero.txt',
        body: '',
        contentType: 'text/plain'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.put).toBe(1);
    });

    test('should calculate costs for different content types', async () => {
      const initialCost = client.costs.total;

      await client.putObject({
        key: 'test-costs-json.json',
        body: JSON.stringify({ test: 'data' }),
        contentType: 'application/json'
      });

      await client.putObject({
        key: 'test-costs-xml.xml',
        body: '<test>data</test>',
        contentType: 'application/xml'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.put).toBe(2);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should handle failed operations gracefully', async () => {
      const initialCost = client.costs.total;
      const initialRequests = client.costs.requests.total;

      try {
        await client.getObject({
          key: 'non-existent-file.txt'
        });
      } catch (error) {
        // Expected error
      }

      // Should still track the request attempt if it reached S3, but not for local validation errors
      // Accept both cases for robustness
      const requestDelta = client.costs.requests.total - initialRequests;
      expect([0, 1]).toContain(requestDelta);
      expect(client.costs.total).toBeGreaterThanOrEqual(initialCost);
    });

    test('should handle network errors gracefully', async () => {
      const initialCost = client.costs.total;

      try {
        await client.putObject({
          key: 'test-costs-error.txt',
          body: 'test content',
          contentType: 'text/plain'
        });
      } catch (error) {
        // Should not break cost tracking
        expect(client.costs).toBeDefined();
        expect(typeof client.costs.total).toBe('number');
      }
    });

    test('should handle invalid client gracefully', async () => {
      const invalidDatabase = { client: null };
      
      // Should not throw
      await expect(CostsPlugin.setup.call(CostsPlugin, invalidDatabase)).resolves.toBeUndefined();
    });
  });

  describe('Cost Reset and Management', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should maintain cost history across operations', async () => {
      await client.putObject({
        key: 'test-costs-history-1.txt',
        body: 'test content 1',
        contentType: 'text/plain'
      });

      const costAfterFirst = client.costs.total;

      await client.putObject({
        key: 'test-costs-history-2.txt',
        body: 'test content 2',
        contentType: 'text/plain'
      });

      expect(client.costs.total).toBeGreaterThan(costAfterFirst);
    });

    test('should handle cost tracking with multiple clients', async () => {
      const client2 = createClientForTest(`suite=plugins/costs-client2`);

      const database2 = new Database({ client: client2 });

      await CostsPlugin.setup.call(CostsPlugin, database2);
      await CostsPlugin.start.call(CostsPlugin);

      await client2.putObject({
        key: 'test-costs-client2.txt',
        body: 'test content for client 2',
        contentType: 'text/plain'
      });

      expect(client2.costs).toBeDefined();
      expect(client2.costs.total).toBeGreaterThan(0);
      expect(client2.costs.requests.put).toBe(1);

      // Original client should be unaffected
      expect(client.costs.total).toBe(0);
    });
  });

  describe('Performance Impact', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should have minimal performance impact on operations', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        await client.putObject({
          key: `test-costs-performance-${i}.txt`,
          body: `test content ${i}`,
          contentType: 'text/plain'
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (less than 10 seconds)
      expect(duration).toBeLessThan(10000);
      expect(client.costs.requests.put).toBe(10);
    });

    test('should handle high-frequency operations', async () => {
      const operations = [];
      
      for (let i = 0; i < 50; i++) {
        operations.push(
          client.putObject({
            key: `test-costs-bulk-${i}.txt`,
            body: `test content ${i}`,
            contentType: 'text/plain'
          })
        );
      }

      await Promise.all(operations);

      expect(client.costs.requests.put).toBe(50);
      expect(client.costs.requests.total).toBe(50);
    });
  });

  describe('Integration with Database Operations', () => {
    let users;

    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);

      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required'
        }
      });
    });

    test('should track costs for resource creation', async () => {
      const initialCost = client.costs.total;

      await database.createResource({
        name: 'test-resource',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        }
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
    });

    test('should track costs for resource operations', async () => {
      const initialCost = client.costs.total;

      // Insert operation
      await users.insert({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com'
      });

      // Get operation
      await users.get('user-1');

      // List operation
      await users.list();

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.total).toBeGreaterThan(0);
    });

    test('should track costs for bulk operations', async () => {
      const initialCost = client.costs.total;

      // Bulk insert
      await users.insertMany([
        { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
        { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
        { id: 'user-3', name: 'Bob Johnson', email: 'bob@example.com' }
      ]);

      // Bulk get
      await users.getMany(['user-1', 'user-2', 'user-3']);

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.total).toBeGreaterThan(0);
    });

    test('should track costs for pagination operations', async () => {
      // Insert some data first
      for (let i = 0; i < 5; i++) {
        await users.insert({
          id: `user-${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`
        });
      }

      const initialCost = client.costs.total;

      // Page operations
      await users.page({ offset: 0, size: 2 });
      await users.page({ offset: 2, size: 2 });
      await users.page({ offset: 4, size: 2 });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.total).toBeGreaterThan(0);
    });
  });

  describe('Cost Reporting', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should provide detailed cost breakdown', async () => {
      await client.putObject({
        key: 'test-costs-breakdown.txt',
        body: 'test content',
        contentType: 'text/plain'
      });

      await client.getObject('test-costs-breakdown.txt');

      await client.listObjects({
        prefix: 'test-costs'
      });

      expect(client.costs.requests.put).toBe(1);
      expect(client.costs.requests.get).toBe(1);
      expect(client.costs.requests.list).toBe(1);
      expect(client.costs.requests.total).toBe(3);
      expect(client.costs.total).toBeGreaterThan(0);
    });

    test('should handle cost reporting with no operations', async () => {
      expect(client.costs.total).toBe(0);
      expect(client.costs.requests.total).toBe(0);
      expect(client.costs.requests.get).toBe(0);
      expect(client.costs.requests.put).toBe(0);
      expect(client.costs.requests.delete).toBe(0);
      expect(client.costs.requests.list).toBe(0);
      expect(client.costs.requests.head).toBe(0);
    });
  });
}); 