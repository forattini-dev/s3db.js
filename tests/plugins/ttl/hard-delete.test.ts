
import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

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
    await tempFiles.insert({ id: 'file-1', filename: 'temp.txt' });

    await sleep(1500);
    await plugin.runCleanup();

    const file = await tempFiles.get('file-1').catch(() => null);
    expect(file).toBeNull();
  });

  test('should not delete non-expired file', async () => {
    await tempFiles.insert({ id: 'file-2', filename: 'temp2.txt' });

    await plugin.runCleanup();

    const file = await tempFiles.get('file-2');
    expect(file).toBeDefined();
    expect(file.filename).toBe('temp2.txt');
  });

  test('should update stats after hard-delete', async () => {
    await tempFiles.insert({ id: 'file-3', filename: 'temp3.txt' });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalDeleted).toBeGreaterThan(statsBefore.totalDeleted);
  });

  test('should remove stale TTL index entries for unmanaged resources', async () => {
    const indexResource = db.resources[(plugin as any).indexResourceName];
    const staleEntryId = 'stale-entry-legacy';
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
    const entryId = 'ephemeral_files:missing-resource';

    await scopedResource.insert({ id: 'missing-resource', filename: 'lost.txt' });

    await indexResource.insert({
      id: entryId,
      resourceName: 'ephemeral_files',
      recordId: 'missing-resource',
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
