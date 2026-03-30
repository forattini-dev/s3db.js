import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('TTLPlugin v2 - Lazy Mode', () => {
  test('should hide expired records via getOrNull without creating TTL index', async () => {
    const db = createDatabaseForTest('ttl-v2-lazy-soft-delete');
    await db.connect();

    const sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string'
      },
      timestamps: true
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      mode: 'lazy',
      resources: {
        sessions: {
          ttl: 1,
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);

    const id = `lazy-session-${uid()}`;
    await sessions.insert({ id, token: 'token-1' });
    await sleep(1200);

    const session = await sessions.getOrNull(id);
    expect(session).toBeNull();
    expect(db.resources[(plugin as any).indexResourceName]).toBeUndefined();

    const stats = plugin.getStats();
    expect(stats.totalExpired).toBe(1);
    expect(stats.totalSoftDeleted).toBe(1);
    expect(stats.cronJobs).toBe(0);

    await plugin.uninstall();
    await db.disconnect();
  });

  test('should make get throw not found for expired lazy TTL records', async () => {
    const db = createDatabaseForTest('ttl-v2-lazy-get');
    await db.connect();

    const sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string'
      },
      timestamps: true
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      mode: 'lazy',
      resources: {
        sessions: {
          ttl: 1,
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);

    const id = `lazy-session-get-${uid()}`;
    await sessions.insert({ id, token: 'token-2' });
    await sleep(1200);

    await expect(sessions.get(id)).rejects.toThrow(/not found|expired/i);

    await plugin.uninstall();
    await db.disconnect();
  });

  test('should hard-delete expired records lazily on read', async () => {
    const db = createDatabaseForTest('ttl-v2-lazy-hard-delete');
    await db.connect();

    const files = await db.createResource({
      name: 'temp_files',
      attributes: {
        id: 'string|optional',
        filename: 'string',
        expiresAt: 'datetime|required'
      }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      mode: 'lazy',
      resources: {
        temp_files: {
          field: 'expiresAt',
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);

    const id = `lazy-file-${uid()}`;
    await files.insert({
      id,
      filename: 'temp.txt',
      expiresAt: new Date(Date.now() - 1000).toISOString()
    });

    const file = await files.getOrNull(id);
    expect(file).toBeNull();

    const stats = plugin.getStats();
    expect(stats.totalExpired).toBe(1);
    expect(stats.totalDeleted).toBe(1);

    await plugin.uninstall();
    await db.disconnect();
  });

  test('should hide expired records from exists, list and query in lazy mode', async () => {
    const db = createDatabaseForTest('ttl-v2-lazy-collections');
    await db.connect();

    const sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string',
        kind: 'string'
      },
      timestamps: true
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      mode: 'lazy',
      resources: {
        sessions: {
          ttl: 1,
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);

    const expiredId = `lazy-expired-${uid()}`;
    const activeId = `lazy-active-${uid()}`;

    await sessions.insert({ id: expiredId, token: 'expired', kind: 'session' });
    await sleep(1200);
    await sessions.insert({ id: activeId, token: 'active', kind: 'session' });

    await expect(sessions.exists(expiredId)).resolves.toBe(false);
    await expect(sessions.exists(activeId)).resolves.toBe(true);

    const list = await sessions.list({ limit: 10, offset: 0 });
    expect(list.map(item => item.id)).toContain(activeId);
    expect(list.map(item => item.id)).not.toContain(expiredId);

    const query = await sessions.query({ kind: 'session' }, { limit: 10, offset: 0 });
    expect(query.map(item => item.id)).toContain(activeId);
    expect(query.map(item => item.id)).not.toContain(expiredId);

    await plugin.uninstall();
    await db.disconnect();
  });

  test('should exclude expired records from count and page in lazy mode', async () => {
    const db = createDatabaseForTest('ttl-v2-lazy-page-count');
    await db.connect();

    const sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string',
        kind: 'string'
      },
      timestamps: true
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      mode: 'lazy',
      resources: {
        sessions: {
          ttl: 1,
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);

    const expiredId = `lazy-page-expired-${uid()}`;
    const activeId1 = `lazy-page-active-1-${uid()}`;
    const activeId2 = `lazy-page-active-2-${uid()}`;

    await sessions.insert({ id: expiredId, token: 'expired', kind: 'session' });
    await sleep(1200);
    await sessions.insert({ id: activeId1, token: 'active-1', kind: 'session' });
    await sessions.insert({ id: activeId2, token: 'active-2', kind: 'session' });

    const count = await sessions.count();
    expect(count).toBe(2);

    const page = await sessions.page({ size: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.items.map(item => item.id)).toContain(activeId1);
    expect(page.items.map(item => item.id)).toContain(activeId2);
    expect(page.items.map(item => item.id)).not.toContain(expiredId);

    await plugin.uninstall();
    await db.disconnect();
  });
});
