
import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Soft Delete Strategy', () => {
  let db;
  let sessions;
  let plugin;
  let suffix;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-soft-delete');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string'
      },
      timestamps: true  // Required for TTL to work correctly with _createdAt
    });

    plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        sessions: {
          ttl: 1,
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
    suffix = Math.floor(Math.random() * 1e6).toString(36);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should soft-delete expired session', async () => {
    await sessions.insert({ id: `session-expire-${suffix}`, token: 'token-1' });

    await sleep(1500);
    await plugin.runCleanup();

    const session = await sessions.get(`session-expire-${suffix}`);
    expect(session).toBeDefined();
    expect(session.deletedat).toBeDefined();
    expect(session.isdeleted).toBe('true');
    expect(session.token).toBe('token-1');
  });

  test('should not delete non-expired session', async () => {
    await sessions.insert({ id: `session-active-${suffix}`, token: 'token-2' });

    await plugin.runCleanup();

    const session = await sessions.get(`session-active-${suffix}`);
    expect(session).toBeDefined();
    expect(session.deletedat).toBeUndefined();
    expect(session.isdeleted).toBeUndefined();
  });

  test('should update stats after soft-delete', async () => {
    await sessions.insert({ id: `session-stats-${suffix}`, token: 'token-3' });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalSoftDeleted).toBeGreaterThan(statsBefore.totalSoftDeleted);
    expect(statsAfter.totalScans).toBeGreaterThan(statsBefore.totalScans);
  });
});
