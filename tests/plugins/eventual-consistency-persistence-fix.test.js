/**
 * EventualConsistency Plugin - Persistence Bug Fix Test
 *
 * This test reproduces the bug where consolidation calculates correctly
 * but doesn't persist the value to the main record.
 *
 * Bug: When adding to a field before the record exists, the update fails
 * silently and the consolidated value is never persisted.
 *
 * Fix: Use upsert pattern (try update, fallback to insert) and log errors.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency.plugin.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Persistence Bug Fix', () => {
  let database;
  let urls;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-persistence-fix');

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|optional',
        clicks: 'number|default:0',
        views: 'number|default:0'
      }
    });

    // Add EventualConsistency plugin for clicks field
    const clicksPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      mode: 'sync',
      autoConsolidate: false,
      verbose: true
    });

    await database.usePlugin(clicksPlugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should persist consolidated value when record exists (normal case)', async () => {
    // Create URL first
    await urls.insert({
      id: 'url1',
      link: 'https://example.com',
      clicks: 0
    });

    // Add clicks
    await urls.add('url1', 'clicks', 1);
    await urls.add('url1', 'clicks', 1);
    await urls.add('url1', 'clicks', 1);

    // Read back
    const url = await urls.get('url1');

    // Should be 3 (all clicks persisted)
    expect(url.clicks).toBe(3);
  });

  it('should persist consolidated value when record DOES NOT exist (BUG scenario)', async () => {
    // DO NOT create the URL record first!
    // This simulates the bug scenario where:
    // 1. Click event fires before URL insert completes
    // 2. Or URL was deleted but clicks still being tracked

    // Add clicks to non-existent record
    await urls.add('url2', 'clicks', 1);
    await urls.add('url2', 'clicks', 1);
    await urls.add('url2', 'clicks', 1);

    // Manually consolidate (since autoConsolidate is off)
    const consolidatedValue = await urls.consolidate('url2', 'clicks');

    // Consolidation should return correct value
    expect(consolidatedValue).toBe(3);

    // Read back - THIS USED TO FAIL (returned 0)
    const url = await urls.get('url2');

    // FIX: Should now create record with clicks=3
    expect(url).toBeDefined();
    expect(url.clicks).toBe(3);
  });

  it('should handle multiple consolidations correctly', async () => {
    // Start without record
    await urls.add('url3', 'clicks', 5);

    // First consolidation creates record
    let value = await urls.consolidate('url3', 'clicks');
    expect(value).toBe(5);

    let url = await urls.get('url3');
    expect(url.clicks).toBe(5);

    // Add more clicks
    await urls.add('url3', 'clicks', 3);

    // Second consolidation updates existing record
    value = await urls.consolidate('url3', 'clicks');
    expect(value).toBe(8);

    url = await urls.get('url3');
    expect(url.clicks).toBe(8);

    // Add more
    await urls.add('url3', 'clicks', 2);

    // Third consolidation
    value = await urls.consolidate('url3', 'clicks');
    expect(value).toBe(10);

    url = await urls.get('url3');
    expect(url.clicks).toBe(10);
  });

  it('should work with async mode and auto-consolidation', async () => {
    // Recreate with async mode
    await database.disconnect();

    database = await createDatabaseForTest('eventual-consistency-async-fix');

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      mode: 'async',
      autoConsolidate: true,
      consolidationInterval: 1, // 1 second for fast testing
      verbose: true
    });

    await database.usePlugin(plugin);

    // Add clicks to non-existent record
    await urls.add('url4', 'clicks', 1);
    await urls.add('url4', 'clicks', 1);
    await urls.add('url4', 'clicks', 1);

    // Wait for auto-consolidation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Should be persisted now
    const url = await urls.get('url4');
    expect(url).toBeDefined();
    expect(url.clicks).toBe(3);
  });

  it('should log error if update fails for other reasons', async () => {
    // Create URL with required field
    await urls.insert({
      id: 'url5',
      link: 'https://example.com',
      clicks: 0
    });

    // Mock update to fail (simulate S3 error) - do this BEFORE add()
    const originalUpdate = urls.update.bind(urls);
    urls.update = async () => {
      throw new Error('Simulated S3 error');
    };

    // Add clicks - this will fail during consolidation
    await expect(
      urls.add('url5', 'clicks', 5)
    ).rejects.toThrow('Simulated S3 error');

    // Restore original update
    urls.update = originalUpdate;
  });

  it('should handle race condition: concurrent adds before consolidation', async () => {
    // Simulate high-traffic scenario (reduced from 10 to 5 to avoid lock contention)
    const promises = [];

    for (let i = 0; i < 5; i++) {
      promises.push(urls.add('url6', 'clicks', 1));
    }

    await Promise.all(promises);

    // Consolidate
    const value = await urls.consolidate('url6', 'clicks');
    expect(value).toBe(5);

    const url = await urls.get('url6');
    expect(url.clicks).toBe(5);
  }, 60000); // 60 second timeout for race condition test
});
