/**
 * EventualConsistencyPlugin - Nested Fields Test
 *
 * Tests dot notation support for nested fields with json/object types
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Nested Fields', () => {
  let database;
  let urls;

  beforeEach(async () => {
    database = createDatabaseForTest('nested-fields-test');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should support nested fields with json type (1 level after json)', async () => {
    const plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['utmResults'] },
      consolidation: { mode: 'sync', auto: false }
    });

    await database.usePlugin(plugin);

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        utmResults: 'json'  // JSON type allows 1 level nesting
      }
    });

    // Insert record
    await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: {} });

    // Add to nested field (1 level after json)
    await urls.add('url-1', 'utmResults.medium', 5);
    await urls.add('url-1', 'utmResults.google', 3);

    // Get record
    const url = await urls.get('url-1');
    expect(url.utmResults.medium).toBe(5);
    expect(url.utmResults.google).toBe(3);
  });

  it('should support nested fields with explicit object type', async () => {
    const plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['utmResults'] },
      consolidation: { mode: 'sync', auto: false }
    });

    await database.usePlugin(plugin);

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        utmResults: {
          $$type: 'object',
          medium: {
            $$type: 'object',
            google: 'number|default:0'
          }
        }
      }
    });

    // Insert record
    await urls.insert({
      id: 'url-1',
      link: 'https://example.com',
      utmResults: { medium: { google: 0 } }
    });

    // Add to deeply nested field
    await urls.add('url-1', 'utmResults.medium.google', 10);

    // Get record
    const url = await urls.get('url-1');
    expect(url.utmResults.medium.google).toBe(10);
  });

  it('should reject nested paths exceeding 1 level after json', async () => {
    const plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['utmResults'] },
      consolidation: { mode: 'sync', auto: false }
    });

    await database.usePlugin(plugin);

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        utmResults: 'json'  // JSON type allows 1 level nesting only
      }
    });

    // Insert record
    await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: {} });

    // Try to add 2 levels after json (should fail)
    await expect(async () => {
      await urls.add('url-1', 'utmResults.medium.google', 5);
    }).rejects.toThrow(/exceeds 1 level after 'json' field/);
  });

  it('should support nested json within object', async () => {
    const plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['utmResults'] },
      consolidation: { mode: 'sync', auto: false }
    });

    await database.usePlugin(plugin);

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        utmResults: {
          $$type: 'object',
          medium: 'json'  // JSON nested in object - allows 1 level after this
        }
      }
    });

    // Insert record
    await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: { medium: {} } });

    // Add to nested field (1 level after json is OK)
    await urls.add('url-1', 'utmResults.medium.google', 7);

    // Get record
    const url = await urls.get('url-1');
    expect(url.utmResults.medium.google).toBe(7);

    // Try to add 2 levels after json (should fail)
    await expect(async () => {
      await urls.add('url-1', 'utmResults.medium.google.ads', 3);
    }).rejects.toThrow(/exceeds 1 level after 'json' field/);
  });

  it('should consolidate multiple nested paths independently', async () => {
    const plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['utmResults'] },
      consolidation: { mode: 'sync', auto: false }
    });

    await database.usePlugin(plugin);

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        utmResults: 'json'
      }
    });

    // Insert record
    await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: {} });

    // Add to multiple nested paths
    await urls.add('url-1', 'utmResults.medium', 10);
    await urls.add('url-1', 'utmResults.source', 5);
    await urls.add('url-1', 'utmResults.campaign', 3);

    // Get record
    const url = await urls.get('url-1');
    expect(url.utmResults.medium).toBe(10);
    expect(url.utmResults.source).toBe(5);
    expect(url.utmResults.campaign).toBe(3);

    // Increment again
    await urls.add('url-1', 'utmResults.medium', 5);

    // Verify
    const url2 = await urls.get('url-1');
    expect(url2.utmResults.medium).toBe(15);
    expect(url2.utmResults.source).toBe(5);  // unchanged
    expect(url2.utmResults.campaign).toBe(3);  // unchanged
  });

  it('should support set/add/sub operations on nested fields', async () => {
    const plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['utmResults'] },
      consolidation: { mode: 'sync', auto: false }
    });

    await database.usePlugin(plugin);

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        utmResults: 'json'
      }
    });

    // Insert record
    await urls.insert({ id: 'url-1', link: 'https://example.com', utmResults: {} });

    // Set initial value
    await urls.set('url-1', 'utmResults.clicks', 100);

    // Add
    await urls.add('url-1', 'utmResults.clicks', 50);

    // Subtract
    await urls.sub('url-1', 'utmResults.clicks', 20);

    // Verify
    const url = await urls.get('url-1');
    expect(url.utmResults.clicks).toBe(130);  // 100 + 50 - 20
  });
});
