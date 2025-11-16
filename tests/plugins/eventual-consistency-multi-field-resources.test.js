/**
 * EventualConsistency Plugin - Multi-Field Resource Creation Test
 *
 * Verifies that the plugin creates transaction and analytics resources
 * for ALL configured fields, not just the first one.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Multi-Field Resource Creation', () => {
  let database;
  let urls;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-multi-field');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should create transaction resources for ALL configured fields', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        scans: 'number|default:0'
      }
    });


    // Setup EventualConsistency for all counters
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);


    // Check if ALL transaction resources exist
    const expectedTransactionResources = [
      'plg_urls_tx_clicks',
      'plg_urls_tx_views',
      'plg_urls_tx_shares',
      'plg_urls_tx_scans'
    ];

    for (const resourceName of expectedTransactionResources) {
      const exists = database.resources[resourceName];
      expect(exists).toBeDefined();
      expect(exists).not.toBeNull();
    }

  });

  jest.setTimeout(30000);

  it('should create analytics resources for ALL configured fields when enabled', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        scans: 'number|default:0'
      }
    });


    // Setup EventualConsistency with analytics
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent',
      analytics: { enabled: true }
    });
    await database.usePlugin(plugin);


    // Check if ALL analytics resources exist
    const expectedAnalyticsResources = [
      'plg_urls_an_clicks',
      'plg_urls_an_views',
      'plg_urls_an_shares',
      'plg_urls_an_scans'
    ];

    for (const resourceName of expectedAnalyticsResources) {
      const exists = database.resources[resourceName];
      expect(exists).toBeDefined();
      expect(exists).not.toBeNull();
    }

  });

  it('should use PluginStorage for locks instead of creating lock resources', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        scans: 'number|default:0'
      }
    });


    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);


    // Check that lock resources do NOT exist (migrated to PluginStorage)
    const oldLockResources = [
      'urls_consolidation_locks_clicks',
      'urls_consolidation_locks_views',
      'urls_consolidation_locks_shares',
      'urls_consolidation_locks_scans'
    ];

    for (const resourceName of oldLockResources) {
      const exists = database.resources[resourceName];
      expect(exists).toBeUndefined();
    }

  });

  it('should be able to use ALL configured fields independently', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        scans: 'number|default:0'
      }
    });

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);

    await urls.insert({
      id: 'multi-field-test',
      link: 'https://example.com',
      clicks: 0,
      views: 0,
      shares: 0,
      scans: 0
    });


    // Test clicks
    await urls.add('multi-field-test', 'clicks', 10);
    let url = await urls.get('multi-field-test');
    expect(url.clicks).toBe(10);

    // Test views
    await urls.add('multi-field-test', 'views', 20);
    url = await urls.get('multi-field-test');
    expect(url.views).toBe(20);

    // Test shares
    await urls.add('multi-field-test', 'shares', 5);
    url = await urls.get('multi-field-test');
    expect(url.shares).toBe(5);

    // Test scans
    await urls.add('multi-field-test', 'scans', 3);
    url = await urls.get('multi-field-test');
    expect(url.scans).toBe(3);


    expect(url.clicks).toBe(10);
    expect(url.views).toBe(20);
    expect(url.shares).toBe(5);
    expect(url.scans).toBe(3);

  });
});
