
import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('TTLPlugin v2 - Soft Delete Strategy', () => {
  let db;
  let sessions;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-soft-delete');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string'
      },
      timestamps: true
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
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should soft-delete expired session', async () => {
    const id = `session-expire-${uid()}`;
    await sessions.insert({ id, token: 'token-1' });

    await sleep(2000);
    await plugin.runCleanup();

    const session = await sessions.get(id);
    expect(session).toBeDefined();
    expect(session.deletedat).toBeDefined();
    expect(session.isdeleted).toBe('true');
    expect(session.token).toBe('token-1');
  });

  test('should not delete non-expired session', async () => {
    const id = `session-active-${uid()}`;
    await sessions.insert({ id, token: 'token-2' });

    await plugin.runCleanup();

    const session = await sessions.get(id);
    expect(session).toBeDefined();
    expect(session.deletedat).toBeUndefined();
    expect(session.isdeleted).toBeUndefined();
  });

  test('should update stats after soft-delete', async () => {
    const scopedDb = createDatabaseForTest('ttl-v2-soft-delete-stats');
    await scopedDb.connect();

    const scopedSessions = await scopedDb.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string'
      },
      timestamps: true
    });

    const scopedPlugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        sessions: {
          ttl: 1,
          onExpire: 'soft-delete'
        }
      }
    });

    await scopedPlugin.install(scopedDb);

    const id = `session-stats-${uid()}`;
    await scopedSessions.insert({ id, token: 'token-3' });

    await sleep(2000);

    const statsBefore = scopedPlugin.getStats();
    await scopedPlugin.runCleanup();
    const statsAfter = scopedPlugin.getStats();

    expect(statsAfter.totalSoftDeleted).toBeGreaterThan(statsBefore.totalSoftDeleted);
    expect(statsAfter.totalScans).toBeGreaterThan(statsBefore.totalScans);

    await scopedPlugin.uninstall();
    await scopedDb.disconnect();
  });
});
