/**
 * EventualConsistencyPlugin Analytics Tests
 * Tests the analytics functionality (aggregations, roll-ups, queries)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency.plugin.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin Analytics', () => {
  let database;
  let wallets;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-analytics');

    // Create wallets resource
    wallets = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        balance: 'number|default:0'
      }
    });

    // Add EventualConsistencyPlugin with analytics enabled
    plugin = new EventualConsistencyPlugin({
      resource: 'wallets',
      field: 'balance',
      mode: 'sync',
      autoConsolidate: false,
      enableAnalytics: true,
      analyticsConfig: {
        periods: ['hour', 'day', 'month'],
        metrics: ['count', 'sum', 'avg', 'min', 'max']
      }
    });

    await database.usePlugin(plugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should create analytics resource when enabled', async () => {
    const analyticsResourceName = 'wallets_analytics_balance';
    const analyticsResource = database.resources[analyticsResourceName];

    expect(analyticsResource).toBeDefined();
    expect(plugin.analyticsResource).toBe(analyticsResource);
  });

  it('should update analytics after consolidation', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    // Add transactions
    await wallets.add('w1', 100);
    await wallets.add('w1', 50);
    await wallets.sub('w1', 25);

    // Consolidate (triggers analytics update)
    await wallets.consolidate('w1');

    // Check analytics were created
    const analyticsResource = database.resources.wallets_analytics_balance;
    const analytics = await analyticsResource.list();

    expect(analytics.length).toBeGreaterThan(0);

    // Find hourly analytics
    const hourlyAnalytics = analytics.find(a => a.period === 'hour');
    expect(hourlyAnalytics).toBeDefined();
    expect(hourlyAnalytics.transactionCount).toBe(3);
    expect(hourlyAnalytics.totalValue).toBe(125); // 100 + 50 - 25
    expect(hourlyAnalytics.recordCount).toBe(1); // Single wallet
  });

  it('should aggregate metrics correctly', async () => {
    // Insert wallets
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });
    await wallets.insert({ id: 'w2', userId: 'u2', balance: 0 });

    // Add transactions for w1
    await wallets.add('w1', 100);
    await wallets.add('w1', 200);

    // Add transactions for w2
    await wallets.add('w2', 50);
    await wallets.sub('w2', 10);

    // Consolidate both
    await wallets.consolidate('w1');
    await wallets.consolidate('w2');

    // Query analytics
    const today = new Date().toISOString().substring(0, 10);
    const analytics = await plugin.getAnalytics('wallets', 'balance', {
      period: 'hour',
      date: today
    });

    expect(analytics.length).toBeGreaterThan(0);

    const hourStats = analytics[0];
    expect(hourStats.count).toBe(4); // Total 4 transactions
    expect(hourStats.sum).toBe(340); // 100 + 200 + 50 - 10
    expect(hourStats.min).toBe(-10); // Subtraction
    expect(hourStats.max).toBe(200); // Largest add
    // Note: recordCount shows max distinct records per consolidation batch, not total unique records
    expect(hourStats.recordCount).toBeGreaterThan(0);
  });

  it('should breakdown by operation', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    // Add different operations
    await wallets.set('w1', 1000);
    await wallets.add('w1', 100);
    await wallets.add('w1', 50);
    await wallets.sub('w1', 25);

    // Consolidate
    await wallets.consolidate('w1');

    // Query with operations breakdown
    const today = new Date().toISOString().substring(0, 10);
    const analytics = await plugin.getAnalytics('wallets', 'balance', {
      period: 'hour',
      date: today,
      breakdown: 'operations'
    });

    expect(analytics.length).toBeGreaterThan(0);

    const breakdowns = analytics[0];
    expect(breakdowns.set).toBeDefined();
    expect(breakdowns.set.count).toBe(1);
    expect(breakdowns.set.sum).toBe(1000);

    expect(breakdowns.add).toBeDefined();
    expect(breakdowns.add.count).toBe(2);
    expect(breakdowns.add.sum).toBe(150);

    expect(breakdowns.sub).toBeDefined();
    expect(breakdowns.sub.count).toBe(1);
    expect(breakdowns.sub.sum).toBe(-25);
  });

  it('should roll up hourly to daily analytics', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    // Add transactions
    await wallets.add('w1', 100);
    await wallets.add('w1', 50);

    // Consolidate (triggers roll-ups)
    await wallets.consolidate('w1');

    // Query daily analytics
    const today = new Date().toISOString().substring(0, 10);
    const dailyAnalytics = await plugin.getAnalytics('wallets', 'balance', {
      period: 'day',
      date: today
    });

    expect(dailyAnalytics.length).toBeGreaterThan(0);

    const dayStats = dailyAnalytics[0];
    expect(dayStats.count).toBe(2);
    expect(dayStats.sum).toBe(150);
    expect(dayStats.cohort).toBe(today);
  });

  it('should get top records by transaction count', async () => {
    // Insert multiple wallets
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });
    await wallets.insert({ id: 'w2', userId: 'u2', balance: 0 });
    await wallets.insert({ id: 'w3', userId: 'u3', balance: 0 });

    // w1: 5 transactions
    await wallets.add('w1', 10);
    await wallets.add('w1', 10);
    await wallets.add('w1', 10);
    await wallets.add('w1', 10);
    await wallets.add('w1', 10);

    // w2: 2 transactions
    await wallets.add('w2', 100);
    await wallets.add('w2', 100);

    // w3: 1 transaction
    await wallets.add('w3', 500);

    // Don't need to consolidate for getTopRecords (queries transactions directly)

    const today = new Date().toISOString().substring(0, 10);
    const topRecords = await plugin.getTopRecords('wallets', 'balance', {
      period: 'day',
      date: today,
      metric: 'transactionCount',
      limit: 3
    });

    expect(topRecords.length).toBe(3);
    expect(topRecords[0].recordId).toBe('w1');
    expect(topRecords[0].count).toBe(5);
    expect(topRecords[1].recordId).toBe('w2');
    expect(topRecords[1].count).toBe(2);
    expect(topRecords[2].recordId).toBe('w3');
    expect(topRecords[2].count).toBe(1);
  });

  it('should get top records by total value', async () => {
    // Insert wallets
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });
    await wallets.insert({ id: 'w2', userId: 'u2', balance: 0 });
    await wallets.insert({ id: 'w3', userId: 'u3', balance: 0 });

    // w1: many small transactions
    await wallets.add('w1', 10);
    await wallets.add('w1', 10);
    await wallets.add('w1', 10);

    // w2: few large transactions
    await wallets.add('w2', 500);
    await wallets.add('w2', 500);

    // w3: single huge transaction
    await wallets.add('w3', 2000);

    const today = new Date().toISOString().substring(0, 10);
    const topRecords = await plugin.getTopRecords('wallets', 'balance', {
      period: 'day',
      date: today,
      metric: 'totalValue',
      limit: 3
    });

    expect(topRecords.length).toBe(3);
    expect(topRecords[0].recordId).toBe('w3');
    expect(topRecords[0].sum).toBe(2000);
    expect(topRecords[1].recordId).toBe('w2');
    expect(topRecords[1].sum).toBe(1000);
    expect(topRecords[2].recordId).toBe('w1');
    expect(topRecords[2].sum).toBe(30);
  });

  it('should handle incremental analytics updates', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    // First batch
    await wallets.add('w1', 100);
    await wallets.consolidate('w1');

    // Second batch
    await wallets.add('w1', 50);
    await wallets.consolidate('w1');

    // Check analytics were updated incrementally
    const today = new Date().toISOString().substring(0, 10);
    const analytics = await plugin.getAnalytics('wallets', 'balance', {
      period: 'hour',
      date: today
    });

    expect(analytics.length).toBeGreaterThan(0);

    const hourStats = analytics[0];
    expect(hourStats.count).toBe(2); // Both transactions
    expect(hourStats.sum).toBe(150); // Cumulative
  });

  it('should throw error when analytics disabled', async () => {
    // Create new plugin without analytics
    const pluginNoAnalytics = new EventualConsistencyPlugin({
      resource: 'wallets',
      field: 'balance',
      enableAnalytics: false
    });

    expect(() => pluginNoAnalytics.getAnalytics('wallets', 'balance')).rejects.toThrow(
      'Analytics not enabled'
    );
  });
});
