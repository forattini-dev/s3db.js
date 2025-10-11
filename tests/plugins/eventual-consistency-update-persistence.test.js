/**
 * EventualConsistency Plugin - Update Persistence Test
 *
 * Tests that verify the update() is persisting correctly to S3
 * and investigate potential S3 eventual consistency issues
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Update Persistence', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-update-persistence');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should persist consolidated value immediately after consolidation', async () => {
    console.log('\n🔍 Testing update persistence after consolidation...\n');

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        shortUrl: 'string|required',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: true // Enable verbose logging
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-001',
      shortUrl: 'abc123',
      clicks: 0
    });

    console.log('✅ URL created with clicks: 0\n');

    // Make 3 click operations
    console.log('📊 Making 3 click operations...');
    await urls.add('url-001', 'clicks', 1);
    await urls.add('url-001', 'clicks', 1);
    await urls.add('url-001', 'clicks', 1);
    console.log('✅ 3 transactions created\n');

    // Get BEFORE consolidation
    const beforeConsolidate = await urls.get('url-001');
    console.log('📖 BEFORE consolidate:', beforeConsolidate.clicks, '(expected: 0)\n');
    expect(beforeConsolidate.clicks).toBe(0);

    // Consolidate
    console.log('⚙️  Running consolidation...');
    const consolidatedValue = await urls.consolidate('url-001', 'clicks');
    console.log('✅ Consolidation returned:', consolidatedValue, '(expected: 3)\n');
    expect(consolidatedValue).toBe(3);

    // Get IMMEDIATELY after consolidation
    console.log('📖 GET immediately after consolidation...');
    const afterConsolidate = await urls.get('url-001');
    console.log('   Value:', afterConsolidate.clicks);

    // Check if it's correct
    if (afterConsolidate.clicks === 3) {
      console.log('   ✅ CORRECT VALUE - No S3 eventual consistency issue!\n');
    } else {
      console.log('   ⚠️  WRONG VALUE - Possible S3 eventual consistency issue!');
      console.log('   Expected: 3, Got:', afterConsolidate.clicks, '\n');

      // Wait 3 seconds and try again
      console.log('⏳ Waiting 3 seconds for S3 eventual consistency...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      const afterWait = await urls.get('url-001');
      console.log('📖 GET after 3 second wait:');
      console.log('   Value:', afterWait.clicks);

      if (afterWait.clicks === 3) {
        console.log('   ✅ CORRECT VALUE after wait - S3 eventual consistency confirmed!\n');
      } else {
        console.log('   ❌ STILL WRONG after wait - Different issue!\n');
      }
    }

    expect(afterConsolidate.clicks).toBe(3);
  }, 30000);

  it('should accumulate correctly across multiple consolidations', async () => {
    console.log('\n🔍 Testing accumulation across multiple consolidations...\n');

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: true
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-002',
      clicks: 0
    });

    // Click 1: Add 1, consolidate
    console.log('Click 1: Adding +1...');
    await urls.add('url-002', 'clicks', 1);
    await urls.consolidate('url-002', 'clicks');
    const after1 = await urls.get('url-002');
    console.log('   After consolidation: clicks =', after1.clicks, '(expected: 1)');
    expect(after1.clicks).toBe(1);

    // Click 2: Add 1, consolidate
    console.log('\nClick 2: Adding +1...');
    await urls.add('url-002', 'clicks', 1);
    await urls.consolidate('url-002', 'clicks');
    const after2 = await urls.get('url-002');
    console.log('   After consolidation: clicks =', after2.clicks, '(expected: 2)');
    expect(after2.clicks).toBe(2);

    // Click 3: Add 1, consolidate
    console.log('\nClick 3: Adding +1...');
    await urls.add('url-002', 'clicks', 1);
    await urls.consolidate('url-002', 'clicks');
    const after3 = await urls.get('url-002');
    console.log('   After consolidation: clicks =', after3.clicks, '(expected: 3)');
    expect(after3.clicks).toBe(3);

    console.log('\n✅ All consolidations accumulated correctly!\n');
  }, 30000);

  it('should show applied transactions are being tracked correctly', async () => {
    console.log('\n🔍 Testing applied transactions tracking...\n');

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: true
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-003',
      clicks: 0
    });

    // Add 5 clicks
    console.log('Adding 5 clicks...');
    for (let i = 0; i < 5; i++) {
      await urls.add('url-003', 'clicks', 1);
    }

    // Check pending transactions
    const pendingBefore = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url-003',
      applied: false
    });
    console.log('Pending transactions BEFORE consolidation:', pendingBefore.length, '(expected: 5)');
    expect(pendingBefore.length).toBe(5);

    // Consolidate
    console.log('\nConsolidating...');
    await urls.consolidate('url-003', 'clicks');

    // Check applied transactions
    const appliedAfter = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url-003',
      applied: true
    });
    console.log('Applied transactions AFTER consolidation:', appliedAfter.length, '(expected: 5)');
    expect(appliedAfter.length).toBe(5);

    // Check pending transactions
    const pendingAfter = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url-003',
      applied: false
    });
    console.log('Pending transactions AFTER consolidation:', pendingAfter.length, '(expected: 0)');
    expect(pendingAfter.length).toBe(0);

    // Verify URL was updated
    const url = await urls.get('url-003');
    console.log('\nURL clicks value:', url.clicks, '(expected: 5)');
    expect(url.clicks).toBe(5);

    console.log('\n✅ Transactions tracked correctly!\n');
  }, 30000);

  it('should handle the exact scenario from user logs', async () => {
    console.log('\n🔍 Reproducing user scenario: clicks 1→2→3→4...\n');

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: true
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-004',
      clicks: 0
    });

    // Simulate user scenario:
    // Click 1 → Consolidate → Click 2 → Consolidate → Click 3 → Consolidate

    console.log('--- Click 1 ---');
    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after1 = await urls.get('url-004');
    console.log('   Expected: 1, Got:', after1.clicks);
    expect(after1.clicks).toBe(1);

    console.log('\n--- Click 2 ---');
    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after2 = await urls.get('url-004');
    console.log('   Expected: 2, Got:', after2.clicks);
    expect(after2.clicks).toBe(2);

    console.log('\n--- Click 3 ---');
    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after3 = await urls.get('url-004');
    console.log('   Expected: 3, Got:', after3.clicks);
    expect(after3.clicks).toBe(3);

    console.log('\n--- Click 4 ---');
    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after4 = await urls.get('url-004');
    console.log('   Expected: 4, Got:', after4.clicks);
    expect(after4.clicks).toBe(4);

    console.log('\n✅ All clicks accumulated correctly: 0 → 1 → 2 → 3 → 4\n');
  }, 30000);
});
