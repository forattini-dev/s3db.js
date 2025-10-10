/**
 * EventualConsistency Plugin - Multi-Field Resource Creation Test
 *
 * Verifies that the plugin creates transaction and analytics resources
 * for ALL configured fields, not just the first one.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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
    console.log('\n🧪 Testing multi-field resource creation...\n');

    // Create URLs resource
    urls = await database.createResource({
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

    console.log('1️⃣  Creating plugin with 4 fields: clicks, views, shares, scans...\n');

    // Setup EventualConsistency for all counters
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: true
    });
    await database.usePlugin(plugin);

    console.log('2️⃣  Checking if transaction resources were created...\n');

    // Check if ALL transaction resources exist
    const expectedTransactionResources = [
      'urls_transactions_clicks',
      'urls_transactions_views',
      'urls_transactions_shares',
      'urls_transactions_scans'
    ];

    for (const resourceName of expectedTransactionResources) {
      const exists = database.resources[resourceName];
      console.log(`   ${exists ? '✅' : '❌'} ${resourceName}: ${exists ? 'EXISTS' : 'MISSING'}`);
      expect(exists).toBeDefined();
      expect(exists).not.toBeNull();
    }

    console.log('\n✅ All transaction resources created!\n');
  });

  it('should create analytics resources for ALL configured fields when enabled', async () => {
    console.log('\n🧪 Testing multi-field analytics resource creation...\n');

    // Create URLs resource
    urls = await database.createResource({
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

    console.log('1️⃣  Creating plugin with 4 fields AND analytics enabled...\n');

    // Setup EventualConsistency with analytics
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: true,
      analytics: { enabled: true }
    });
    await database.usePlugin(plugin);

    console.log('2️⃣  Checking if analytics resources were created...\n');

    // Check if ALL analytics resources exist
    const expectedAnalyticsResources = [
      'urls_analytics_clicks',
      'urls_analytics_views',
      'urls_analytics_shares',
      'urls_analytics_scans'
    ];

    for (const resourceName of expectedAnalyticsResources) {
      const exists = database.resources[resourceName];
      console.log(`   ${exists ? '✅' : '❌'} ${resourceName}: ${exists ? 'EXISTS' : 'MISSING'}`);
      expect(exists).toBeDefined();
      expect(exists).not.toBeNull();
    }

    console.log('\n✅ All analytics resources created!\n');
  });

  it('should create lock resources for ALL configured fields', async () => {
    console.log('\n🧪 Testing multi-field lock resource creation...\n');

    // Create URLs resource
    urls = await database.createResource({
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

    console.log('1️⃣  Creating plugin with 4 fields...\n');

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: true
    });
    await database.usePlugin(plugin);

    console.log('2️⃣  Checking if lock resources were created...\n');

    // Check if ALL lock resources exist
    const expectedLockResources = [
      'urls_consolidation_locks_clicks',
      'urls_consolidation_locks_views',
      'urls_consolidation_locks_shares',
      'urls_consolidation_locks_scans'
    ];

    for (const resourceName of expectedLockResources) {
      const exists = database.resources[resourceName];
      console.log(`   ${exists ? '✅' : '❌'} ${resourceName}: ${exists ? 'EXISTS' : 'MISSING'}`);
      expect(exists).toBeDefined();
      expect(exists).not.toBeNull();
    }

    console.log('\n✅ All lock resources created!\n');
  });

  it('should be able to use ALL configured fields independently', async () => {
    console.log('\n🧪 Testing multi-field operations...\n');

    // Create URLs resource
    urls = await database.createResource({
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

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: true
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating URL...\n');
    await urls.insert({
      id: 'multi-field-test',
      link: 'https://example.com',
      clicks: 0,
      views: 0,
      shares: 0,
      scans: 0
    });

    console.log('2️⃣  Testing each field independently...\n');

    // Test clicks
    console.log('   Testing clicks field...');
    await urls.add('multi-field-test', 'clicks', 10);
    let url = await urls.get('multi-field-test');
    expect(url.clicks).toBe(10);
    console.log('   ✅ Clicks: 10');

    // Test views
    console.log('   Testing views field...');
    await urls.add('multi-field-test', 'views', 20);
    url = await urls.get('multi-field-test');
    expect(url.views).toBe(20);
    console.log('   ✅ Views: 20');

    // Test shares
    console.log('   Testing shares field...');
    await urls.add('multi-field-test', 'shares', 5);
    url = await urls.get('multi-field-test');
    expect(url.shares).toBe(5);
    console.log('   ✅ Shares: 5');

    // Test scans
    console.log('   Testing scans field...');
    await urls.add('multi-field-test', 'scans', 3);
    url = await urls.get('multi-field-test');
    expect(url.scans).toBe(3);
    console.log('   ✅ Scans: 3');

    console.log('\n3️⃣  Final state:\n');
    console.log(`   Clicks: ${url.clicks} (expected: 10)`);
    console.log(`   Views: ${url.views} (expected: 20)`);
    console.log(`   Shares: ${url.shares} (expected: 5)`);
    console.log(`   Scans: ${url.scans} (expected: 3)`);

    expect(url.clicks).toBe(10);
    expect(url.views).toBe(20);
    expect(url.shares).toBe(5);
    expect(url.scans).toBe(3);

    console.log('\n✅ All fields working correctly!\n');
  });
});
