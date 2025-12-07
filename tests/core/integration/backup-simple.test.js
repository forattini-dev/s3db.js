import { BackupPlugin } from '../../../src/plugins/backup.plugin.js';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { rm } from 'fs/promises';

describe.skip('Backup Integration (Simple)', () => {
  let database;
  let backupPlugin;
  let tempBackupDir;
  let currentBackup;

  beforeAll(async () => {
    database = createDatabaseForTest('suite=integration/backup-simple');
    await database.connect();

    tempBackupDir = await createTemporaryPathForTest('backup-simple-test');

    backupPlugin = new BackupPlugin({
      logLevel: 'silent',
      driver: 'filesystem',
      config: {
        path: tempBackupDir
      },
      compression: 'none',
      verification: false,
      logLevel: 'silent'
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
  
  beforeEach(async () => {
    // Create a fresh backup before each test
    currentBackup = await backupPlugin.backup('full');
    // Wait for filesystem consistency
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(currentBackup.id).toBeDefined();
  });

  afterAll(async () => {
    if (backupPlugin) {
      await backupPlugin.stop();
    }
    if (database) {
      await database.disconnect();
    }
    // Explicitly clean up the temporary backup directory
    if (tempBackupDir) {
        await rm(tempBackupDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test('should create and list backups', async () => {
    const backup = currentBackup;
    expect(backup.id).toBeDefined();
    expect(backup.type).toBe('full');

    const backups = await backupPlugin.listBackups();
    expect(backups.length).toBeGreaterThan(0);
    expect(backups.some(b => b.id === currentBackup.id)).toBe(true);
  }, 20000);

  test('should get backup status', async () => {
    const backup = currentBackup;
    console.log('Testing getBackupStatus for:', backup.id);
    
    const allBackups = await backupPlugin.listBackups();
    console.log('Available backups:', allBackups.map(b => b.id));

    const status = await backupPlugin.getBackupStatus(currentBackup.id);
    console.log('Status result:', status);
    
    expect(status).toBeDefined();
    expect(status.id).toBe(currentBackup.id);
    expect(status.status).toBe('completed');
  }, 20000);

  test('should restore backup', async () => {
    const backup = currentBackup;
    const result = await backupPlugin.restore(currentBackup.id);
    
    expect(result.backupId).toBe(currentBackup.id);
    expect(Array.isArray(result.restored)).toBe(true);
  }, 20000);
});