import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('TTLPlugin v2 - Callback Strategy', () => {
  test('should keep record and index when callback returns false', async () => {
    const db = createDatabaseForTest('ttl-v2-callback-false');
    await db.connect();

    const items = await db.createResource({
      name: 'callback_items',
      attributes: {
        id: 'string|optional',
        name: 'string'
      }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        callback_items: {
          ttl: 1,
          onExpire: 'callback',
          callback: async () => false
        }
      }
    });

    await plugin.install(db);

    const id = `cb-keep-${uid()}`;
    await items.insert({ id, name: 'keep-me' });
    await sleep(2000);

    const indexResource = db.resources[(plugin as any).indexResourceName];
    const indexEntryId = `callback_items:${id}`;

    await plugin.runCleanup();

    const item = await items.get(id);
    expect(item).toBeDefined();

    const indexEntry = await indexResource.get(indexEntryId).catch(() => null);
    expect(indexEntry).toBeDefined();

    const stats = plugin.getStats();
    expect(stats.totalCallbacks).toBe(1);

    await plugin.uninstall();
    await db.disconnect();
  });

  test('should throw when callback does not return boolean', async () => {
    const db = createDatabaseForTest('ttl-v2-callback-invalid');
    await db.connect();

    const items = await db.createResource({
      name: 'callback_items_bad_return',
      attributes: {
        id: 'string|optional',
        name: 'string'
      }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        callback_items_bad_return: {
          ttl: 1,
          onExpire: 'callback',
          callback: async () => 'false' as any
        }
      }
    });

    await plugin.install(db);

    const id = `cb-bad-${uid()}`;
    await items.insert({ id, name: 'bad-result' });
    await sleep(2000);

    await plugin.runCleanup();

    const item = await items.get(id).catch(() => null);
    expect(item).toBeDefined();
    expect(plugin.getStats().totalErrors).toBeGreaterThan(0);

    await plugin.uninstall();
    await db.disconnect();
  });
});
