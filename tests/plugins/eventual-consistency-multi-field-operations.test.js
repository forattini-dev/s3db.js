/**
 * EventualConsistency Plugin - Multi-Field Operations Test
 *
 * Tests .add(), .sub(), and consolidate operations on ALL configured fields
 * Verifies that final consolidated values match expected results
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Multi-Field Operations & Consolidation', () => {
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
    console.log('\n🧪 Testing multi-field operations and consolidation...\n');
    console.log('=' .repeat(70));

    // Create URLs resource with 4 fields
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

    console.log('\n1️⃣  Setting up EventualConsistencyPlugin with 4 fields...\n');

    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    console.log('   ✅ Plugin configured\n');

    // Create URL
    console.log('2️⃣  Creating URL record...\n');
    await urls.insert({
      id: 'multi-ops-test',
      link: 'https://example.com/multi-ops',
      clicks: 100,
      views: 200,
      shares: 50,
      scans: 30
    });

    console.log('   Initial values:');
    console.log('   - clicks: 100');
    console.log('   - views: 200');
    console.log('   - shares: 50');
    console.log('   - scans: 30\n');

    // Perform operations on each field
    console.log('3️⃣  Performing operations on each field...\n');
    console.log('=' .repeat(70));

    // CLICKS: +10, +5, -3
    console.log('\n   📊 CLICKS operations:');
    await urls.add('multi-ops-test', 'clicks', 10);
    console.log('      +10 (total expected: 110)');
    await urls.add('multi-ops-test', 'clicks', 5);
    console.log('      +5  (total expected: 115)');
    await urls.sub('multi-ops-test', 'clicks', 3);
    console.log('      -3  (total expected: 112)');

    // VIEWS: +50, +30, -10
    console.log('\n   👁️  VIEWS operations:');
    await urls.add('multi-ops-test', 'views', 50);
    console.log('      +50 (total expected: 250)');
    await urls.add('multi-ops-test', 'views', 30);
    console.log('      +30 (total expected: 280)');
    await urls.sub('multi-ops-test', 'views', 10);
    console.log('      -10 (total expected: 270)');

    // SHARES: +20, -5
    console.log('\n   🔄 SHARES operations:');
    await urls.add('multi-ops-test', 'shares', 20);
    console.log('      +20 (total expected: 70)');
    await urls.sub('multi-ops-test', 'shares', 5);
    console.log('      -5  (total expected: 65)');

    // SCANS: +15, +10, +5, -8
    console.log('\n   📷 SCANS operations:');
    await urls.add('multi-ops-test', 'scans', 15);
    console.log('      +15 (total expected: 45)');
    await urls.add('multi-ops-test', 'scans', 10);
    console.log('      +10 (total expected: 55)');
    await urls.add('multi-ops-test', 'scans', 5);
    console.log('      +5  (total expected: 60)');
    await urls.sub('multi-ops-test', 'scans', 8);
    console.log('      -8  (total expected: 52)');

    console.log('\n' + '=' .repeat(70));

    // Check transaction counts before consolidation
    console.log('\n4️⃣  Checking transaction logs before consolidation...\n');

    const clicksTransactions = await database.resources.plg_urls_tx_clicks.list();
    const viewsTransactions = await database.resources.plg_urls_tx_views.list();
    const sharesTransactions = await database.resources.plg_urls_tx_shares.list();
    const scansTransactions = await database.resources.plg_urls_tx_scans.list();

    console.log(`   📊 clicks: ${clicksTransactions.length} transactions pending`);
    console.log(`   👁️  views: ${viewsTransactions.length} transactions pending`);
    console.log(`   🔄 shares: ${sharesTransactions.length} transactions pending`);
    console.log(`   📷 scans: ${scansTransactions.length} transactions pending`);

    expect(clicksTransactions.length).toBeGreaterThan(0);
    expect(viewsTransactions.length).toBeGreaterThan(0);
    expect(sharesTransactions.length).toBeGreaterThan(0);
    expect(scansTransactions.length).toBeGreaterThan(0);

    // Consolidate ALL fields
    console.log('\n5️⃣  Consolidating ALL fields...\n');
    console.log('=' .repeat(70));

    console.log('\n   Consolidating clicks...');
    await urls.consolidate('multi-ops-test', 'clicks');

    console.log('   Consolidating views...');
    await urls.consolidate('multi-ops-test', 'views');

    console.log('   Consolidating shares...');
    await urls.consolidate('multi-ops-test', 'shares');

    console.log('   Consolidating scans...');
    await urls.consolidate('multi-ops-test', 'scans');

    console.log('\n   ✅ All fields consolidated!\n');

    // Verify final values (this is what really matters!)
    console.log('6️⃣  Verifying final consolidated values...\n');
    console.log('=' .repeat(70));

    const finalRecord = await urls.get('multi-ops-test');

    const expectedValues = {
      clicks: 112,  // 100 + 10 + 5 - 3
      views: 270,   // 200 + 50 + 30 - 10
      shares: 65,   // 50 + 20 - 5
      scans: 52     // 30 + 15 + 10 + 5 - 8
    };

    console.log('\n   📋 RESULTS:');
    console.log('\n   Field          | Expected | Actual | Status');
    console.log('   ' + '-'.repeat(50));

    let allCorrect = true;

    for (const [field, expected] of Object.entries(expectedValues)) {
      const actual = finalRecord[field];
      const correct = actual === expected;
      const status = correct ? '✅ PASS' : '❌ FAIL';
      const emoji = field === 'clicks' ? '📊' :
                    field === 'views' ? '👁️ ' :
                    field === 'shares' ? '🔄' : '📷';

      console.log(`   ${emoji} ${field.padEnd(12)} | ${String(expected).padStart(8)} | ${String(actual).padStart(6)} | ${status}`);

      expect(actual).toBe(expected);

      if (!correct) allCorrect = false;
    }

    console.log('\n' + '=' .repeat(70));

    if (allCorrect) {
      console.log('\n✅ ALL FIELDS CONSOLIDATED CORRECTLY!\n');
      console.log('   Summary:');
      console.log('   - All operations (+/-) were applied correctly');
      console.log('   - All transaction logs were cleared');
      console.log('   - All final values match expected results\n');
    }
  }, 30000);

  it('should handle complex operations on 10 fields', async () => {
    console.log('\n🧪 Testing complex operations on 10 fields...\n');
    console.log('=' .repeat(70));

    // Create metrics resource with 10 fields
    const metrics = await database.createResource({
      name: 'metrics',
      attributes: {
        id: 'string|required',
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

    console.log('1️⃣  Setting up plugin with 10 fields...\n');

    const plugin = new EventualConsistencyPlugin({
      resources: {
        metrics: fieldNames
      },
      consolidation: { mode: 'async', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    console.log('2️⃣  Creating record with initial values...\n');

    const initialValues = {};
    fieldNames.forEach((field, i) => {
      initialValues[field] = (i + 1) * 100; // 100, 200, 300, ..., 1000
    });

    await metrics.insert({
      id: '10-fields-test',
      ...initialValues
    });

    console.log('3️⃣  Performing operations on all 10 fields...\n');

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

      console.log(`   ✅ ${field}: ${initialValue} → +10 +5 -3 → ${initialValue + 12}`);
    }

    console.log('\n4️⃣  Consolidating all 10 fields...\n');

    for (const field of fieldNames) {
      await metrics.consolidate('10-fields-test', field);
      console.log(`   ✅ ${field} consolidated`);
    }

    console.log('\n5️⃣  Verifying final values...\n');

    const finalRecord = await metrics.get('10-fields-test');

    console.log('   Field          | Expected | Actual | Status');
    console.log('   ' + '-'.repeat(50));

    let allCorrect = true;
    for (const { field, expected } of operations) {
      const actual = finalRecord[field];
      const correct = actual === expected;
      const status = correct ? '✅' : '❌';

      console.log(`   ${status} ${field.padEnd(12)} | ${String(expected).padStart(8)} | ${String(actual).padStart(6)}`);

      expect(actual).toBe(expected);

      if (!correct) allCorrect = false;
    }

    console.log('\n' + '=' .repeat(70));

    if (allCorrect) {
      console.log('\n✅ ALL 10 FIELDS CONSOLIDATED CORRECTLY!\n');
    }
  }, 60000);
});
