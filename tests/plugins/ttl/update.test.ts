import { createDatabaseForTest } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Update Hook', () => {
  test('should reindex field-based TTL records after update', async () => {
    const db = createDatabaseForTest('ttl-v2-update-reindex');
    await db.connect();

    const subscriptions = await db.createResource({
      name: 'subscriptions',
      attributes: {
        id: 'string|optional',
        userId: 'string',
        expiresAt: 'number'
      }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        subscriptions: {
          ttl: 120,
          field: 'expiresAt',
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);

    const now = Date.now();
    await subscriptions.insert({
      id: 'sub-1',
      userId: 'user-1',
      expiresAt: now + (20 * 60 * 1000)
    });

    await subscriptions.update('sub-1', {
      userId: 'user-1',
      expiresAt: now - (121 * 1000)
    });

    await plugin.runCleanup();

    const refreshed = await subscriptions.get('sub-1').catch(() => null);
    expect(refreshed).toBeNull();

    await plugin.uninstall();
    await db.disconnect();
  });

  test('should not reindex when TTL index fields did not change', async () => {
    const db = createDatabaseForTest('ttl-v2-update-reindex-optimized');
    await db.connect();

    const subscriptions = await db.createResource({
      name: 'subscriptions',
      attributes: {
        id: 'string|optional',
        userId: 'string',
        expiresAt: 'number'
      }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        subscriptions: {
          ttl: 120,
          field: 'expiresAt',
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);

    const now = Date.now();
    await subscriptions.insert({
      id: 'sub-2',
      userId: 'user-2',
      expiresAt: now + (20 * 60 * 1000)
    });

    const indexResource = db.resources[(plugin as any).indexResourceName];
    const indexId = 'subscriptions:sub-2';
    const indexBefore = await indexResource.get(indexId) as { createdAt: number; expiresAtTimestamp: number };

    await subscriptions.update('sub-2', {
      userId: 'user-2-updated'
    });

    const indexAfter = await indexResource.get(indexId) as { createdAt: number; expiresAtTimestamp: number };

    expect(indexAfter.createdAt).toBe(indexBefore.createdAt);
    expect(indexAfter.expiresAtTimestamp).toBe(indexBefore.expiresAtTimestamp);

    await plugin.uninstall();
    await db.disconnect();
  });
});
