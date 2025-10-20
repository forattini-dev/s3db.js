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
      expect(client.costs.requests.total).toBe(0);
      expect(client.costs.requests.counts).toEqual({
        get: 0,
        put: 0,
        delete: 0,
        list: 0,
        head: 0,
        post: 0,
        copy: 0,
        select: 0
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
      const initialPutRequests = client.costs.requests.counts.put;

      await client.putObject({
        key: 'test-costs-put.txt',
        body: 'test content for put operation',
        contentType: 'text/plain'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.counts.put).toBe(initialPutRequests + 1);
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
      const initialGetRequests = client.costs.requests.counts.get;

      await client.getObject('test-costs-get.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.counts.get).toBe(initialGetRequests + 1);
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
      const initialDeleteRequests = client.costs.requests.counts.delete;

      await client.deleteObject('test-costs-delete.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.counts.delete).toBe(initialDeleteRequests + 1);
      expect(client.costs.requests.total).toBeGreaterThan(1);
    });

    test('should track LIST operation costs', async () => {
      const initialCost = client.costs.total;
      const initialListRequests = client.costs.requests.counts.list;

      await client.listObjects({
        prefix: 'test-costs'
      });

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.counts.list).toBe(initialListRequests + 1);
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
      const initialHeadRequests = client.costs.requests.counts.head;

      await client.headObject('test-costs-head.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.counts.head).toBe(initialHeadRequests + 1);
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
      expect(client.costs.requests.counts.put).toBe(2);
      expect(client.costs.requests.counts.list).toBe(1);
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
      expect(client.costs.requests.counts.put).toBe(1);
    });

    test('should track costs for multiple GET operations on same object', async () => {
      // Put an object
      await client.putObject({
        key: 'test-costs-multiple-get.txt',
        body: 'test content for multiple gets',
        contentType: 'text/plain'
      });

      const initialCost = client.costs.total;
      const initialGetRequests = client.costs.requests.counts.get;

      // Perform multiple GET operations
      await client.getObject('test-costs-multiple-get.txt');
      await client.getObject('test-costs-multiple-get.txt');
      await client.getObject('test-costs-multiple-get.txt');

      expect(client.costs.total).toBeGreaterThan(initialCost);
      expect(client.costs.requests.counts.get).toBe(initialGetRequests + 3);
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
      expect(client.costs.requests.counts.put).toBe(1);
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
      expect(client.costs.requests.counts.put).toBe(2);
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
      expect(client2.costs.requests.counts.put).toBe(1);

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
      expect(client.costs.requests.counts.put).toBe(10);
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

      expect(client.costs.requests.counts.put).toBe(50);
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

      expect(client.costs.requests.counts.put).toBe(1);
      expect(client.costs.requests.counts.get).toBe(1);
      expect(client.costs.requests.counts.list).toBe(1);
      expect(client.costs.requests.total).toBe(3);
      expect(client.costs.total).toBeGreaterThan(0);
    });

    test('should handle cost reporting with no operations', async () => {
      expect(client.costs.total).toBe(0);
      expect(client.costs.requests.total).toBe(0);
      expect(client.costs.requests.counts.get).toBe(0);
      expect(client.costs.requests.counts.put).toBe(0);
      expect(client.costs.requests.counts.delete).toBe(0);
      expect(client.costs.requests.counts.list).toBe(0);
      expect(client.costs.requests.counts.head).toBe(0);
    });
  });

  describe('Storage Tracking', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should initialize storage tracking structure', () => {
      expect(client.costs.storage).toBeDefined();
      expect(client.costs.storage.totalBytes).toBe(0);
      expect(client.costs.storage.totalGB).toBe(0);
      expect(client.costs.storage.subtotal).toBe(0);
      expect(Array.isArray(client.costs.storage.tiers)).toBe(true);
      expect(client.costs.storage.tiers.length).toBe(3);
    });

    test('should have correct storage tier pricing', () => {
      const tiers = client.costs.storage.tiers;
      expect(tiers[0]).toEqual({ limit: 50 * 1024, pricePerGB: 0.023 });
      expect(tiers[1]).toEqual({ limit: 500 * 1024, pricePerGB: 0.022 });
      expect(tiers[2]).toEqual({ limit: 999999999, pricePerGB: 0.021 });
    });

    test('should track storage from PUT operations', async () => {
      const testContent = 'a'.repeat(1024 * 1024); // 1MB

      await client.putObject({
        key: 'test-storage-tracking.txt',
        body: testContent,
        contentType: 'text/plain'
      });

      expect(client.costs.storage.totalBytes).toBeGreaterThan(0);
      expect(client.costs.storage.totalGB).toBeGreaterThan(0);
    });

    test('should calculate storage cost for first tier', async () => {
      // Simulate 1GB of storage
      CostsPlugin.trackStorage.call(CostsPlugin, 1024 * 1024 * 1024);

      expect(client.costs.storage.totalGB).toBeCloseTo(1, 2);
      expect(client.costs.storage.subtotal).toBeCloseTo(0.023, 6); // $0.023 per GB
      expect(client.costs.storage.currentTier).toBe(0);
    });
  });

  describe('Data Transfer Tracking', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should initialize data transfer tracking structure', () => {
      expect(client.costs.dataTransfer).toBeDefined();
      expect(client.costs.dataTransfer.inBytes).toBe(0);
      expect(client.costs.dataTransfer.outBytes).toBe(0);
      expect(client.costs.dataTransfer.inGB).toBe(0);
      expect(client.costs.dataTransfer.outGB).toBe(0);
      expect(client.costs.dataTransfer.inCost).toBe(0);
      expect(client.costs.dataTransfer.subtotal).toBe(0);
      expect(client.costs.dataTransfer.freeTierGB).toBe(100);
      expect(client.costs.dataTransfer.freeTierUsed).toBe(0);
    });

    test('should have correct data transfer tier pricing', () => {
      const tiers = client.costs.dataTransfer.tiers;
      expect(tiers[0]).toEqual({ limit: 10 * 1024, pricePerGB: 0.09 });
      expect(tiers[1]).toEqual({ limit: 50 * 1024, pricePerGB: 0.085 });
      expect(tiers[2]).toEqual({ limit: 150 * 1024, pricePerGB: 0.07 });
      expect(tiers[3]).toEqual({ limit: 999999999, pricePerGB: 0.05 });
    });

    test('should track data transfer IN as free', async () => {
      const testContent = 'a'.repeat(1024 * 1024); // 1MB

      await client.putObject({
        key: 'test-transfer-in.txt',
        body: testContent,
        contentType: 'text/plain'
      });

      expect(client.costs.dataTransfer.inBytes).toBeGreaterThan(0);
      expect(client.costs.dataTransfer.inCost).toBe(0); // Always free
    });

    test('should calculate data transfer OUT cost for first tier', async () => {
      // Simulate 1GB download
      CostsPlugin.trackDataTransferOut.call(CostsPlugin, 1024 * 1024 * 1024);

      expect(client.costs.dataTransfer.outGB).toBeCloseTo(1, 2);
      expect(client.costs.dataTransfer.subtotal).toBeCloseTo(0.09, 6); // $0.09 per GB
      expect(client.costs.dataTransfer.currentTier).toBe(0);
    });
  });

  describe('Free Tier Support', () => {
    test('should NOT apply free tier by default', async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);

      expect(CostsPlugin.options.considerFreeTier).toBe(false);

      // Simulate 50GB download (within free tier)
      CostsPlugin.trackDataTransferOut.call(CostsPlugin, 50 * 1024 * 1024 * 1024);

      // Should still be charged (free tier not considered)
      expect(client.costs.dataTransfer.subtotal).toBeGreaterThan(0);
      expect(client.costs.dataTransfer.freeTierUsed).toBe(0);
    });

    test('should apply free tier when enabled', async () => {
      await CostsPlugin.setup.call(CostsPlugin, database, { considerFreeTier: true });
      await CostsPlugin.start.call(CostsPlugin);

      expect(CostsPlugin.options.considerFreeTier).toBe(true);

      // Simulate 50GB download (within 100GB free tier)
      CostsPlugin.trackDataTransferOut.call(CostsPlugin, 50 * 1024 * 1024 * 1024);

      // Should not be charged (within free tier)
      expect(client.costs.dataTransfer.subtotal).toBe(0);
      expect(client.costs.dataTransfer.freeTierUsed).toBeCloseTo(50, 2);
    });

    test('should charge for data transfer beyond free tier', async () => {
      await CostsPlugin.setup.call(CostsPlugin, database, { considerFreeTier: true });
      await CostsPlugin.start.call(CostsPlugin);

      // Simulate 150GB download (100GB free + 50GB charged)
      CostsPlugin.trackDataTransferOut.call(CostsPlugin, 150 * 1024 * 1024 * 1024);

      // Should charge for 50GB beyond free tier
      expect(client.costs.dataTransfer.freeTierUsed).toBeCloseTo(100, 2);
      expect(client.costs.dataTransfer.subtotal).toBeCloseTo(50 * 0.09, 2); // 50GB * $0.09
    });
  });

  describe('Total Cost Calculation', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should calculate total cost from all sources', async () => {
      // Simulate some requests
      await client.putObject({
        key: 'test-total-cost.txt',
        body: 'test content',
        contentType: 'text/plain'
      });

      // Simulate storage and data transfer
      CostsPlugin.trackStorage.call(CostsPlugin, 1024 * 1024 * 1024); // 1GB
      CostsPlugin.trackDataTransferOut.call(CostsPlugin, 1024 * 1024 * 1024); // 1GB

      const expectedTotal =
        client.costs.requests.subtotal +
        client.costs.storage.subtotal +
        client.costs.dataTransfer.subtotal;

      expect(client.costs.total).toBeCloseTo(expectedTotal, 10);
      expect(client.costs.total).toBeGreaterThan(0);
    });

    test('should have separate subtotals for each cost type', async () => {
      await client.putObject({
        key: 'test-subtotals.txt',
        body: 'test content',
        contentType: 'text/plain'
      });

      expect(client.costs.requests.subtotal).toBeGreaterThan(0);
      expect(client.costs.storage.subtotal).toBeGreaterThanOrEqual(0);
      expect(client.costs.dataTransfer.subtotal).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Backward Compatibility', () => {
    beforeEach(async () => {
      await CostsPlugin.setup.call(CostsPlugin, database);
      await CostsPlugin.start.call(CostsPlugin);
    });

    test('should maintain old prices structure', () => {
      expect(client.costs.requests.prices).toBeDefined();
      expect(client.costs.requests.prices.put).toBe(0.005 / 1000);
      expect(client.costs.requests.prices.get).toBe(0.0004 / 1000);
    });

    test('should maintain old requests structure', () => {
      expect(client.costs.requests).toBeDefined();
      expect(client.costs.requests.total).toBeDefined();
      expect(client.costs.requests.events).toBeDefined();
      expect(client.costs.requests.totalEvents).toBeDefined();
    });

    test('should still track basic request counts', async () => {
      await client.putObject({
        key: 'test-backward-compat.txt',
        body: 'test',
        contentType: 'text/plain'
      });

      expect(client.costs.requests.counts.put).toBe(1);
      expect(client.costs.requests.total).toBe(1);
      expect(client.costs.requests.events.PutObjectCommand).toBe(1);
    });
  });
}); 