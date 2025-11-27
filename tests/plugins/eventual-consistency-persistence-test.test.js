/**
 * EventualConsistency Plugin - Persistence Test
 *
 * Verifies that plugin-created resources are persisted in s3db.json
 * with correct createdBy metadata
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Resource Persistence', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-persistence');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should persist plugin-created resources in s3db.json with createdBy metadata', async () => {

    // Create URLs resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0',
        views: 'number|default:0'
      }
    });


    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks', 'views']
      },
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);


    // Force metadata upload
    await database.uploadMetadataFile();


    // Read s3db.json
    const metadataRequest = await database.client.getObject('s3db.json');
    const metadataContent = await new Promise((resolve, reject) => {
      const chunks = [];
      metadataRequest.Body.on('data', chunk => chunks.push(chunk));
      metadataRequest.Body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      metadataRequest.Body.on('error', reject);
    });

    const metadata = JSON.parse(metadataContent);


    // Expected resources (locks no longer created as resources - using PluginStorage now)
    const expectedResources = {
      'urls': 'user',
      'plg_urls_tx_clicks': 'EventualConsistencyPlugin',
      'plg_urls_tx_views': 'EventualConsistencyPlugin'
    };

    for (const [resourceName, expectedCreatedBy] of Object.entries(expectedResources)) {
      const resourceMetadata = metadata.resources[resourceName];


      if (resourceMetadata) {
        expect(resourceMetadata.createdBy).toBe(expectedCreatedBy);
      } else {
        expect(resourceMetadata).toBeDefined();
      }
    }


    for (const resourceName of Object.keys(expectedResources)) {
      const resourceMetadata = metadata.resources[resourceName];

      if (resourceMetadata) {

        expect(resourceMetadata.currentVersion).toBeDefined();
        expect(resourceMetadata.versions).toBeDefined();
        expect(Object.keys(resourceMetadata.versions).length).toBeGreaterThan(0);
      }
    }

  });

  it('should reload plugin-created resources from s3db.json after reconnect', async () => {

    // Step 1: Create resources and plugin

    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);

    // Force metadata save
    await database.uploadMetadataFile();

    const resourcesBefore = Object.keys(database.resources).sort();

    // Save connection string for reconnection
    const connectionString = database.connectionString;

    // Mock destroy to prevent wiping MemoryClient storage (simulate S3 persistence)
    if (database.client && database.client.destroy) {
      database.client.destroy = () => {};
    }

    // Step 2: Disconnect
    await database.disconnect();

    // Step 3: Reconnect (should reload from s3db.json)

    const database2 = new (await import('../../src/database.class.js')).default({
      connectionString,
      forcePathStyle: true
    });
    await database2.connect();

    const resourcesAfter = Object.keys(database2.resources).sort();

    // Step 4: Verify all resources were reloaded

    const expectedResources = [
      'urls',
      'plg_urls_tx_clicks'
      // Note: locks no longer created as resources (using PluginStorage now)
    ];

    for (const resourceName of expectedResources) {
      const exists = database2.resources[resourceName];
      expect(exists).toBeDefined();
    }


    await database2.disconnect();
  }, 30000);

  it('should show correct createdBy in savedMetadata', async () => {

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup plugin
    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync' },
      logLevel: 'silent'
    });
    await database.usePlugin(plugin);

    // Force metadata save
    await database.uploadMetadataFile();


    // Check savedMetadata
    const metadata = database.savedMetadata;

    const expectedResources = {
      'urls': 'user',
      'plg_urls_tx_clicks': 'EventualConsistencyPlugin'
      // Note: locks no longer created as resources (using PluginStorage now)
    };

    for (const [resourceName, expectedCreatedBy] of Object.entries(expectedResources)) {
      const resourceMeta = metadata.resources[resourceName];
      expect(resourceMeta?.createdBy).toBe(expectedCreatedBy);
    }

  });
});
