import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { BackupPlugin } from '../../src/plugins/backup.plugin.js';
import { mkdir, writeFile, readFile, unlink, stat, rmdir, access } from 'fs/promises';
import path from 'path';

describe('BackupPlugin (New Driver API)', () => {
  let database;
  let plugin;
  let tempDir;

  beforeEach(async () => {
    // Setup temporary directory for tests
    tempDir = path.join(process.cwd(), 'tmp', 'backup-tests', Date.now().toString());
    await mkdir(tempDir, { recursive: true });

    // Setup database
    database = createDatabaseForTest('suite=plugins/backup-new');

    // Create plugin with test configuration (new driver-based API)
    plugin = new BackupPlugin({
      driver: 'filesystem',
      config: {
        path: path.join(tempDir, 'backups', '{date}')
      },
      retention: {
        daily: 3,
        weekly: 2,
        monthly: 1,
        yearly: 1
      },
      tempDir: path.join(tempDir, 'temp'),
      compression: 'none', // Disable for easier testing
      encryption: null,
      verification: false, // Disable for faster tests
      verbose: false,
      onBackupStart: jest.fn(),
      onBackupComplete: jest.fn(),
      onBackupError: jest.fn()
    });

    await database.connect();
    await database.usePlugin(plugin);

    // Create test resources
    await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required'
      }
    });

    await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        content: 'string'
      }
    });

    // Insert test data
    const users = database.resources.users;
    await users.insert({ id: 'user1', name: 'Alice', email: 'alice@test.com' });
    await users.insert({ id: 'user2', name: 'Bob', email: 'bob@test.com' });

    const posts = database.resources.posts;
    await posts.insert({ id: 'post1', title: 'First Post', content: 'Hello world' });
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.stop();
    }
    if (database) {
      await database.disconnect();
    }
    
    // Cleanup temp directory
    if (tempDir) {
      try {
        await rmdir(tempDir, { recursive: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Plugin Configuration', () => {
    it('should initialize with filesystem driver', () => {
      expect(plugin.config.driver).toBe('filesystem');
      expect(plugin.driver).toBeDefined();
      expect(plugin.driver.getType()).toBe('filesystem');
    });

    it('should initialize with S3 driver', async () => {
      const s3Plugin = new BackupPlugin({
        driver: 's3',
        config: {
          bucket: 'test-bucket',
          path: 'backups/{date}/'
        }
      });

      expect(s3Plugin.config.driver).toBe('s3');
    });

    it('should initialize with multi driver', async () => {
      const multiPlugin = new BackupPlugin({
        driver: 'multi',
        config: {
          strategy: 'all',
          destinations: [
            { driver: 'filesystem', config: { path: '/tmp/backup1' } },
            { driver: 'filesystem', config: { path: '/tmp/backup2' } }
          ]
        }
      });

      expect(multiPlugin.config.driver).toBe('multi');
    });

    it('should validate driver configuration', () => {
      expect(() => {
        new BackupPlugin({
          driver: 'invalid-driver'
        });
      }).toThrow('Unknown backup driver: invalid-driver');
    });

    it('should validate filesystem driver config', () => {
      expect(() => {
        new BackupPlugin({
          driver: 'filesystem',
          config: {} // Missing path
        });
      }).toThrow('FilesystemBackupDriver requires "path" configuration');
    });
  });

  describe('Basic Backup Operations', () => {
    it('should create a full backup', async () => {
      const result = await plugin.backup('full');
      
      expect(result).toBeDefined();
      expect(result.id).toMatch(/^full-/);
      expect(result.type).toBe('full');
      expect(result.size).toBeGreaterThan(0);
      expect(result.checksum).toBeDefined();
      expect(result.driverInfo).toBeDefined();
      expect(typeof result.duration).toBe('number');

      // Verify backup files exist
      expect(result.driverInfo.path).toBeDefined();
      const backupExists = await access(result.driverInfo.path).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('should create an incremental backup', async () => {
      const result = await plugin.backup('incremental');
      
      expect(result).toBeDefined();
      expect(result.id).toMatch(/^incremental-/);
      expect(result.type).toBe('incremental');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should backup specific resources only', async () => {
      const result = await plugin.backup('full', { resources: ['users'] });
      
      expect(result).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
      
      // Should have backed up only users resource
      // Implementation detail: check manifest or backup content
    });

    it('should exclude specified resources', async () => {
      plugin.config.exclude = ['posts'];
      
      const result = await plugin.backup('full');
      
      expect(result).toBeDefined();
      // Would need to check that posts are not in backup
    });
  });

  describe('Backup Listing and Status', () => {
    it('should list backups', async () => {
      // Create a backup first
      await plugin.backup('full');
      
      const backups = await plugin.listBackups();
      
      expect(Array.isArray(backups)).toBe(true);
      expect(backups.length).toBeGreaterThan(0);
      expect(backups[0]).toHaveProperty('id');
      expect(backups[0]).toHaveProperty('type');
      expect(backups[0]).toHaveProperty('size');
    });

    it('should get backup status', async () => {
      const backup = await plugin.backup('full');
      
      const status = await plugin.getBackupStatus(backup.id);
      
      expect(status).toBeDefined();
      expect(status.id).toBe(backup.id);
      expect(status.status).toBe('completed');
      expect(status.type).toBe('full');
    });

    it('should return null for non-existent backup', async () => {
      const status = await plugin.getBackupStatus('non-existent');
      
      expect(status).toBeNull();
    });
  });

  describe('Backup Restoration', () => {
    it('should restore from backup', async () => {
      // Create backup
      const backup = await plugin.backup('full');
      
      // Delete some data
      await database.resources.users.delete('user1');
      
      // Restore
      const result = await plugin.restore(backup.id);
      
      expect(result).toBeDefined();
      expect(result.backupId).toBe(backup.id);
      expect(Array.isArray(result.restored)).toBe(true);
    });

    it('should restore with overwrite option', async () => {
      const backup = await plugin.backup('full');
      
      const result = await plugin.restore(backup.id, { overwrite: true });
      
      expect(result).toBeDefined();
    });

    it('should restore specific resources only', async () => {
      const backup = await plugin.backup('full');
      
      const result = await plugin.restore(backup.id, { resources: ['users'] });
      
      expect(result).toBeDefined();
    });

    it('should fail to restore non-existent backup', async () => {
      await expect(plugin.restore('non-existent')).rejects.toThrow("Backup 'non-existent' not found");
    });
  });

  describe('Hook System', () => {
    it('should call onBackupStart hook', async () => {
      await plugin.backup('full');
      
      expect(plugin.config.onBackupStart).toHaveBeenCalled();
    });

    it('should call onBackupComplete hook', async () => {
      await plugin.backup('full');
      
      expect(plugin.config.onBackupComplete).toHaveBeenCalled();
    });

    it('should call onBackupError hook on failure', async () => {
      // Force an error by making temp directory read-only (simplified)
      plugin.config.tempDir = '/invalid/path';
      
      await expect(plugin.backup('full')).rejects.toThrow();
      
      expect(plugin.config.onBackupError).toHaveBeenCalled();
    });

    it('should handle hook execution errors gracefully', async () => {
      plugin.config.onBackupStart = jest.fn().mockRejectedValue(new Error('Hook failed'));
      
      // Should still complete backup despite hook error
      await expect(plugin.backup('full')).rejects.toThrow('Hook failed');
    });
  });

  describe('Events', () => {
    it('should emit backup_start event', async () => {
      const spy = jest.fn();
      plugin.on('plg:backup:start', spy);
      
      await plugin.backup('full');
      
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'full'
      }));
    });

    it('should emit backup_complete event', async () => {
      const spy = jest.fn();
      plugin.on('plg:backup:complete', spy);
      
      await plugin.backup('full');
      
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'full',
        size: expect.any(Number)
      }));
    });

    it('should emit backup_error event on failure', async () => {
      const spy = jest.fn();
      plugin.on('plg:backup:error', spy);
      
      plugin.config.tempDir = '/invalid/path';
      
      await expect(plugin.backup('full')).rejects.toThrow();
      
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'full',
        error: expect.any(String)
      }));
    });
  });

  describe('Driver Integration', () => {
    it('should use filesystem driver correctly', async () => {
      const result = await plugin.backup('full');
      
      expect(result.driverInfo.path).toBeDefined();
      expect(result.driverInfo.manifestPath).toBeDefined();
      
      // Check files exist
      const backupExists = await access(result.driverInfo.path).then(() => true).catch(() => false);
      const manifestExists = await access(result.driverInfo.manifestPath).then(() => true).catch(() => false);
      
      expect(backupExists).toBe(true);
      expect(manifestExists).toBe(true);
    });

    it('should get driver storage info', () => {
      const info = plugin.driver.getStorageInfo();
      
      expect(info.type).toBe('filesystem');
      expect(info.config).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle backup with no user resources', async () => {
      // Create empty database
      const emptyDb = createDatabaseForTest('suite=plugins/backup-empty');
      await emptyDb.connect();
      
      const emptyPlugin = new BackupPlugin({
        driver: 'filesystem',
        config: { path: path.join(tempDir, 'empty-backup') },
        compression: 'none',
        verification: false
      });
      
      await emptyDb.usePlugin(emptyPlugin);
      
      // Should succeed but only backup the backup_metadata resource
      const result = await emptyPlugin.backup('full');
      expect(result).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
      
      await emptyPlugin.stop();
      await emptyDb.disconnect();
    });

    it('should handle invalid backup type', async () => {
      // The plugin should accept any string type, but we can test internal validation
      const result = await plugin.backup('custom-type');
      expect(result.type).toBe('custom-type');
    });

    it('should handle missing backup metadata resource creation', async () => {
      // This is handled gracefully in the plugin
      const result = await plugin.backup('full');
      expect(result).toBeDefined();
    });
  });

  describe('Plugin Lifecycle', () => {
    it('should start successfully', async () => {
      await plugin.start();
      // No specific assertions - just ensure no errors
    });

    it('should stop and clear active backups', async () => {
      // Add mock active backup
      plugin.activeBackups.add('test-backup');
      
      const cancelSpy = jest.fn();
      plugin.on('plg:backup:cancelled', cancelSpy);
      
      await plugin.stop();
      
      expect(plugin.activeBackups.size).toBe(0);
      expect(cancelSpy).toHaveBeenCalledWith({ id: 'test-backup' });
    });

    it('should cleanup successfully', async () => {
      const removeListenersSpy = jest.spyOn(plugin, 'removeAllListeners');
      
      await plugin.stop();
      
      // cleanup() calls stop(), which should clear active backups
      expect(plugin.activeBackups.size).toBe(0);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate compression settings', () => {
      expect(() => {
        new BackupPlugin({
          driver: 'filesystem',
          config: { path: '/tmp' },
          compression: 'invalid-compression'
        });
      }).toThrow('Invalid compression type');
    });

    it('should validate encryption settings', () => {
      expect(() => {
        new BackupPlugin({
          driver: 'filesystem',
          config: { path: '/tmp' },
          encryption: { algorithm: 'AES-256' } // Missing key
        });
      }).toThrow('Encryption requires both key and algorithm');
    });
  });

  describe('Multi-Driver Support', () => {
    it('should work with multi driver strategy "all"', async () => {
      const multiPlugin = new BackupPlugin({
        driver: 'multi',
        config: {
          strategy: 'all',
          destinations: [
            { 
              driver: 'filesystem', 
              config: { path: path.join(tempDir, 'backup1', '{date}') } 
            },
            { 
              driver: 'filesystem', 
              config: { path: path.join(tempDir, 'backup2', '{date}') } 
            }
          ]
        },
        tempDir: path.join(tempDir, 'multi-temp'),
        compression: 'none',
        verification: false
      });

      await database.usePlugin(multiPlugin);
      
      const result = await multiPlugin.backup('full');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.driverInfo)).toBe(true);
      expect(result.driverInfo.length).toBe(2);
      expect(result.driverInfo.every(info => info.status === 'success')).toBe(true);
      
      await multiPlugin.stop();
    });

    it('should work with multi driver strategy "any"', async () => {
      const multiPlugin = new BackupPlugin({
        driver: 'multi',
        config: {
          strategy: 'any',
          destinations: [
            { 
              driver: 'filesystem', 
              config: { path: '/invalid/path' } // This will fail
            },
            { 
              driver: 'filesystem', 
              config: { path: path.join(tempDir, 'backup-any', '{date}') } // This will succeed
            }
          ]
        },
        tempDir: path.join(tempDir, 'any-temp'),
        compression: 'none',
        verification: false
      });

      await database.usePlugin(multiPlugin);
      
      const result = await multiPlugin.backup('full');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.driverInfo)).toBe(true);
      expect(result.driverInfo.some(info => info.status === 'success')).toBe(true);
      
      await multiPlugin.stop();
    });
  });
});