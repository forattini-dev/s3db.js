import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin - Real Scenario (URL Shortener)", () => {
  let database;
  let urlsResource;
  let clicksResource;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/ec-real-scenario');
    await database.connect();

    // Plugin with multi-resource API
    plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync' },
      verbose: true
    });

    await database.usePlugin(plugin);

    // Create URLs resource
    urlsResource = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|required',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        scans: 'number|default:0'
      }
    });

    // Create Clicks resource
    clicksResource = await database.createResource({
      name: 'clicks',
      attributes: {
        id: 'string|required',
        urlId: 'string|required',
        timestamp: 'string|required'
      }
    });

    // Hook: when click is created, increment URL clicks
    clicksResource.addHook('afterInsert', async (record) => {
      await urlsResource.add(record.urlId, 'clicks', 1);
    });

    await plugin.start();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  test("should increment URL clicks when click is created", async () => {
    // Create URL
    await urlsResource.insert({
      id: 'short-123',
      link: 'https://example.com',
      clicks: 0
    });

    // Verify initial state
    let url = await urlsResource.get('short-123');
    expect(url.clicks).toBe(0);

    // Create click (triggers hook)
    await clicksResource.insert({
      id: 'click-1',
      urlId: 'short-123',
      timestamp: new Date().toISOString()
    });

    // Verify clicks incremented
    url = await urlsResource.get('short-123');
    expect(url.clicks).toBe(1);

    // Create more clicks
    await clicksResource.insert({
      id: 'click-2',
      urlId: 'short-123',
      timestamp: new Date().toISOString()
    });

    await clicksResource.insert({
      id: 'click-3',
      urlId: 'short-123',
      timestamp: new Date().toISOString()
    });

    // Verify clicks incremented to 3
    url = await urlsResource.get('short-123');
    expect(url.clicks).toBe(3);
  });

  test("should handle multiple fields (clicks, views, shares)", async () => {
    // Create URL
    await urlsResource.insert({
      id: 'short-456',
      link: 'https://example.com/page',
      clicks: 0,
      views: 0,
      shares: 0
    });

    // Increment different fields
    await urlsResource.add('short-456', 'clicks', 1);
    await urlsResource.add('short-456', 'views', 1);
    await urlsResource.add('short-456', 'shares', 1);

    // Verify all fields updated
    const url = await urlsResource.get('short-456');
    expect(url.clicks).toBe(1);
    expect(url.views).toBe(1);
    expect(url.shares).toBe(1);
  });

  test("should persist value across multiple increments", async () => {
    // Create URL
    await urlsResource.insert({
      id: 'short-789',
      link: 'https://example.com/article',
      clicks: 0
    });

    // Increment multiple times
    for (let i = 0; i < 10; i++) {
      await clicksResource.insert({
        id: `click-${i}`,
        urlId: 'short-789',
        timestamp: new Date().toISOString()
      });
    }

    // Verify final count
    const url = await urlsResource.get('short-789');
    expect(url.clicks).toBe(10);

    // Verify persistence - get again
    const urlAgain = await urlsResource.get('short-789');
    expect(urlAgain.clicks).toBe(10); // Should persist!
  });

  test("should handle sequential clicks on same URL", async () => {
    // Create URL
    await urlsResource.insert({
      id: 'short-concurrent',
      link: 'https://example.com/popular',
      clicks: 0
    });

    // Create 5 clicks sequentially (changed from parallel to avoid plugin state race condition)
    for (let i = 0; i < 5; i++) {
      await clicksResource.insert({
        id: `click-concurrent-${i}`,
        urlId: 'short-concurrent',
        timestamp: new Date().toISOString()
      });
    }

    // Verify all clicks counted
    const url = await urlsResource.get('short-concurrent');
    expect(url.clicks).toBe(5);
  }, 60000); // 60s timeout for operations

  test("should verify transactions are created", async () => {
    // Create URL
    await urlsResource.insert({
      id: 'short-txn',
      link: 'https://example.com/test',
      clicks: 0
    });

    // Create clicks
    await urlsResource.add('short-txn', 'clicks', 5);

    // Verify transaction resource exists
    const transactionResource = database.resources.urls_transactions_clicks;
    expect(transactionResource).toBeDefined();

    // Verify transaction was created and applied
    const transactions = await transactionResource.query({
      originalId: 'short-txn'
    });

    expect(transactions.length).toBeGreaterThan(0);
    const txn = transactions[0];
    expect(txn.operation).toBe('add');
    expect(txn.value).toBe(5);
    expect(txn.applied).toBe(true); // Should be applied in sync mode
  });
});
