/**
 * EventualConsistency Plugin - Multi-Field Operations Test
 *
 * Tests .add(), .sub(), and consolidate operations on ALL configured fields
 * Verifies that final consolidated values match expected results
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Multi-Field Operations & Consolidation', () => {
  jest.setTimeout(120000);
  let database;
  let urls;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-multi-operations');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should correctly consolidate operations on ALL fields', async () => {

    // Create URLs resource with 4 fields
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


    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);


    // Create URL
    await urls.insert({
      id: 'multi-ops-test',
      link: 'https://example.com/multi-ops',
      clicks: 100,
      views: 200,
      shares: 50,
      scans: 30
    });


    // Perform operations on each field

    // CLICKS: +10, +5, -3
    await urls.add('multi-ops-test', 'clicks', 10);
    await urls.add('multi-ops-test', 'clicks', 5);
    await urls.sub('multi-ops-test', 'clicks', 3);

    // VIEWS: +50, +30, -10
    await urls.add('multi-ops-test', 'views', 50);
    await urls.add('multi-ops-test', 'views', 30);
    await urls.sub('multi-ops-test', 'views', 10);

    // SHARES: +20, -5
    await urls.add('multi-ops-test', 'shares', 20);
    await urls.sub('multi-ops-test', 'shares', 5);

    // SCANS: +15, +10, +5, -8
    await urls.add('multi-ops-test', 'scans', 15);
    await urls.add('multi-ops-test', 'scans', 10);
    await urls.add('multi-ops-test', 'scans', 5);
    await urls.sub('multi-ops-test', 'scans', 8);


    // Check transaction counts before consolidation

    const clicksTransactions = await database.resources.plg_urls_tx_clicks.list();
    const viewsTransactions = await database.resources.plg_urls_tx_views.list();
    const sharesTransactions = await database.resources.plg_urls_tx_shares.list();
    const scansTransactions = await database.resources.plg_urls_tx_scans.list();


    expect(clicksTransactions.length).toBeGreaterThan(0);
    expect(viewsTransactions.length).toBeGreaterThan(0);
    expect(sharesTransactions.length).toBeGreaterThan(0);
    expect(scansTransactions.length).toBeGreaterThan(0);

    // Consolidate ALL fields

    await urls.consolidate('multi-ops-test', 'clicks');

    await urls.consolidate('multi-ops-test', 'views');

    await urls.consolidate('multi-ops-test', 'shares');

    await urls.consolidate('multi-ops-test', 'scans');


    // Verify final values (this is what really matters!)

    const finalRecord = await urls.get('multi-ops-test');

    const expectedValues = {
      clicks: 112,  // 100 + 10 + 5 - 3
      views: 270,   // 200 + 50 + 30 - 10
      shares: 65,   // 50 + 20 - 5
      scans: 52     // 30 + 15 + 10 + 5 - 8
    };


    let allCorrect = true;

    for (const [field, expected] of Object.entries(expectedValues)) {
      const actual = finalRecord[field];
      const correct = actual === expected;
      const status = correct ? '✅ PASS' : '❌ FAIL';
      const emoji = field === 'clicks' ? '📊' :
                    field === 'views' ? '👁️ ' :
                    field === 'shares' ? '🔄' : '📷';


      expect(actual).toBe(expected);

      if (!correct) allCorrect = false;
    }


    if (allCorrect) {
    }
  }, 30000);

  it('should handle complex operations on 10 fields', async () => {

    // Create metrics resource with 10 fields
    const metrics = await database.createResource({
      name: 'metrics',
      attributes: {
        id: 'string|optional',
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
      consolidation: { mode: 'async', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);


    const initialValues = {};
    fieldNames.forEach((field, i) => {
      initialValues[field] = (i + 1) * 100; // 100, 200, 300, ..., 1000
    });

    await metrics.insert({
      id: '10-fields-test',
      ...initialValues
    });


    // Perform 3 operations on each field
    const operations = [];
    for (let i = 0; i < fieldNames.length; i++) {
      const field = fieldNames[i];
      const initialValue = (i + 1) * 100;

      // Add 10, add 5, subtract 3
      await metrics.add('10-fields-test', field, 10);
      await metrics.add('10-fields-test', field, 5);
      await metrics.sub('10-fields-test', field, 3);

      operations.push({
        field,
        initial: initialValue,
        expected: initialValue + 10 + 5 - 3
      });

    }


    for (const field of fieldNames) {
      await metrics.consolidate('10-fields-test', field);
    }


    const finalRecord = await metrics.get('10-fields-test');


    let allCorrect = true;
    for (const { field, expected } of operations) {
      const actual = finalRecord[field];
      const correct = actual === expected;
      const status = correct ? '✅' : '❌';


      expect(actual).toBe(expected);

      if (!correct) allCorrect = false;
    }


    if (allCorrect) {
    }
  }, 120000);
});
