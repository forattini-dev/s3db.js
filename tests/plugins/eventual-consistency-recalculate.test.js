import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin - Recalculate", () => {
  let database;
  let urlsResource;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/ec-recalculate-test');
    await database.connect();

    // Create URLs resource
    urlsResource = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        shortUrl: 'string|required',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async' },
      verbose: false
    });

    await database.usePlugin(plugin);
    await plugin.start();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe("Basic Recalculate", () => {
    it("should recalculate from scratch with all transactions", async () => {
      const urlId = 'url-recalc-basic';

      // Create URL
      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/basic',
        clicks: 0
      });

      // Perform operations
      await urlsResource.set(urlId, 'clicks', 100);
      await urlsResource.add(urlId, 'clicks', 50);
      await urlsResource.add(urlId, 'clicks', 30);
      await urlsResource.sub(urlId, 'clicks', 20);

      // Wait for async processing
      await sleep(300);

      // Consolidate first time
      const firstConsolidation = await urlsResource.consolidate(urlId, 'clicks');
      expect(firstConsolidation).toBe(160); // 100 + 50 + 30 - 20

      // Verify URL was updated
      let url = await urlsResource.get(urlId);
      expect(url.clicks).toBe(160);

      // Verify transactions are marked as applied
      // Note: Plugin may create anchor transaction, so we expect at least 4
      let transactions = await database.resources.plg_urls_tx_clicks.query({
        originalId: urlId,
        applied: true
      });
      expect(transactions.length).toBeGreaterThanOrEqual(4);

      // Now recalculate from scratch
      const recalculatedValue = await urlsResource.recalculate(urlId, 'clicks');

      // Should get same result
      expect(recalculatedValue).toBe(160);

      // Verify URL still has correct value
      url = await urlsResource.get(urlId);
      expect(url.clicks).toBe(160);

      // Verify all transactions are now applied again
      transactions = await database.resources.plg_urls_tx_clicks.query({
        originalId: urlId,
        applied: true
      });
      expect(transactions.length).toBeGreaterThanOrEqual(4);
    });

    it("should recalculate with no transactions", async () => {
      const urlId = 'url-recalc-empty';

      // Create URL with no operations
      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/empty',
        clicks: 0
      });

      await sleep(100);

      // Recalculate should return 0
      const recalculatedValue = await urlsResource.recalculate(urlId, 'clicks');
      expect(recalculatedValue).toBe(0);
    });
  });

  describe("Recalculate with Mixed Transaction States", () => {
    it("should reset applied transactions to pending before recalculation", async () => {
      const urlId = 'url-recalc-mixed';

      // Create URL
      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/mixed',
        clicks: 0
      });

      // Add all transactions at once
      await urlsResource.add(urlId, 'clicks', 10);
      await urlsResource.add(urlId, 'clicks', 20);
      await urlsResource.add(urlId, 'clicks', 30);
      await urlsResource.add(urlId, 'clicks', 40);

      await sleep(200);

      // Consolidate to mark them all as applied
      const firstConsolidation = await urlsResource.consolidate(urlId, 'clicks');
      expect(firstConsolidation).toBe(100); // 10 + 20 + 30 + 40

      // Verify URL was updated
      let url = await urlsResource.get(urlId);
      expect(url.clicks).toBe(100);

      // All transactions should be applied
      let appliedTxns = await database.resources.plg_urls_tx_clicks.query({
        originalId: urlId,
        applied: true
      });
      // Should have 4 user transactions + possibly an anchor
      expect(appliedTxns.length).toBeGreaterThanOrEqual(4);

      // Recalculate - should reset ALL (except anchor) to pending and recalculate
      const recalculatedValue = await urlsResource.recalculate(urlId, 'clicks');

      // Should be: 10 + 20 + 30 + 40 = 100 (same result)
      expect(recalculatedValue).toBe(100);

      // Verify URL still has correct value
      url = await urlsResource.get(urlId);
      expect(url.clicks).toBe(100);

      // All transactions should be applied again
      appliedTxns = await database.resources.plg_urls_tx_clicks.query({
        originalId: urlId,
        applied: true
      });
      expect(appliedTxns.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Recalculate with Anchor Transactions", () => {
    it("should preserve anchor transactions during recalculation", async () => {
      const urlId = 'url-recalc-anchor';

      // Create URL
      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/anchor',
        clicks: 0
      });

      // Manually create an anchor transaction (simulates initial value)
      const now = new Date();
      await database.resources.plg_urls_tx_clicks.insert({
        id: 'anchor-txn-001',
        originalId: urlId,
        field: 'clicks',
        value: 1000,
        operation: 'set',
        source: 'anchor',  // This should NOT be reset
        applied: true,
        timestamp: now.toISOString(),  // Must be ISO string, not number
        cohortDate: now.toISOString().split('T')[0],
        cohortMonth: now.toISOString().slice(0, 7),
        cohortHour: now.toISOString().slice(0, 13)
      });

      // Add regular transactions
      await urlsResource.add(urlId, 'clicks', 50);
      await urlsResource.add(urlId, 'clicks', 25);

      await sleep(200);

      // Consolidate
      await urlsResource.consolidate(urlId, 'clicks');

      // Verify initial state
      let allTxns = await database.resources.plg_urls_tx_clicks.query({
        originalId: urlId
      });
      expect(allTxns.length).toBe(3); // 1 anchor + 2 regular

      // Recalculate
      const recalculatedValue = await urlsResource.recalculate(urlId, 'clicks');

      // Should be: 1000 (anchor) + 50 + 25 = 1075
      expect(recalculatedValue).toBe(1075);

      // Verify anchor transaction is STILL applied
      const anchorTxn = await database.resources.plg_urls_tx_clicks.get('anchor-txn-001');
      expect(anchorTxn.applied).toBe(true); // Should NOT have been reset
      expect(anchorTxn.source).toBe('anchor');
    });
  });

  describe("Recalculate with Complex Operations", () => {
    it("should handle complex mix of set/add/sub operations", async () => {
      const urlId = 'url-recalc-complex';

      // Create URL
      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/complex',
        clicks: 0
      });

      // Complex sequence
      await urlsResource.set(urlId, 'clicks', 500);   // Set to 500
      await urlsResource.add(urlId, 'clicks', 100);   // 500 + 100 = 600
      await urlsResource.add(urlId, 'clicks', 75);    // 600 + 75 = 675
      await urlsResource.sub(urlId, 'clicks', 125);   // 675 - 125 = 550
      await urlsResource.add(urlId, 'clicks', 50);    // 550 + 50 = 600
      await urlsResource.sub(urlId, 'clicks', 100);   // 600 - 100 = 500

      await sleep(300);

      // Consolidate first
      const firstValue = await urlsResource.consolidate(urlId, 'clicks');
      expect(firstValue).toBe(500);

      // Add more operations
      await urlsResource.add(urlId, 'clicks', 200);
      await urlsResource.sub(urlId, 'clicks', 50);

      await sleep(200);

      // Recalculate from scratch
      const recalculatedValue = await urlsResource.recalculate(urlId, 'clicks');

      // Should be: 500 + 100 + 75 - 125 + 50 - 100 + 200 - 50 = 650
      expect(recalculatedValue).toBe(650);

      // Verify URL
      const url = await urlsResource.get(urlId);
      expect(url.clicks).toBe(650);
    });
  });

  describe("Recalculate Error Handling", () => {
    it("should throw error if field parameter is missing", async () => {
      const urlId = 'url-recalc-error';

      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/error',
        clicks: 0
      });

      // Should throw error without field parameter
      await expect(async () => {
        await urlsResource.recalculate(urlId);
      }).rejects.toThrow('Field parameter is required');
    });

    it("should throw error if field is not configured for eventual consistency", async () => {
      const urlId = 'url-recalc-bad-field';

      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/badfield',
        clicks: 0
      });

      // Should throw error for non-existent field
      await expect(async () => {
        await urlsResource.recalculate(urlId, 'views');
      }).rejects.toThrow('No eventual consistency plugin found for field "views"');
    });
  });

  describe("Recalculate Partition Usage", () => {
    it("should use composite partition for efficient querying", async () => {
      const urlId = 'url-recalc-partition';

      // Create URL
      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/partition',
        clicks: 0
      });

      // Add transactions
      await urlsResource.add(urlId, 'clicks', 100);
      await urlsResource.add(urlId, 'clicks', 30);

      await sleep(300);

      // Consolidate first
      await urlsResource.consolidate(urlId, 'clicks');

      // Verify partition structure exists
      const transactionResource = database.resources.plg_urls_tx_clicks;
      expect(transactionResource.config.partitions).toBeDefined();
      expect(transactionResource.config.partitions.byOriginalIdAndApplied).toBeDefined();
      expect(transactionResource.config.partitions.byOriginalIdAndApplied.fields.originalId).toBe('string');
      expect(transactionResource.config.partitions.byOriginalIdAndApplied.fields.applied).toBe('boolean');

      // Recalculate - should use composite partition
      const recalculatedValue = await urlsResource.recalculate(urlId, 'clicks');

      // Should be: 100 + 30 = 130
      expect(recalculatedValue).toBe(130);
    }, 30000); // 30 second timeout
  });

  describe("Recalculate Performance", () => {
    it("should handle reasonable number of transactions", async () => {
      const urlId = 'url-recalc-performance';

      // Create URL
      await urlsResource.insert({
        id: urlId,
        shortUrl: 'https://short.link/perf',
        clicks: 0
      });

      // Add several transactions
      await urlsResource.add(urlId, 'clicks', 10);
      await urlsResource.add(urlId, 'clicks', 20);
      await urlsResource.add(urlId, 'clicks', 30);

      await sleep(300);

      // Consolidate first
      const consolidatedValue = await urlsResource.consolidate(urlId, 'clicks');
      expect(consolidatedValue).toBe(60);

      // Add more transactions
      await urlsResource.add(urlId, 'clicks', 40);

      await sleep(200);

      // Recalculate
      const recalculatedValue = await urlsResource.recalculate(urlId, 'clicks');
      expect(recalculatedValue).toBe(100);

      // Verify URL
      const url = await urlsResource.get(urlId);
      expect(url.clicks).toBe(100);
    }, 30000); // 30 second timeout
  });

  describe("Recalculate vs Consolidate Comparison", () => {
    it("should produce same result as consolidate", async () => {
      const urlId1 = 'url-compare-consolidate';
      const urlId2 = 'url-compare-recalculate';

      // Create two identical URLs
      await urlsResource.insert({
        id: urlId1,
        shortUrl: 'https://short.link/compare1',
        clicks: 0
      });

      await urlsResource.insert({
        id: urlId2,
        shortUrl: 'https://short.link/compare2',
        clicks: 0
      });

      // Perform same operations on both
      const operations = [
        { op: 'set', value: 100 },
        { op: 'add', value: 50 },
        { op: 'add', value: 75 },
        { op: 'sub', value: 25 },
        { op: 'add', value: 100 }
      ];

      for (const { op, value } of operations) {
        if (op === 'set') {
          await urlsResource.set(urlId1, 'clicks', value);
          await urlsResource.set(urlId2, 'clicks', value);
        } else if (op === 'add') {
          await urlsResource.add(urlId1, 'clicks', value);
          await urlsResource.add(urlId2, 'clicks', value);
        } else if (op === 'sub') {
          await urlsResource.sub(urlId1, 'clicks', value);
          await urlsResource.sub(urlId2, 'clicks', value);
        }
      }

      await sleep(300);

      // Use consolidate on first
      const consolidateResult = await urlsResource.consolidate(urlId1, 'clicks');

      // Use recalculate on second
      const recalculateResult = await urlsResource.recalculate(urlId2, 'clicks');

      // Should produce identical results
      expect(recalculateResult).toBe(consolidateResult);
      expect(recalculateResult).toBe(300); // 100 + 50 + 75 - 25 + 100
    });
  });

  describe("Recalculate Helper Method", () => {
    it("should have recalculate method available on resource", async () => {
      expect(typeof urlsResource.recalculate).toBe('function');
    });

    it("should work with multiple fields on same resource", async () => {
      // Create resource with multiple fields
      const statsResource = await database.createResource({
        name: 'stats',
        attributes: {
          id: 'string|optional',
          views: 'number|default:0',
          likes: 'number|default:0'
        }
      });

      const statsPlugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: {
          stats: ['views', 'likes']
        },
        consolidation: { mode: 'async' },
      });

      await database.usePlugin(statsPlugin);

      // Create stat record
      await statsResource.insert({
        id: 'stat-1',
        views: 0,
        likes: 0
      });

      // Add to both fields
      await statsResource.add('stat-1', 'views', 100);
      await statsResource.add('stat-1', 'views', 50);
      await statsResource.add('stat-1', 'likes', 10);
      await statsResource.add('stat-1', 'likes', 5);

      await sleep(300);

      // Recalculate both fields
      const viewsValue = await statsResource.recalculate('stat-1', 'views');
      const likesValue = await statsResource.recalculate('stat-1', 'likes');

      expect(viewsValue).toBe(150);
      expect(likesValue).toBe(15);

      // Verify resource was updated
      const stat = await statsResource.get('stat-1');
      expect(stat.views).toBe(150);
      expect(stat.likes).toBe(15);
    });
  });
});
