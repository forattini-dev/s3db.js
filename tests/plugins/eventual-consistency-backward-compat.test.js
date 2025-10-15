/**
 * Test backward compatibility for EventualConsistencyPlugin
 * Ensures legacy transactions without cohort fields are handled correctly
 */

import S3db from '../../src/database.class.js';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';

describe('EventualConsistencyPlugin - Backward Compatibility', () => {
  let db;
  let urls;
  let plugin;

  beforeEach(async () => {
    db = new S3db({
      connectionString: process.env.S3DB_CONNECTION || 's3://test:test@localhost:9000/test-bucket',
      prefix: `test-ec-backcompat-${Date.now()}`
    });
    await db.connect();

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: {
        mode: 'sync',
        auto: false
      },
      verbose: false
    });

    await db.usePlugin(plugin);

    urls = await db.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|required',
        clicks: 'number|default:0'
      }
    });
  });

  afterEach(async () => {
    if (db) await db.disconnect();
  });

  test('handles legacy transaction without cohortHour field', async () => {
    const urlId = 'test-url-1';

    // 1. Create record
    await urls.insert({ id: urlId, link: 'http://example.com', clicks: 0 });

    // 2. Get transaction resource
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const txResource = handler.transactionResource;

    // 3. Manually create LEGACY transaction (missing cohortHour)
    const now = new Date();
    const legacyTransaction = {
      id: 'legacy-tx-1',
      originalId: urlId,
      field: 'clicks',
      value: 5,
      operation: 'add',
      timestamp: now.toISOString(),
      // ❌ Missing: cohortHour, cohortDate, cohortWeek
      cohortMonth: now.toISOString().substring(0, 7),  // Only month exists
      applied: false
    };

    await txResource.insert(legacyTransaction);

    // 4. Consolidate (should fill missing cohort fields)
    await urls.consolidate(urlId, 'clicks');

    // 5. Verify record updated correctly
    const url = await urls.get(urlId);
    expect(url.clicks).toBe(5);

    // 6. Verify transaction was marked as applied WITH cohort fields
    const updatedTx = await txResource.get('legacy-tx-1');
    expect(updatedTx.applied).toBe(true);
    expect(updatedTx.cohortHour).toBeDefined();
    expect(updatedTx.cohortDate).toBeDefined();
    expect(updatedTx.cohortWeek).toBeDefined();
    expect(updatedTx.cohortHour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);  // YYYY-MM-DDTHH format
  });

  test('handles legacy transaction with null value field', async () => {
    const urlId = 'test-url-2';

    // 1. Create record
    await urls.insert({ id: urlId, link: 'http://example.com', clicks: 0 });

    // 2. Get transaction resource
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const txResource = handler.transactionResource;

    // 3. Create legacy transaction with NULL value
    const now = new Date();
    const legacyTransaction = {
      id: 'legacy-tx-2',
      originalId: urlId,
      field: 'clicks',
      value: null,  // ❌ NULL value (invalid)
      operation: 'add',
      timestamp: now.toISOString(),
      cohortMonth: now.toISOString().substring(0, 7),
      applied: false
    };

    await txResource.insert(legacyTransaction);

    // 4. Consolidate (should default null value to 1)
    await urls.consolidate(urlId, 'clicks');

    // 5. Verify transaction was updated with default value
    const updatedTx = await txResource.get('legacy-tx-2');
    expect(updatedTx.applied).toBe(true);
    expect(updatedTx.value).toBe(1);  // Defaulted to 1

    // 6. Verify record updated
    const url = await urls.get(urlId);
    expect(url.clicks).toBe(1);
  });

  test('handles multiple legacy transactions in batch', async () => {
    const urlId = 'test-url-3';

    // 1. Create record
    await urls.insert({ id: urlId, link: 'http://example.com', clicks: 0 });

    // 2. Get transaction resource
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const txResource = handler.transactionResource;

    // 3. Create multiple legacy transactions
    const now = new Date();
    const legacyTransactions = [];

    for (let i = 0; i < 10; i++) {
      const tx = {
        id: `legacy-tx-batch-${i}`,
        originalId: urlId,
        field: 'clicks',
        value: i % 2 === 0 ? null : 1,  // Mix of null and valid
        operation: 'add',
        timestamp: new Date(now.getTime() + i * 1000).toISOString(),
        // Missing cohortHour, cohortDate, cohortWeek
        cohortMonth: now.toISOString().substring(0, 7),
        applied: false
      };
      legacyTransactions.push(tx);
    }

    // Insert all in parallel
    await Promise.all(legacyTransactions.map(tx => txResource.insert(tx)));

    // 4. Consolidate (should handle all at once)
    await urls.consolidate(urlId, 'clicks');

    // 5. Verify all transactions updated
    const updatedTxs = await Promise.all(
      legacyTransactions.map(tx => txResource.get(tx.id))
    );

    for (const tx of updatedTxs) {
      expect(tx.applied).toBe(true);
      expect(tx.cohortHour).toBeDefined();
      expect(tx.cohortDate).toBeDefined();
      expect(tx.cohortWeek).toBeDefined();
      expect(tx.value).toBeGreaterThan(0);  // All should have valid value now
    }

    // 6. Verify final record value
    const url = await urls.get(urlId);
    // 5 nulls → default 1 each = 5, plus 5 explicit 1s = 10 total
    expect(url.clicks).toBe(10);
  });

  test('preserves existing cohort fields when present', async () => {
    const urlId = 'test-url-4';

    // 1. Create record
    await urls.insert({ id: urlId, link: 'http://example.com', clicks: 0 });

    // 2. Get transaction resource
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const txResource = handler.transactionResource;

    // 3. Create transaction with SOME cohort fields present
    const now = new Date();
    const partialTransaction = {
      id: 'partial-tx-1',
      originalId: urlId,
      field: 'clicks',
      value: 3,
      operation: 'add',
      timestamp: now.toISOString(),
      cohortDate: '2025-10-15',  // ✅ Has cohortDate
      cohortMonth: '2025-10',     // ✅ Has cohortMonth
      // ❌ Missing: cohortHour, cohortWeek
      applied: false
    };

    await txResource.insert(partialTransaction);

    // 4. Consolidate
    await urls.consolidate(urlId, 'clicks');

    // 5. Verify transaction updated
    const updatedTx = await txResource.get('partial-tx-1');
    expect(updatedTx.applied).toBe(true);
    expect(updatedTx.cohortDate).toBe('2025-10-15');  // Preserved
    expect(updatedTx.cohortMonth).toBe('2025-10');    // Preserved
    expect(updatedTx.cohortHour).toBeDefined();        // Added
    expect(updatedTx.cohortWeek).toBeDefined();        // Added
  });

  test('v11.1.0 schema compatibility', async () => {
    // Simulate v11.1.0 transaction format
    const urlId = 'test-url-5';

    await urls.insert({ id: urlId, link: 'http://example.com', clicks: 0 });

    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const txResource = handler.transactionResource;

    // v11.1.0 had cohortHour as required, but some transactions might lack it
    const v1110Transaction = {
      id: 'v1110-tx',
      originalId: urlId,
      field: 'clicks',
      value: 7,
      operation: 'add',
      timestamp: '2025-10-15T14:30:00.000Z',
      cohortDate: '2025-10-15',
      cohortMonth: '2025-10',
      // ❌ Missing cohortHour (was required in v11.1.0)
      applied: false
    };

    await txResource.insert(v1110Transaction);
    await urls.consolidate(urlId, 'clicks');

    const updatedTx = await txResource.get('v1110-tx');
    expect(updatedTx.applied).toBe(true);
    expect(updatedTx.cohortHour).toBe('2025-10-15T14');  // Calculated from timestamp
  });

  test('v11.2.0 schema compatibility', async () => {
    // Simulate v11.2.0 transaction format with null value error
    const urlId = 'test-url-6';

    await urls.insert({ id: urlId, link: 'http://example.com', clicks: 0 });

    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const txResource = handler.transactionResource;

    // v11.2.0 reported: value must be a number, got null
    const v1120Transaction = {
      id: 'v1120-tx',
      originalId: urlId,
      field: 'clicks',
      value: null,  // ❌ NULL (caused validation error in v11.2.0)
      operation: 'add',
      timestamp: '2025-10-15T16:45:00.000Z',
      // ❌ Missing cohortDate (was required in v11.2.0)
      cohortHour: '2025-10-15T16',
      cohortMonth: '2025-10',
      applied: false
    };

    await txResource.insert(v1120Transaction);
    await urls.consolidate(urlId, 'clicks');

    const updatedTx = await txResource.get('v1120-tx');
    expect(updatedTx.applied).toBe(true);
    expect(updatedTx.value).toBe(1);  // Defaulted from null
    expect(updatedTx.cohortDate).toBe('2025-10-15');  // Calculated
  });
});
