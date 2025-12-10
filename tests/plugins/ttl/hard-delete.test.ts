
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
});
