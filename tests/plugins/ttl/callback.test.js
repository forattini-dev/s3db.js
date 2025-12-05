
import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Callback Strategy', () => {
  let db;
  let customData;
  let plugin;
  let callbackInvoked;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-callback');
    await db.connect();

    customData = await db.createResource({
      name: 'custom_data',
      attributes: {
        id: 'string|optional',
        value: 'string',
        priority: 'string'
      }
    });

    callbackInvoked = [];

    plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        custom_data: {
          ttl: 1,
          onExpire: 'callback',
          callback: async record => {
            callbackInvoked.push(record.id);
            return record.priority !== 'high';
          }
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should invoke callback for expired record', async () => {
    await customData.insert({
      id: 'data-1',
      value: 'test',
      priority: 'low'
    });

    await sleep(1500);

    callbackInvoked = [];
    await plugin.runCleanup();

    expect(callbackInvoked).toContain('data-1');
  });

  test('should delete when callback returns true', async () => {
    await customData.insert({
      id: 'data-2',
      value: 'test2',
      priority: 'low'
    });

    await sleep(1500);
    await plugin.runCleanup();

    const record = await customData.get('data-2').catch(() => null);
    expect(record).toBeNull();
  });

  test('should not delete when callback returns false', async () => {
    await customData.insert({
      id: 'data-3',
      value: 'test3',
      priority: 'high'
    });

    await sleep(1500);
    await plugin.runCleanup();

    const record = await customData.get('data-3');
    expect(record).toBeDefined();
    expect(record.priority).toBe('high');
  });

  test('should update stats after callback', async () => {
    await customData.insert({
      id: 'data-4',
      value: 'test4',
      priority: 'medium'
    });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalCallbacks).toBeGreaterThan(statsBefore.totalCallbacks);
  });
});
