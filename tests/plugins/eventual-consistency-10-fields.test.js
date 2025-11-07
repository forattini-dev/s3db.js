/**
 * EventualConsistency Plugin - 10 Fields Test
 *
 * Tests that the plugin correctly creates resources for 10+ fields
 * Expected: 10 transaction resources + 10 lock resources + 10 analytics resources = 30 total
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - 10 Fields Scale Test', () => {
  let database;
  let metrics;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-10-fields');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should create 20 resources for 10 fields (transactions + analytics, locks use PluginStorage)', async () => {

    // Create metrics resource with 10 fields
    metrics = await database.createResource({
      name: 'metrics',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        // 10 metric fields
        impressions: 'number|default:0',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        likes: 'number|default:0',
        comments: 'number|default:0',
        downloads: 'number|default:0',
        saves: 'number|default:0',
        opens: 'number|default:0',
        completions: 'number|default:0'
      }
    });


    const fieldNames = [
      'impressions', 'clicks', 'views', 'shares', 'likes',
      'comments', 'downloads', 'saves', 'opens', 'completions'
    ];

    const plugin = new EventualConsistencyPlugin({
      resources: {
        metrics: fieldNames
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false, // Disable logs for cleaner output
      analytics: { enabled: true }
    });
    await database.usePlugin(plugin);


    // Get all resources
    const allResources = Object.keys(database.resources);

    // Count transaction resources
    const transactionResources = allResources.filter(r => r.startsWith('plg_metrics_tx_'));

    // Lock resources no longer exist (migrated to PluginStorage)
    const lockResources = allResources.filter(r => r.startsWith('metrics_consolidation_locks_'));

    // Count analytics resources
    const analyticsResources = allResources.filter(r => r.startsWith('plg_metrics_an_'));

    // Total (transactions + analytics only, locks use PluginStorage)
    const totalCreated = transactionResources.length + analyticsResources.length;

    // Assertions
    expect(transactionResources.length).toBe(10);
    expect(lockResources.length).toBe(0); // No lock resources anymore
    expect(analyticsResources.length).toBe(10);
    expect(totalCreated).toBe(20);

  });

  it('should handle operations on all 10 fields correctly', async () => {

    // Create metrics resource with 10 fields
    metrics = await database.createResource({
      name: 'metrics',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        impressions: 'number|default:0',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        likes: 'number|default:0',
        comments: 'number|default:0',
        downloads: 'number|default:0',
        saves: 'number|default:0',
        opens: 'number|default:0',
        completions: 'number|default:0'
      }
    });

    const fieldNames = [
      'impressions', 'clicks', 'views', 'shares', 'likes',
      'comments', 'downloads', 'saves', 'opens', 'completions'
    ];

    const plugin = new EventualConsistencyPlugin({
      resources: {
        metrics: fieldNames
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    await metrics.insert({
      id: 'metric-10-fields',
      name: 'Test Metric',
      impressions: 0,
      clicks: 0,
      views: 0,
      shares: 0,
      likes: 0,
      comments: 0,
      downloads: 0,
      saves: 0,
      opens: 0,
      completions: 0
    });


    // Add different values to each field
    for (let i = 0; i < fieldNames.length; i++) {
      const fieldName = fieldNames[i];
      const value = (i + 1) * 10; // 10, 20, 30, ..., 100
      await metrics.add('metric-10-fields', fieldName, value);
    }


    const record = await metrics.get('metric-10-fields');

    // Verify each field
    const expectedValues = {
      impressions: 10,
      clicks: 20,
      views: 30,
      shares: 40,
      likes: 50,
      comments: 60,
      downloads: 70,
      saves: 80,
      opens: 90,
      completions: 100
    };

    let allCorrect = true;
    for (const [field, expected] of Object.entries(expectedValues)) {
      const actual = record[field];
      const correct = actual === expected;
      expect(actual).toBe(expected);
      if (!correct) allCorrect = false;
    }

    if (allCorrect) {
    }
  }, 30000);

  it('should create analytics for all 10 fields and query them independently', async () => {

    // Create metrics resource with 10 fields
    metrics = await database.createResource({
      name: 'metrics',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        impressions: 'number|default:0',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        likes: 'number|default:0',
        comments: 'number|default:0',
        downloads: 'number|default:0',
        saves: 'number|default:0',
        opens: 'number|default:0',
        completions: 'number|default:0'
      }
    });

    const fieldNames = [
      'impressions', 'clicks', 'views', 'shares', 'likes',
      'comments', 'downloads', 'saves', 'opens', 'completions'
    ];

    const plugin = new EventualConsistencyPlugin({
      resources: {
        metrics: fieldNames
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false,
      analytics: { enabled: true }
    });
    await database.usePlugin(plugin);

    await metrics.insert({
      id: 'analytics-test',
      name: 'Analytics Test',
      impressions: 0,
      clicks: 0,
      views: 0,
      shares: 0,
      likes: 0,
      comments: 0,
      downloads: 0,
      saves: 0,
      opens: 0,
      completions: 0
    });

    // Add 5 operations to each field
    for (const fieldName of fieldNames) {
      for (let i = 0; i < 5; i++) {
        await metrics.add('analytics-test', fieldName, i + 1);
      }
    }


    // Check each analytics resource
    for (const fieldName of fieldNames) {
      const analyticsResourceName = `plg_metrics_an_${fieldName}`;
      const analyticsResource = database.resources[analyticsResourceName];

      expect(analyticsResource).toBeDefined();

      // Get analytics data
      const analytics = await analyticsResource.list();

      // Each field should have some analytics
      expect(analytics).toBeDefined();
    }

  }, 60000);
});
