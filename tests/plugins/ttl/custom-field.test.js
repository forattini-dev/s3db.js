
import { createDatabaseForTest } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Custom Field Support', () => {
  let db;
  let subscriptions;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-custom-field');
    await db.connect();

    subscriptions = await db.createResource({
      name: 'subscriptions',
      attributes: {
        id: 'string|optional',
        userId: 'string',
        endsAt: 'number'
      }
    });

    plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        subscriptions: {
          ttl: 1,
          field: 'endsAt',
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should use custom field for expiration', async () => {
    const pastTime = Date.now() - 2000;

    await subscriptions.insert({
      id: 'sub-1',
      userId: 'user-1',
      endsAt: pastTime
    });

    await plugin.runCleanup();

    const sub = await subscriptions.get('sub-1');
    expect(sub).toBeDefined();
    expect(sub.deletedat).toBeDefined();
    expect(sub.isdeleted).toBe('true');
  });
});
