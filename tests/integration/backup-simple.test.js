import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { BackupPlugin } from '../../src/plugins/backup.plugin.js';
import { createDatabaseForTest, createTemporaryPathForTest } from '../config.js';

describe('Backup Integration (Simple)', () => {
  let database;
  let backupPlugin;
  let tempBackupDir;

  beforeAll(async () => {
    database = createDatabaseForTest('suite=integration/backup-simple');
    await database.connect();

    tempBackupDir = await createTemporaryPathForTest('backup-simple-test');

    backupPlugin = new BackupPlugin({
      driver: 'filesystem',
      config: {
        path: tempBackupDir + '/{date}/'
      },
      compression: 'none',
      verification: false,
      verbose: false
    });

    await database.usePlugin(backupPlugin);

    // Create simple test data
    const users = await database.createResource({
      name: 'simple_users',
      attributes: {
        id: 'string|optional',
        name: 'string|required'
      }
    });

    await users.insert({ id: 'user1', name: 'Alice' });
    await users.insert({ id: 'user2', name: 'Bob' });
  });

  afterAll(async () => {
    if (backupPlugin) {
      await backupPlugin.stop();
    }
    if (database) {
      await database.disconnect();
    }
  });

  test('should create and list backups', async () => {
    const backup = await backupPlugin.backup('full');
    expect(backup.id).toBeDefined();
    expect(backup.type).toBe('full');

    const backups = await backupPlugin.listBackups();
    expect(backups.length).toBeGreaterThan(0);
    expect(backups.some(b => b.id === backup.id)).toBe(true);
  }, 20000);

  test('should get backup status', async () => {
    const backup = await backupPlugin.backup('full');
    const status = await backupPlugin.getBackupStatus(backup.id);
    
    expect(status).toBeDefined();
    expect(status.id).toBe(backup.id);
    expect(status.status).toBe('completed');
  }, 20000);

  test('should restore backup', async () => {
    const backup = await backupPlugin.backup('full');
    const result = await backupPlugin.restore(backup.id);
    
    expect(result.backupId).toBe(backup.id);
    expect(Array.isArray(result.restored)).toBe(true);
  }, 20000);
});