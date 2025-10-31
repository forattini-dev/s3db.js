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
    console.log('\n🧪 Testing plugin resource persistence...\n');

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

    console.log('1️⃣  Creating plugin with 2 fields: clicks, views...\n');

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    console.log('2️⃣  Forcing metadata save to s3db.json...\n');

    // Force metadata upload
    await database.uploadMetadataFile();

    console.log('3️⃣  Reading s3db.json from S3...\n');

    // Read s3db.json
    const metadataRequest = await database.client.getObject('s3db.json');
    const metadataContent = await new Promise((resolve, reject) => {
      const chunks = [];
      metadataRequest.Body.on('data', chunk => chunks.push(chunk));
      metadataRequest.Body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      metadataRequest.Body.on('error', reject);
    });

    const metadata = JSON.parse(metadataContent);

    console.log('4️⃣  Checking resources in metadata...\n');

    // Expected resources (locks no longer created as resources - using PluginStorage now)
    const expectedResources = {
      'urls': 'user',
      'plg_urls_tx_clicks': 'EventualConsistencyPlugin',
      'plg_urls_tx_views': 'EventualConsistencyPlugin'
    };

    for (const [resourceName, expectedCreatedBy] of Object.entries(expectedResources)) {
      const resourceMetadata = metadata.resources[resourceName];

      console.log(`   Checking: ${resourceName}`);
      console.log(`     - Exists in metadata: ${resourceMetadata ? 'YES' : 'NO'}`);

      if (resourceMetadata) {
        console.log(`     - createdBy: ${resourceMetadata.createdBy}`);
        expect(resourceMetadata.createdBy).toBe(expectedCreatedBy);
      } else {
        console.log(`     ❌ Resource not found in s3db.json!`);
        expect(resourceMetadata).toBeDefined();
      }
    }

    console.log('\n5️⃣  Verifying resources have version information...\n');

    for (const resourceName of Object.keys(expectedResources)) {
      const resourceMetadata = metadata.resources[resourceName];

      if (resourceMetadata) {
        console.log(`   ${resourceName}:`);
        console.log(`     - currentVersion: ${resourceMetadata.currentVersion}`);
        console.log(`     - versions: ${Object.keys(resourceMetadata.versions || {}).join(', ')}`);

        expect(resourceMetadata.currentVersion).toBeDefined();
        expect(resourceMetadata.versions).toBeDefined();
        expect(Object.keys(resourceMetadata.versions).length).toBeGreaterThan(0);
      }
    }

    console.log('\n✅ All plugin-created resources are persisted correctly!\n');
  });

  it('should reload plugin-created resources from s3db.json after reconnect', async () => {
    console.log('\n🧪 Testing resource reload from s3db.json...\n');

    // Step 1: Create resources and plugin
    console.log('1️⃣  Creating resources and plugin...\n');

    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    // Force metadata save
    await database.uploadMetadataFile();

    const resourcesBefore = Object.keys(database.resources).sort();
    console.log(`   Resources before disconnect: ${resourcesBefore.length}`);
    console.log(`     ${resourcesBefore.join(', ')}`);

    // Save connection string for reconnection
    const connectionString = database.connectionString;

    // Step 2: Disconnect
    console.log('\n2️⃣  Disconnecting database...\n');
    await database.disconnect();

    // Step 3: Reconnect (should reload from s3db.json)
    console.log('3️⃣  Reconnecting database (should reload from s3db.json)...\n');

    const database2 = new (await import('../../src/database.class.js')).default({
      connectionString,
      forcePathStyle: true
    });
    await database2.connect();

    const resourcesAfter = Object.keys(database2.resources).sort();
    console.log(`   Resources after reconnect: ${resourcesAfter.length}`);
    console.log(`     ${resourcesAfter.join(', ')}`);

    // Step 4: Verify all resources were reloaded
    console.log('\n4️⃣  Verifying resources were reloaded...\n');

    const expectedResources = [
      'urls',
      'plg_urls_tx_clicks'
      // Note: locks no longer created as resources (using PluginStorage now)
    ];

    for (const resourceName of expectedResources) {
      const exists = database2.resources[resourceName];
      console.log(`   ${exists ? '✅' : '❌'} ${resourceName}: ${exists ? 'RELOADED' : 'MISSING'}`);
      expect(exists).toBeDefined();
    }

    console.log('\n✅ All resources successfully reloaded from s3db.json!\n');

    await database2.disconnect();
  }, 30000);

  it('should show correct createdBy in savedMetadata', async () => {
    console.log('\n🧪 Testing createdBy in savedMetadata...\n');

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
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync' },
      verbose: false
    });
    await database.usePlugin(plugin);

    // Force metadata save
    await database.uploadMetadataFile();

    console.log('1️⃣  Checking savedMetadata in memory...\n');

    // Check savedMetadata
    const metadata = database.savedMetadata;

    const expectedResources = {
      'urls': 'user',
      'plg_urls_tx_clicks': 'EventualConsistencyPlugin'
      // Note: locks no longer created as resources (using PluginStorage now)
    };

    for (const [resourceName, expectedCreatedBy] of Object.entries(expectedResources)) {
      const resourceMeta = metadata.resources[resourceName];
      console.log(`   ${resourceName}:`);
      console.log(`     - createdBy: ${resourceMeta?.createdBy}`);
      expect(resourceMeta?.createdBy).toBe(expectedCreatedBy);
    }

    console.log('\n✅ savedMetadata has correct createdBy values!\n');
  });
});
