/**
 * EventualConsistencyPlugin TypeScript Test
 * Validates type definitions for eventual consistency functionality
 */

/// <reference path="../../src/s3db.d.ts" />

import type {
  EventualConsistencyPluginConfig,
  EventualConsistencyAnalyticsOptions,
  EventualConsistencyTopRecordsOptions,
  EventualConsistencyAnalyticsResult,
  EventualConsistencyTopRecordResult,
  EventualConsistencyCohortInfo,
  EventualConsistencyResourceExtensions
} from 's3db.js';

// Test 1: Full Plugin Configuration
function testFullPluginConfiguration(): void {
  const fullConfig: EventualConsistencyPluginConfig = {
    resources: {
      wallets: ['balance', 'points'],
      urls: ['clicks', 'views'],
      posts: ['likes', 'shares', 'comments']
    },
    consolidation: {
      mode: 'async',
      interval: 300,
      concurrency: 5,
      window: 24,
      auto: true
    },
    locks: {
      timeout: 300
    },
    garbageCollection: {
      retention: 30,
      interval: 86400
    },
    analytics: {
      enabled: true,
      periods: ['hour', 'day', 'month'],
      metrics: ['count', 'sum', 'avg', 'min', 'max'],
      rollupStrategy: 'incremental',
      retentionDays: 365
    },
    batch: {
      enabled: false,
      size: 100
    },
    lateArrivals: {
      strategy: 'warn'
    },
    checkpoints: {
      enabled: true,
      strategy: 'hourly',
      retention: 90,
      threshold: 1000,
      deleteConsolidated: true,
      auto: true
    },
    cohort: {
      timezone: 'UTC'
    },
    reducer: (transactions: any[]) => {
      let total = 0;
      for (const t of transactions) {
        if (t.operation === 'set') total = t.value;
        else if (t.operation === 'add') total += t.value;
        else if (t.operation === 'sub') total -= t.value;
      }
      return total;
    },
    verbose: false
  };

  // Type checks - these should compile without errors
  const mode: 'sync' | 'async' = fullConfig.consolidation!.mode!;
  const periods: Array<'hour' | 'day' | 'month'> = fullConfig.analytics!.periods!;
  const strategy: 'warn' | 'ignore' | 'error' = fullConfig.lateArrivals!.strategy!;
}

// Test 2: Minimal Plugin Configuration
function testMinimalPluginConfiguration(): void {
  const minimalConfig: EventualConsistencyPluginConfig = {
    resources: {
      counters: ['value']
    }
  };

  // All other options should be optional
  const hasConsolidation: boolean = minimalConfig.consolidation !== undefined;
}

// Test 3: Sync Mode Configuration
function testSyncModeConfiguration(): void {
  const syncConfig: EventualConsistencyPluginConfig = {
    resources: {
      wallets: ['balance']
    },
    consolidation: {
      mode: 'sync' // Type-safe mode selection
    }
  };
}

// Test 4: Analytics Query Options
function testAnalyticsQueryOptions(): void {
  // Basic query
  const basicOptions: EventualConsistencyAnalyticsOptions = {
    period: 'day',
    date: '2025-01-15'
  };

  // Range query
  const rangeOptions: EventualConsistencyAnalyticsOptions = {
    period: 'hour',
    startDate: '2025-01-15 00:00',
    endDate: '2025-01-15 23:00'
  };

  // With breakdown
  const breakdownOptions: EventualConsistencyAnalyticsOptions = {
    period: 'day',
    date: '2025-01-15',
    breakdown: 'operations'
  };

  // With fillGaps
  const fillGapsOptions: EventualConsistencyAnalyticsOptions = {
    period: 'hour',
    date: '2025-01-15',
    fillGaps: true
  };

  // Type assertions
  const period: 'hour' | 'day' | 'month' = basicOptions.period!;
  const breakdown: 'operations' = breakdownOptions.breakdown!;
}

// Test 5: Top Records Query Options
function testTopRecordsQueryOptions(): void {
  const topByCount: EventualConsistencyTopRecordsOptions = {
    period: 'day',
    date: '2025-01-15',
    metric: 'transactionCount',
    limit: 10
  };

  const topByValue: EventualConsistencyTopRecordsOptions = {
    period: 'month',
    date: '2025-01',
    metric: 'totalValue',
    limit: 100
  };

  // Type assertions
  const metric: 'transactionCount' | 'totalValue' = topByCount.metric!;
}

// Test 6: Analytics Result Structure
function testAnalyticsResultStructure(): void {
  const handleAnalyticsResult = (results: EventualConsistencyAnalyticsResult[]) => {
    for (const result of results) {
      // All properties should be accessible with correct types
      const cohort: string = result.cohort;
      const count: number = result.count;
      const sum: number = result.sum;
      const avg: number = result.avg;
      const min: number = result.min;
      const max: number = result.max;
      const recordCount: number = result.recordCount;

      // Optional operation breakdown
      if (result.add) {
        const addCount: number = result.add.count;
        const addSum: number = result.add.sum;
      }

      if (result.sub) {
        const subCount: number = result.sub.count;
        const subSum: number = result.sub.sum;
      }

      if (result.set) {
        const setCount: number = result.set.count;
        const setSum: number = result.set.sum;
      }
    }
  };
}

// Test 7: Top Records Result Structure
function testTopRecordsResultStructure(): void {
  const handleTopRecords = (records: EventualConsistencyTopRecordResult[]) => {
    for (const record of records) {
      const recordId: string = record.recordId;
      const count: number = record.count;
      const sum: number = record.sum;
    }
  };
}

// Test 8: Cohort Information Structure
function testCohortInfoStructure(): void {
  const handleCohortInfo = (cohortInfo: EventualConsistencyCohortInfo) => {
    const date: string = cohortInfo.date; // YYYY-MM-DD
    const hour: string = cohortInfo.hour; // YYYY-MM-DD HH:00
    const month: string = cohortInfo.month; // YYYY-MM
  };
}

// Test 9: Resource Extension Methods
function testResourceExtensionMethods(): void {
  // Simulating a resource with EC plugin extensions
  const mockResource: EventualConsistencyResourceExtensions = {
    async add(id: string, field: string, amount: number): Promise<number> {
      return 100 + amount;
    },
    async sub(id: string, field: string, amount: number): Promise<number> {
      return 100 - amount;
    },
    async increment(id: string, field: string): Promise<number> {
      return 101;
    },
    async decrement(id: string, field: string): Promise<number> {
      return 99;
    },
    async set(id: string, field: string, value: number): Promise<number> {
      return value;
    },
    async consolidate(id: string, field: string): Promise<number> {
      return 100;
    },
    async getConsolidatedValue(id: string, field: string, options?: any): Promise<number> {
      return 100;
    },
    async recalculate(id: string, field: string): Promise<number> {
      return 100;
    }
  };

  // All methods should be callable with correct signatures
  const testUsage = async () => {
    const result1: Promise<number> = mockResource.add('id1', 'balance', 50);
    const result2: Promise<number> = mockResource.sub('id1', 'balance', 25);
    const result3: Promise<number> = mockResource.set('id1', 'balance', 100);
    const result4: Promise<number> = mockResource.consolidate('id1', 'balance');
    const result5: Promise<number> = mockResource.getConsolidatedValue('id1', 'balance');
    const result6: Promise<number> = mockResource.recalculate('id1', 'balance');
  };
}

// Test 10: Plugin Class Usage
function testPluginClassUsage(): void {
  // Import would be: import { EventualConsistencyPlugin } from 's3db.js';

  // Constructor with config
  const createPlugin = (config: EventualConsistencyPluginConfig) => {
    // In real code: new EventualConsistencyPlugin(config);
    return {} as any;
  };

  // Plugin methods would be:
  // - getAnalytics(resourceName, field, options?)
  // - getMonthByDay(resourceName, field, month, options?)
  // - getDayByHour(resourceName, field, date, options?)
  // - getLastNDays(resourceName, field, days?, options?)
  // - getYearByMonth(resourceName, field, year, options?)
  // - getMonthByHour(resourceName, field, month, options?)
  // - getTopRecords(resourceName, field, options?)
  // - getCohortInfo(date)
}

// Test 11: Configuration Validation
function testConfigurationValidation(): void {
  // These should cause TypeScript errors if uncommented:

  // Invalid mode
  // const invalidMode: EventualConsistencyPluginConfig = {
  //   resources: { wallets: ['balance'] },
  //   consolidation: { mode: 'invalid' } // ❌ Error
  // };

  // Invalid period
  // const invalidPeriod: EventualConsistencyAnalyticsOptions = {
  //   period: 'invalid' // ❌ Error
  // };

  // Invalid metric
  // const invalidMetric: EventualConsistencyTopRecordsOptions = {
  //   metric: 'invalid' // ❌ Error
  // };

  // Invalid strategy
  // const invalidStrategy: EventualConsistencyPluginConfig = {
  //   resources: { wallets: ['balance'] },
  //   lateArrivals: { strategy: 'invalid' } // ❌ Error
  // };
}

// Test 12: Real-World Usage Example
function testRealWorldUsageExample(): void {
  // URL Shortener with click tracking
  const urlShortenerConfig: EventualConsistencyPluginConfig = {
    resources: {
      urls: ['clicksCount', 'viewsCount']
    },
    consolidation: {
      mode: 'async',
      interval: 300, // 5 minutes
      auto: true
    },
    analytics: {
      enabled: true,
      periods: ['hour', 'day', 'month'],
      metrics: ['count', 'sum'],
      retentionDays: 365
    },
    checkpoints: {
      enabled: true,
      strategy: 'hourly',
      retention: 90
    },
    cohort: {
      timezone: 'UTC'
    },
    verbose: false
  };

  // Query analytics for charts
  const queryForCharts = async (plugin: any) => {
    // Last 7 days with gaps filled (perfect for Chart.js)
    const last7Days: Promise<EventualConsistencyAnalyticsResult[]> =
      plugin.getLastNDays('urls', 'clicksCount', 7, { fillGaps: true });

    // Today by hour
    const todayByHour: Promise<EventualConsistencyAnalyticsResult[]> =
      plugin.getDayByHour('urls', 'clicksCount', '2025-01-15', { fillGaps: true });

    // Top URLs by clicks
    const topUrls: Promise<EventualConsistencyTopRecordResult[]> =
      plugin.getTopRecords('urls', 'clicksCount', {
        period: 'day',
        date: '2025-01-15',
        metric: 'transactionCount',
        limit: 10
      });
  };
}

// Test 13: E-commerce Example
function testEcommerceExample(): void {
  // E-commerce with inventory tracking
  const inventoryConfig: EventualConsistencyPluginConfig = {
    resources: {
      products: ['stockLevel', 'reservedCount', 'soldCount']
    },
    consolidation: {
      mode: 'sync', // Immediate consistency for inventory
      auto: true
    },
    analytics: {
      enabled: true,
      periods: ['hour', 'day', 'month'],
      metrics: ['count', 'sum', 'avg', 'min', 'max']
    },
    verbose: true
  };
}

// Test 14: Gaming Example
function testGamingExample(): void {
  // Gaming with player stats
  const gamingConfig: EventualConsistencyPluginConfig = {
    resources: {
      players: ['score', 'xp', 'coins', 'gems'],
      guilds: ['totalScore', 'memberCount', 'level']
    },
    consolidation: {
      mode: 'async',
      interval: 60, // 1 minute
      concurrency: 10
    },
    analytics: {
      enabled: true,
      periods: ['hour', 'day'],
      metrics: ['count', 'sum', 'max'],
      retentionDays: 30
    },
    checkpoints: {
      enabled: true,
      strategy: 'threshold',
      threshold: 1000
    }
  };
}

console.log('✅ EventualConsistencyPlugin TypeScript definitions validated successfully!');
