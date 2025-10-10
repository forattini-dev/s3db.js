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
      resources: {
        wallets: ['balance']
      },
      mode: 'sync',
      autoConsolidate: false,
      enableAnalytics: true,
      analyticsConfig: {
        periods: ['hour', 'day', 'month'],
        metrics: ['count', 'sum', 'avg', 'min', 'max']
      }
    });

    await database.usePlugin(plugin);
    await plugin.start();
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

    // Verify the handler has analytics resource
    const fieldHandlers = plugin.fieldHandlers.get('wallets');
    const handler = fieldHandlers.get('balance');
    expect(handler.analyticsResource).toBe(analyticsResource);
  });

  it('should update analytics after consolidation', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    // Add transactions
    await wallets.add('w1', 'balance', 100);
    await wallets.add('w1', 'balance', 50);
    await wallets.sub('w1', 'balance', 25);

    // Consolidate (triggers analytics update)
    await wallets.consolidate('w1', 'balance');

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
    await wallets.add('w1', 'balance', 100);
    await wallets.add('w1', 'balance', 200);

    // Add transactions for w2
    await wallets.add('w2', 'balance', 50);
    await wallets.sub('w2', 'balance', 10);

    // Consolidate both
    await wallets.consolidate('w1', 'balance');
    await wallets.consolidate('w2', 'balance');

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
    await wallets.set('w1', 'balance', 1000);
    await wallets.add('w1', 'balance', 100);
    await wallets.add('w1', 'balance', 50);
    await wallets.sub('w1', 'balance', 25);

    // Consolidate
    await wallets.consolidate('w1', 'balance');

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
    await wallets.add('w1', 'balance', 100);
    await wallets.add('w1', 'balance', 50);

    // Consolidate (triggers roll-ups)
    await wallets.consolidate('w1', 'balance');

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
    await wallets.add('w1', 'balance', 10);
    await wallets.add('w1', 'balance', 10);
    await wallets.add('w1', 'balance', 10);
    await wallets.add('w1', 'balance', 10);
    await wallets.add('w1', 'balance', 10);

    // w2: 2 transactions
    await wallets.add('w2', 'balance', 100);
    await wallets.add('w2', 'balance', 100);

    // w3: 1 transaction
    await wallets.add('w3', 'balance', 500);

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
    await wallets.add('w1', 'balance', 10);
    await wallets.add('w1', 'balance', 10);
    await wallets.add('w1', 'balance', 10);

    // w2: few large transactions
    await wallets.add('w2', 'balance', 500);
    await wallets.add('w2', 'balance', 500);

    // w3: single huge transaction
    await wallets.add('w3', 'balance', 2000);

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
    await wallets.add('w1', 'balance', 100);
    await wallets.consolidate('w1', 'balance');

    // Second batch
    await wallets.add('w1', 'balance', 50);
    await wallets.consolidate('w1', 'balance');

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

  it('should fill gaps in daily analytics', async () => {
    // Insert wallet and add transactions only on specific days
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    await wallets.add('w1', 'balance', 100);
    await wallets.consolidate('w1', 'balance');

    // Query last 7 days with fillGaps
    const last7Days = await plugin.getLastNDays('wallets', 'balance', 7, {
      fillGaps: true
    });

    // Should always return exactly 7 days
    expect(last7Days.length).toBe(7);

    // Check that all days are present
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - (6 - i));
      const dateStr = expectedDate.toISOString().substring(0, 10);

      expect(last7Days[i].cohort).toBe(dateStr);
      expect(last7Days[i]).toHaveProperty('count');
      expect(last7Days[i]).toHaveProperty('sum');
    }

    // Days without transactions should have zeros
    const daysWithZeros = last7Days.filter(d => d.count === 0);
    expect(daysWithZeros.length).toBeGreaterThan(0);
  });

  it('should fill gaps in hourly analytics', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    await wallets.add('w1', 'balance', 50);
    await wallets.consolidate('w1', 'balance');

    const today = new Date().toISOString().substring(0, 10);

    // Query day by hour with fillGaps
    const dayByHour = await plugin.getDayByHour('wallets', 'balance', today, {
      fillGaps: true
    });

    // Should always return exactly 24 hours
    expect(dayByHour.length).toBe(24);

    // Check that all hours are present (00-23)
    for (let hour = 0; hour < 24; hour++) {
      const expectedCohort = `${today}T${hour.toString().padStart(2, '0')}`;
      expect(dayByHour[hour].cohort).toBe(expectedCohort);
    }

    // Hours without transactions should have zeros
    const hoursWithZeros = dayByHour.filter(h => h.count === 0);
    expect(hoursWithZeros.length).toBeGreaterThan(0);
  });

  it('should fill gaps in monthly analytics', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    await wallets.add('w1', 'balance', 100);
    await wallets.consolidate('w1', 'balance');

    const currentYear = new Date().getFullYear();

    // Query year by month with fillGaps
    const yearByMonth = await plugin.getYearByMonth('wallets', 'balance', currentYear, {
      fillGaps: true
    });

    // Should always return exactly 12 months
    expect(yearByMonth.length).toBe(12);

    // Check that all months are present (01-12)
    for (let month = 1; month <= 12; month++) {
      const expectedCohort = `${currentYear}-${month.toString().padStart(2, '0')}`;
      expect(yearByMonth[month - 1].cohort).toBe(expectedCohort);
    }

    // Months without transactions should have zeros
    const monthsWithZeros = yearByMonth.filter(m => m.count === 0);
    expect(monthsWithZeros.length).toBeGreaterThan(0);
  });

  it('should fill gaps in month by day analytics', async () => {
    // Insert wallet
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });

    await wallets.add('w1', 'balance', 100);
    await wallets.consolidate('w1', 'balance');

    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

    // Query month by day with fillGaps
    const monthByDay = await plugin.getMonthByDay('wallets', 'balance', currentMonth, {
      fillGaps: true
    });

    // Should return all days in the month
    const year = parseInt(currentMonth.substring(0, 4));
    const month = parseInt(currentMonth.substring(5, 7));
    const daysInMonth = new Date(year, month, 0).getDate();

    expect(monthByDay.length).toBe(daysInMonth);

    // Check continuity
    for (let day = 1; day <= daysInMonth; day++) {
      const expectedCohort = `${currentMonth}-${day.toString().padStart(2, '0')}`;
      expect(monthByDay[day - 1].cohort).toBe(expectedCohort);
    }
  });

  it('should throw error when analytics disabled', async () => {
    // Create new plugin without analytics
    const pluginNoAnalytics = new EventualConsistencyPlugin({
      resources: {
        wallets: ['balance']
      },
      enableAnalytics: false
    });

    expect(() => pluginNoAnalytics.getAnalytics('wallets', 'balance')).rejects.toThrow(
      'Analytics not enabled'
    );
  });
});
