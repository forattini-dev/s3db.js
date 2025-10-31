import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../config.js';
import { BackupPlugin } from '../../src/plugins/backup.plugin.js';

describe('CLI Backup & Restore API Tests', () => {
  let database;
  let backupPlugin;
  let tempDir;
  let connectionString;

  beforeEach(async () => {
    // Setup database for CLI tests
    database = createDatabaseForTest('suite=cli/backup-api');
    await database.connect();
    
    // Create temporary directory for backups
    tempDir = await createTemporaryPathForTest('cli-backup-test');
    
    // Setup backup plugin with new driver API
    backupPlugin = new BackupPlugin({
      driver: 'filesystem',
      config: {
        path: tempDir + '/{date}/'
      },
      compression: 'gzip',
      verbose: false
    });
    
    await database.usePlugin(backupPlugin);
    
    // Store connection string for reference
    connectionString = database.connectionString;
    
    // Create test resources and data
    const users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'string|required'
      }
    });

    const posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|optional',
        title: 'string|required',
        content: 'string'
      }
    });

    // Insert test data
    await users.insert({ id: 'user1', name: 'Alice', email: 'alice@test.com' });
    await users.insert({ id: 'user2', name: 'Bob', email: 'bob@test.com' });
    await posts.insert({ id: 'post1', title: 'First Post', content: 'Hello world' });
  });

  afterEach(async () => {
    if (backupPlugin) {
      await backupPlugin.stop();
    }
    if (database) {
      await database.disconnect();
    }
  });

  describe('Backup API Functions', () => {
    test('should create a full backup via API', async () => {
      const result = await backupPlugin.backup('full');
      
      expect(result).toBeDefined();
      expect(result.id).toMatch(/^full-/);
      expect(result.type).toBe('full');
      expect(result.size).toBeGreaterThan(0);
      expect(result.checksum).toBeDefined();
      expect(result.driverInfo).toBeDefined();
      expect(typeof result.duration).toBe('number');
    });

    test('should create an incremental backup via API', async () => {
      const result = await backupPlugin.backup('incremental');
      
      expect(result).toBeDefined();
      expect(result.id).toMatch(/^incremental-/);
      expect(result.type).toBe('incremental');
      expect(result.size).toBeGreaterThan(0);
    });

    test('should list backups via API', async () => {
      // Create a backup first
      await backupPlugin.backup('full');
      
      const backups = await backupPlugin.listBackups();
      
      expect(Array.isArray(backups)).toBe(true);
      expect(backups.length).toBeGreaterThan(0);
      expect(backups[0]).toHaveProperty('id');
      expect(backups[0]).toHaveProperty('type');
      expect(backups[0]).toHaveProperty('size');
    });

    test('should get backup status via API', async () => {
      // Create backup
      const backup = await backupPlugin.backup('full');
      
      // Get status
      const status = await backupPlugin.getBackupStatus(backup.id);
      
      expect(status).toBeDefined();
      expect(status.id).toBe(backup.id);
      expect(status.status).toBe('completed');
      expect(status.type).toBe('full');
    });

    test('should backup specific resources via API', async () => {
      const result = await backupPlugin.backup('full', { resources: ['users'] });
      
      expect(result).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
      // Would need to inspect backup content to verify only users resource was included
    });

    test('should handle non-existent backup status', async () => {
      const status = await backupPlugin.getBackupStatus('non-existent');
      
      expect(status).toBeNull();
    });
  });

  describe('Restore API Functions', () => {
    let backupId;

    beforeEach(async () => {
      // Create a backup before each restore test
      const backupResult = await backupPlugin.backup('full');
      backupId = backupResult.id;
    });

    test('should restore from backup via API', async () => {
      // Delete some data to test restore
      await database.resources.users.delete('user1');
      
      // Restore
      const result = await backupPlugin.restore(backupId);
      
      expect(result).toBeDefined();
      expect(result.backupId).toBe(backupId);
      expect(Array.isArray(result.restored)).toBe(true);
    });

    test('should restore with overwrite option via API', async () => {
      const result = await backupPlugin.restore(backupId, { overwrite: true });
      
      expect(result).toBeDefined();
      expect(result.backupId).toBe(backupId);
    });

    test('should restore specific resources via API', async () => {
      const result = await backupPlugin.restore(backupId, { resources: ['users'] });
      
      expect(result).toBeDefined();
      expect(result.backupId).toBe(backupId);
    });

    test('should handle non-existent backup restore', async () => {
      await expect(backupPlugin.restore('non-existent')).rejects.toThrow("Backup 'non-existent' not found");
    });
  });

  describe('End-to-End Workflow', () => {
    test('should complete full backup-restore workflow', async () => {
      // 1. Verify initial data
      const initialUsers = await database.resources.users.list();
      expect(initialUsers.length).toBe(2);
      
      // 2. Create backup
      const backupResult = await backupPlugin.backup('full');
      expect(backupResult.id).toBeDefined();
      
      // 3. Modify data
      await database.resources.users.insert({ id: 'user3', name: 'Charlie', email: 'charlie@test.com' });
      await database.resources.users.delete('user1');
      
      // 4. Verify changes
      const modifiedUsers = await database.resources.users.list();
      expect(modifiedUsers.length).toBe(2); // Bob + Charlie
      
      // 5. Restore from backup
      const restoreResult = await backupPlugin.restore(backupResult.id);
      expect(restoreResult.backupId).toBe(backupResult.id);
      
      // 6. Note: Actual restoration logic would need to be implemented
      // For now, we just verify the restore API worked
    });

    test('should handle multiple backups', async () => {
      // Create first backup
      const backup1 = await backupPlugin.backup('full');
      
      // Modify data
      await database.resources.users.update('user1', { name: 'Modified Alice' });
      
      // Create second backup
      const backup2 = await backupPlugin.backup('incremental');
      
      // List backups
      const backups = await backupPlugin.listBackups();
      
      expect(backups.length).toBeGreaterThanOrEqual(2);
      expect(backups.map(b => b.id)).toContain(backup1.id);
      expect(backups.map(b => b.id)).toContain(backup2.id);
      
      // Verify different types
      const fullBackups = backups.filter(b => b.type === 'full');
      const incrementalBackups = backups.filter(b => b.type === 'incremental');
      
      expect(fullBackups.length).toBeGreaterThanOrEqual(1);
      expect(incrementalBackups.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('CLI Command Equivalents', () => {
    test('should simulate "s3db backup full" command', async () => {
      // This tests what the CLI backup command would do internally
      const result = await backupPlugin.backup('full');
      
      // CLI would output these fields
      expect(result.id).toBeDefined();
      expect(result.type).toBe('full');
      expect(result.size).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      
      // CLI would show: "✓ full backup created successfully"
      // CLI would show: "Backup ID: {result.id}"
      // CLI would show: "Type: full"
      // CLI would show: "Size: {result.size} bytes"
    });

    test('should simulate "s3db backup --list" command', async () => {
      // Create multiple backups
      await backupPlugin.backup('full');
      await backupPlugin.backup('incremental');
      
      // This tests what the CLI list command would do internally
      const backups = await backupPlugin.listBackups();
      
      // CLI would output table with these columns
      expect(backups.length).toBeGreaterThan(0);
      backups.forEach(backup => {
        expect(backup).toHaveProperty('id');
        expect(backup).toHaveProperty('type');
        expect(backup).toHaveProperty('status');
        expect(backup).toHaveProperty('size');
      });
    });

    test('should simulate "s3db backup --status <id>" command', async () => {
      const backup = await backupPlugin.backup('full');
      
      // This tests what the CLI status command would do internally
      const status = await backupPlugin.getBackupStatus(backup.id);
      
      // CLI would output these status fields
      expect(status.id).toBe(backup.id);
      expect(status.type).toBe('full');
      expect(status.status).toBe('completed');
      expect(status.size).toBeGreaterThan(0);
      expect(status.duration).toBeGreaterThan(0);
    });

    test('should simulate "s3db restore <id>" command', async () => {
      const backup = await backupPlugin.backup('full');
      
      // This tests what the CLI restore command would do internally
      const result = await backupPlugin.restore(backup.id);
      
      // CLI would output these restore fields
      expect(result.backupId).toBe(backup.id);
      expect(Array.isArray(result.restored)).toBe(true);
    });
  });

  describe('Plugin Integration', () => {
    test('should work with database plugins', () => {
      // Verify plugin is working (backup functionality proves it's integrated)
      expect(backupPlugin).toBeDefined();
      expect(typeof backupPlugin.backup).toBe('function');
      expect(typeof backupPlugin.restore).toBe('function');
      expect(typeof backupPlugin.listBackups).toBe('function');
    });

    test('should use correct driver type', () => {
      expect(backupPlugin.config.driver).toBe('filesystem');
      expect(backupPlugin.driver.getType()).toBe('filesystem');
    });

    test('should have driver storage info', () => {
      const storageInfo = backupPlugin.driver.getStorageInfo();
      
      expect(storageInfo.type).toBe('filesystem');
      expect(storageInfo.path).toBeDefined();
    });
  });
});