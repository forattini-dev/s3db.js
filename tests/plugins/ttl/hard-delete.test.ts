
import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('TTLPlugin v2 - Hard Delete Strategy', () => {
  let db;
  let tempFiles;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-hard-delete');
    await db.connect();

    tempFiles = await db.createResource({
      name: 'temp_files',
      attributes: {
        id: 'string|optional',
        filename: 'string'
      }
    });

    plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        temp_files: {
          ttl: 1,
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should hard-delete expired file', async () => {
    const id = `file-expire-${uid()}`;
    await tempFiles.insert({ id, filename: 'temp.txt' });

    await sleep(2000);
    await plugin.runCleanup();

    const file = await tempFiles.get(id).catch(() => null);
    expect(file).toBeNull();
  });

  test('should not delete non-expired file', async () => {
    const id = `file-active-${uid()}`;
    await tempFiles.insert({ id, filename: 'temp2.txt' });

    await plugin.runCleanup();

    const file = await tempFiles.get(id);
    expect(file).toBeDefined();
    expect(file.filename).toBe('temp2.txt');
  });

  test('should update stats after hard-delete', async () => {
    const scopedDb = createDatabaseForTest('ttl-v2-hard-delete-stats');
    await scopedDb.connect();

    const scopedFiles = await scopedDb.createResource({
      name: 'temp_files',
      attributes: {
        id: 'string|optional',
        filename: 'string'
      }
    });

    const scopedPlugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        temp_files: {
          ttl: 1,
          onExpire: 'hard-delete'
        }
      }
    });

    await scopedPlugin.install(scopedDb);

    const id = `file-stats-${uid()}`;
    await scopedFiles.insert({ id, filename: 'temp3.txt' });

    await sleep(2000);

    const statsBefore = scopedPlugin.getStats();
    await scopedPlugin.runCleanup();
    const statsAfter = scopedPlugin.getStats();

    expect(statsAfter.totalDeleted).toBeGreaterThan(statsBefore.totalDeleted);

    await scopedPlugin.uninstall();
    await scopedDb.disconnect();
  });

  test('should remove stale TTL index entries for unmanaged resources', async () => {
    const indexResource = db.resources[(plugin as any).indexResourceName];
    const staleEntryId = `stale-entry-${uid()}`;
    const now = new Date();

    await indexResource.insert({
      id: staleEntryId,
      resourceName: 'legacy_resource',
      recordId: 'legacy-1',
      expiresAtCohort: now.toISOString().substring(0, 16),
      expiresAtTimestamp: now.getTime() - 1000,
      granularity: 'minute',
      createdAt: Date.now()
    });

    const before = await indexResource.get(staleEntryId).catch(() => null);
    expect(before).toBeDefined();

    await plugin.runCleanup();

    const after = await indexResource.get(staleEntryId).catch(() => null);
    expect(after).toBeNull();
  });

  test('should remove stale TTL index entries when managed resource is missing from database', async () => {
    const scopedDb = createDatabaseForTest('ttl-v2-orphan-resource');
    await scopedDb.connect();

    const scopedResource = await scopedDb.createResource({
      name: 'ephemeral_files',
      attributes: { id: 'string|optional', filename: 'string' }
    });

    const scopedPlugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        ephemeral_files: {
          ttl: 1,
          onExpire: 'hard-delete'
        }
      }
    });

    await scopedPlugin.install(scopedDb);

    const indexResource = scopedDb.resources[(scopedPlugin as any).indexResourceName];
    const now = new Date();
    const recordId = `missing-${uid()}`;
    const entryId = `ephemeral_files:${recordId}`;

    await scopedResource.insert({ id: recordId, filename: 'lost.txt' });

    await indexResource.upsert({
      id: entryId,
      resourceName: 'ephemeral_files',
      recordId,
      expiresAtCohort: now.toISOString().substring(0, 16),
      expiresAtTimestamp: now.getTime() - 1000,
      granularity: 'minute',
      createdAt: Date.now()
    });

    const originalResource = scopedDb.resources.ephemeral_files;
    delete (scopedDb as any).resources.ephemeral_files;

    await scopedPlugin.runCleanup();

    const after = await indexResource.get(entryId).catch(() => null);
    expect(after).toBeNull();

    scopedDb.resources.ephemeral_files = originalResource;
    await scopedPlugin.uninstall();
    await scopedDb.disconnect();
  });
});
