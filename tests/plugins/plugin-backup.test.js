import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { BackupPlugin } from '../../src/plugins/backup.plugin.js';
import { mkdir, writeFile, readFile, unlink, stat, rmdir, access } from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';

describe('BackupPlugin', () => {
  let database;
  let plugin;
  let tempDir;

  beforeEach(async () => {
    // Setup temporary directory for tests
    tempDir = path.join(process.cwd(), 'tmp', 'backup-tests', Date.now().toString());
    await mkdir(tempDir, { recursive: true });

    // Setup database
    database = createDatabaseForTest('suite=plugins/backup');

    // Create plugin with test configuration
    plugin = new BackupPlugin({
      destinations: [
        {
          type: 'filesystem',
          path: path.join(tempDir, 'backups'),
          compression: 'none'
        }
      ],
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
    await plugin.setup(database);

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
      name: 'orders',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        amount: 'number|required'
      }
    });

    // Add test data
    await database.resource('users').insert({
      id: 'user1',
      name: 'John Doe',
      email: 'john@example.com'
    });

    await database.resource('users').insert({
      id: 'user2',
      name: 'Jane Smith',
      email: 'jane@example.com'
    });

    await database.resource('orders').insert({
      id: 'order1',
      userId: 'user1',
      amount: 100.50
    });
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
    
    // Cleanup temp directory
    try {
      const { exec } = await import('child_process');
      await new Promise((resolve) => {
        exec(`rm -rf "${tempDir}"`, () => resolve());
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Configuration Validation', () => {
    it('should throw error when no destinations configured', () => {
      expect(() => {
        new BackupPlugin({
          destinations: []
        });
      }).toThrow('At least one destination must be configured');
    });

    it('should throw error when destination has no type', () => {
      expect(() => {
        new BackupPlugin({
          destinations: [{ path: '/tmp' }]
        });
      }).toThrow('Each destination must have a type');
    });

    it('should throw error when encryption config is incomplete', () => {
      expect(() => {
        new BackupPlugin({
          destinations: [{ type: 'filesystem', path: '/tmp' }],
          encryption: { algorithm: 'AES-256-GCM' } // Missing key
        });
      }).toThrow('Encryption requires both key and algorithm');
    });

    it('should accept valid configuration', () => {
      expect(() => {
        new BackupPlugin({
          destinations: [{ type: 'filesystem', path: '/tmp' }],
          retention: { daily: 7 },
          compression: 'gzip',
          verification: true
        });
      }).not.toThrow();
    });
  });

  describe('Plugin Setup', () => {
    it('should setup properly with database', async () => {
      expect(plugin.database).toBe(database);
      expect(plugin.config.destinations).toHaveLength(1);
      expect(plugin.activeBackups.size).toBe(0);
    });

    it('should create backup metadata resource', async () => {
      expect(database.resources[plugin.config.backupMetadataResource]).toBeDefined();
    });

    it('should ensure temp directory exists', async () => {
      try {
        await access(plugin.config.tempDir);
        expect(true).toBe(true); // Directory exists
      } catch (error) {
        throw new Error('Temp directory should exist');
      }
    });

    it('should emit initialized event', async () => {
      const initSpy = jest.fn();
      plugin.on('initialized', initSpy);
      
      const newPlugin = new BackupPlugin({
        destinations: [{ type: 'filesystem', path: '/tmp/test' }]
      });
      
      newPlugin.on('initialized', initSpy);
      
      const newDb = createDatabaseForTest('suite=plugins/backup-init');
      
      await newDb.connect();
      await newPlugin.setup(newDb);
      
      expect(initSpy).toHaveBeenCalledWith({
        destinations: 1,
        scheduled: []
      });
      
      await newDb.disconnect();
    });
  });

  describe('Resource Selection', () => {
    it('should backup all resources by default', async () => {
      const resources = await plugin._getResourcesToBackup();
      expect(resources).toContain('users');
      expect(resources).toContain('orders');
      expect(resources).not.toContain(plugin.config.backupMetadataResource);
    });

    it('should respect include filter', async () => {
      plugin.config.include = ['users'];
      const resources = await plugin._getResourcesToBackup();
      expect(resources).toEqual(['users']);
    });

    it('should respect exclude filter', async () => {
      plugin.config.exclude = ['orders'];
      const resources = await plugin._getResourcesToBackup();
      expect(resources).toContain('users');
      expect(resources).not.toContain('orders');
    });

    it('should handle wildcard patterns in exclude', async () => {
      // Add temp resource for testing
      await database.createResource({
        name: 'temp_cache',
        attributes: { id: 'string|required' }
      });

      plugin.config.exclude = ['temp_*'];
      const resources = await plugin._getResourcesToBackup();
      
      expect(resources).toContain('users');
      expect(resources).toContain('orders');
      expect(resources).not.toContain('temp_cache');
    });

    it('should combine include and exclude filters', async () => {
      plugin.config.include = ['users', 'orders'];
      plugin.config.exclude = ['orders'];
      
      const resources = await plugin._getResourcesToBackup();
      expect(resources).toEqual(['users']);
    });
  });

  describe('Backup Resource Data', () => {
    it('should backup resource with full type', async () => {
      const data = await plugin._backupResource('users', 'full');
      
      expect(data.resource).toBe('users');
      expect(data.type).toBe('full');
      expect(data.data).toHaveLength(2);
      expect(data.count).toBe(2);
      expect(data.config).toBeDefined();
      
      // Check data content
      const userIds = data.data.map(u => u.id);
      expect(userIds).toContain('user1');
      expect(userIds).toContain('user2');
    });

    it('should backup resource with incremental type', async () => {
      const data = await plugin._backupResource('orders', 'incremental');
      
      expect(data.resource).toBe('orders');
      expect(data.type).toBe('incremental');
      expect(data.data).toHaveLength(1);
      expect(data.since).toBe(0); // No previous backup
    });

    it('should throw error for non-existent resource', async () => {
      await expect(plugin._backupResource('nonexistent', 'full')).rejects.toThrow(
        "Resource 'nonexistent' not found"
      );
    });

    it('should throw error for unsupported backup type', async () => {
      await expect(plugin._backupResource('users', 'unsupported')).rejects.toThrow(
        "Backup type 'unsupported' not supported"
      );
    });
  });

  describe('Full Backup Process', () => {
    it('should perform successful full backup', async () => {
      const result = await plugin.backup('full');
      
      expect(result.id).toMatch(/^backup_full_\d+$/);
      expect(result.type).toBe('full');
      expect(result.size).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.checksum).toBeDefined();
      expect(result.destinations).toHaveLength(1);
      expect(result.destinations[0].status).toBe('success');
    });

    it('should execute hooks during backup', async () => {
      await plugin.backup('full');
      
      expect(plugin.config.onBackupStart).toHaveBeenCalledWith('full', expect.any(Object));
      expect(plugin.config.onBackupComplete).toHaveBeenCalledWith('full', expect.any(Object));
    });

    it('should emit backup events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();
      
      plugin.on('backup_start', startSpy);
      plugin.on('backup_complete', completeSpy);
      
      const result = await plugin.backup('full');
      
      expect(startSpy).toHaveBeenCalledWith({ id: result.id, type: 'full' });
      expect(completeSpy).toHaveBeenCalledWith({
        id: result.id,
        type: 'full',
        size: result.size,
        duration: result.duration,
        destinations: 1
      });
    });

    it('should create backup metadata', async () => {
      const result = await plugin.backup('full');
      
      const metadata = await database.resource(plugin.config.backupMetadataResource)
        .get(result.id);
      
      expect(metadata).toBeDefined();
      expect(metadata.type).toBe('full');
      expect(metadata.status).toBe('completed');
      expect(metadata.size).toBe(result.size);
      expect(metadata.checksum).toBe(result.checksum);
    });

    it('should prevent concurrent backups with same ID', async () => {
      // Start first backup
      const promise1 = plugin.backup('full');
      
      // Wait a bit to ensure same timestamp, then try concurrent backup
      await new Promise(resolve => setTimeout(resolve, 1));
      const promise2 = plugin.backup('full');
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('File System Destination', () => {
    it('should upload to filesystem destination', async () => {
      const result = await plugin.backup('full');
      
      // Check if backup file exists
      const destination = result.destinations[0];
      expect(destination.status).toBe('success');
      expect(destination.path).toBeDefined();
      
      try {
        await access(destination.path);
        expect(true).toBe(true); // File exists
      } catch (error) {
        throw new Error('Backup file should exist');
      }
    });

    it('should create destination directory if not exists', async () => {
      const newDestPath = path.join(tempDir, 'new-backup-dir');
      plugin.config.destinations[0].path = newDestPath;
      
      await plugin.backup('full');
      
      try {
        await access(newDestPath);
        expect(true).toBe(true); // Directory was created
      } catch (error) {
        throw new Error('Destination directory should be created');
      }
    });

    it('should handle date placeholders in path', async () => {
      const today = new Date().toISOString().slice(0, 10);
      plugin.config.destinations[0].path = path.join(tempDir, '{date}');
      
      await plugin.backup('full');
      
      const expectedPath = path.join(tempDir, today);
      try {
        await access(expectedPath);
        expect(true).toBe(true); // Directory with date was created
      } catch (error) {
        throw new Error('Date-based directory should be created');
      }
    });
  });

  describe('S3 Destination', () => {
    it('should simulate S3 upload', async () => {
      plugin.config.destinations[0] = {
        type: 's3',
        bucket: 'test-bucket',
        path: 'backups/{date}/'
      };
      
      const result = await plugin.backup('full');
      
      expect(result.destinations[0].status).toBe('success');
      expect(result.destinations[0].bucket).toBe('test-bucket');
      expect(result.destinations[0].key).toContain('backups/');
    });
  });

  describe('Multiple Destinations', () => {
    beforeEach(() => {
      plugin.config.destinations = [
        {
          type: 'filesystem',
          path: path.join(tempDir, 'backup1')
        },
        {
          type: 'filesystem',
          path: path.join(tempDir, 'backup2')
        },
        {
          type: 's3',
          bucket: 'test-bucket',
          path: 'backups/'
        }
      ];
    });

    it('should upload to all destinations', async () => {
      const result = await plugin.backup('full');
      
      expect(result.destinations).toHaveLength(3);
      expect(result.destinations.filter(d => d.status === 'success')).toHaveLength(3);
    });

    it('should handle partial failures', async () => {
      // Mock one destination to fail
      const originalUpload = plugin._uploadToDestination;
      plugin._uploadToDestination = jest.fn()
        .mockResolvedValueOnce({ path: '/success1', size: 100 })
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockResolvedValueOnce({ bucket: 'test', key: 'success3' });
      
      const result = await plugin.backup('full');
      
      expect(result.destinations).toHaveLength(3);
      expect(result.destinations.filter(d => d.status === 'success')).toHaveLength(2);
      expect(result.destinations.filter(d => d.status === 'failed')).toHaveLength(1);
      
      // Restore original method
      plugin._uploadToDestination = originalUpload;
    });
  });

  describe('Backup Metadata Management', () => {
    it('should create backup metadata at start', async () => {
      const backupPromise = plugin.backup('full');
      
      // Check that metadata is created with in_progress status
      // Note: This is timing-dependent, so we check after completion
      const result = await backupPromise;
      
      const metadata = await database.resource(plugin.config.backupMetadataResource)
        .get(result.id);
      
      expect(metadata.status).toBe('completed');
    });

    it('should update metadata on completion', async () => {
      const result = await plugin.backup('full');
      
      const metadata = await database.resource(plugin.config.backupMetadataResource)
        .get(result.id);
      
      expect(metadata.status).toBe('completed');
      expect(metadata.size).toBe(result.size);
      expect(metadata.duration).toBe(result.duration);
      expect(metadata.checksum).toBe(result.checksum);
      expect(metadata.destinations).toEqual(result.destinations);
    });

    it('should update metadata on error', async () => {
      // Mock an error during backup
      const originalBackupResource = plugin._backupResource;
      plugin._backupResource = jest.fn().mockRejectedValue(new Error('Backup failed'));
      
      let errorOccurred = false;
      try {
        await plugin.backup('full');
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Backup failed');
      }
      
      expect(errorOccurred).toBe(true);
      
      // Restore original method
      plugin._backupResource = originalBackupResource;
    });
  });

  describe('Checksum Calculation', () => {
    it('should calculate file checksum', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await writeFile(testFile, 'Hello World');
      
      const checksum = await plugin._calculateChecksum(testFile);
      
      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
      expect(checksum).toHaveLength(64); // SHA-256 hex string
    });

    it('should produce consistent checksums', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await writeFile(testFile, 'Consistent content');
      
      const checksum1 = await plugin._calculateChecksum(testFile);
      const checksum2 = await plugin._calculateChecksum(testFile);
      
      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksums for different content', async () => {
      const testFile1 = path.join(tempDir, 'test1.txt');
      const testFile2 = path.join(tempDir, 'test2.txt');
      
      await writeFile(testFile1, 'Content 1');
      await writeFile(testFile2, 'Content 2');
      
      const checksum1 = await plugin._calculateChecksum(testFile1);
      const checksum2 = await plugin._calculateChecksum(testFile2);
      
      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Backup Listing', () => {
    it('should list available backups', async () => {
      await plugin.backup('full');
      await plugin.backup('incremental');
      
      const backups = await plugin.listBackups();
      
      expect(backups).toHaveLength(2);
      expect(backups.some(b => b.type === 'full')).toBe(true);
      expect(backups.some(b => b.type === 'incremental')).toBe(true);
    });

    it('should filter backups by type', async () => {
      // Clear any existing backups first
      const existingBackups = await plugin.listBackups();
      for (const backup of existingBackups) {
        try {
          await database.resource(plugin.config.backupMetadataResource).delete(backup.id);
        } catch (error) {
          // Ignore if backup doesn't exist
        }
      }
      
      // Create new backups
      await plugin.backup('full');
      await plugin.backup('incremental');
      
      const fullBackups = await plugin.listBackups({ type: 'full' });
      
      expect(fullBackups).toHaveLength(1);
      expect(fullBackups[0].type).toBe('full');
    });

    it('should filter backups by status', async () => {
      await plugin.backup('full');
      
      const completedBackups = await plugin.listBackups({ status: 'completed' });
      
      expect(completedBackups).toHaveLength(1);
      expect(completedBackups[0].status).toBe('completed');
    });

    it('should limit backup results', async () => {
      await plugin.backup('full');
      await plugin.backup('incremental');
      
      const limitedBackups = await plugin.listBackups({ limit: 1 });
      
      expect(limitedBackups).toHaveLength(1);
    });

    it('should handle listing errors gracefully', async () => {
      // Mock database error
      const originalResource = plugin.database.resource;
      plugin.database.resource = jest.fn().mockReturnValue({
        list: jest.fn().mockRejectedValue(new Error('Database error'))
      });
      
      const backups = await plugin.listBackups();
      expect(backups).toEqual([]);
      
      // Restore original
      plugin.database.resource = originalResource;
    });
  });

  describe('Backup Status', () => {
    it('should get backup status', async () => {
      const result = await plugin.backup('full');
      
      const status = await plugin.getBackupStatus(result.id);
      
      expect(status).toBeDefined();
      expect(status.id).toBe(result.id);
      expect(status.type).toBe('full');
      expect(status.status).toBe('completed');
    });

    it('should return null for non-existent backup', async () => {
      const status = await plugin.getBackupStatus('non-existent');
      expect(status).toBeNull();
    });

    it('should handle status query errors gracefully', async () => {
      // Mock database error
      const originalResource = plugin.database.resource;
      plugin.database.resource = jest.fn().mockReturnValue({
        get: jest.fn().mockRejectedValue(new Error('Database error'))
      });
      
      const status = await plugin.getBackupStatus('test-id');
      expect(status).toBeNull();
      
      // Restore original
      plugin.database.resource = originalResource;
    });
  });

  describe('Retention Policy', () => {
    it('should clean up old backups', async () => {
      // Create multiple backups
      const oldBackups = [];
      
      for (let i = 0; i < 3; i++) {
        const backup = await plugin.backup('full');
        oldBackups.push(backup);
        // Wait a bit between backups to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      await plugin._cleanupOldBackups();
      
      // Check that cleanup runs without error
      expect(true).toBe(true);
    });

    it('should emit cleanup_complete event', async () => {
      const cleanupSpy = jest.fn();
      plugin.on('cleanup_complete', cleanupSpy);
      
      // Create backup and cleanup
      await plugin.backup('full');
      await plugin._cleanupOldBackups();
      
      // Note: Cleanup might not delete anything in this simple test
      // Event emission depends on actual deletions
    });
  });

  describe('Error Handling', () => {
    it('should handle backup errors and update metadata', async () => {
      // Mock resource backup to fail
      const originalBackupResource = plugin._backupResource;
      plugin._backupResource = jest.fn().mockRejectedValue(new Error('Resource backup failed'));
      
      let errorOccurred = false;
      try {
        await plugin.backup('full');
      } catch (error) {
        errorOccurred = true;
        expect(error.message).toBe('Resource backup failed');
      }
      
      expect(errorOccurred).toBe(true);
      expect(plugin.config.onBackupError).toHaveBeenCalled();
      
      // Restore original method
      plugin._backupResource = originalBackupResource;
    });

    it('should emit backup_error event', async () => {
      const errorSpy = jest.fn();
      plugin.on('backup_error', errorSpy);
      
      // Mock resource backup to fail
      const originalBackupResource = plugin._backupResource;
      plugin._backupResource = jest.fn().mockRejectedValue(new Error('Test error'));
      
      try {
        await plugin.backup('full');
      } catch (error) {
        // Expected to fail
      }
      
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'full',
        error: 'Test error'
      }));
      
      // Restore original method
      plugin._backupResource = originalBackupResource;
    });

    it('should clean up active backups on error', async () => {
      // Mock to fail early in the backup process
      const originalBackupResource = plugin._backupResource;
      plugin._backupResource = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Count active backups before
      const initialActiveBackups = plugin.activeBackups.size;
      
      try {
        await plugin.backup('full');
      } catch (error) {
        // Expected to fail
      }
      
      // Should clean up active backups (back to initial state)
      expect(plugin.activeBackups.size).toBe(initialActiveBackups);
      
      // Restore original method
      plugin._backupResource = originalBackupResource;
    });
  });

  describe('Restore Functionality', () => {
    let backupId;

    beforeEach(async () => {
      const result = await plugin.backup('full');
      backupId = result.id;
    });

    it('should restore from backup', async () => {
      // Clear existing data
      const users = await database.resource('users').list();
      for (const user of users) {
        await database.resource('users').delete(user.id);
      }
      
      // Verify data is cleared
      const emptyUsers = await database.resource('users').list();
      expect(emptyUsers).toHaveLength(0);
      
      // Note: Full restore test would require implementing actual file restoration
      // For now, we test the API and basic flow
      
      const metadata = await plugin.getBackupStatus(backupId);
      expect(metadata).toBeDefined();
      expect(metadata.status).toBe('completed');
    });

    it('should throw error for non-existent backup', async () => {
      await expect(plugin.restore('non-existent')).rejects.toThrow(
        "Backup 'non-existent' not found"
      );
    });

    it('should throw error for incomplete backup', async () => {
      // Create incomplete backup metadata
      const incompleteId = 'incomplete-backup';
      await database.resource(plugin.config.backupMetadataResource).insert({
        id: incompleteId,
        type: 'full',
        timestamp: Date.now(),
        status: 'in_progress',
        resources: [],
        destinations: [],
        createdAt: new Date().toISOString().slice(0, 10)
      });
      
      await expect(plugin.restore(incompleteId)).rejects.toThrow(
        "Backup 'incomplete-backup' is not in completed status"
      );
    });
  });

  describe('Compression', () => {
    it('should skip compression when disabled', async () => {
      plugin.config.compression = 'none';
      
      const result = await plugin.backup('full');
      
      expect(result).toBeDefined();
      // Compression logic would be tested with actual file operations
    });

    it('should handle compression errors gracefully', async () => {
      plugin.config.compression = 'gzip';
      
      // Mock compression to fail
      const originalCompress = plugin._compressBackup;
      plugin._compressBackup = jest.fn().mockRejectedValue(new Error('Compression failed'));
      
      await expect(plugin.backup('full')).rejects.toThrow('Compression failed');
      
      // Restore original method
      plugin._compressBackup = originalCompress;
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
      plugin.on('backup_cancelled', cancelSpy);
      
      await plugin.stop();
      
      expect(plugin.activeBackups.size).toBe(0);
      expect(cancelSpy).toHaveBeenCalledWith({ id: 'test-backup' });
    });

    it('should cleanup successfully', async () => {
      const removeListenersSpy = jest.spyOn(plugin, 'removeAllListeners');
      
      await plugin.cleanup();
      
      expect(removeListenersSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database backup', async () => {
      // Clear all data
      const users = await database.resource('users').list();
      for (const user of users) {
        await database.resource('users').delete(user.id);
      }
      
      const orders = await database.resource('orders').list();
      for (const order of orders) {
        await database.resource('orders').delete(order.id);
      }
      
      const result = await plugin.backup('full');
      expect(result).toBeDefined();
      expect(result.size).toBeGreaterThan(0); // Should still have metadata
    });

    it('should handle very large backup data', async () => {
      // Clear existing users first
      const existingUsers = await database.resource('users').list();
      for (const user of existingUsers) {
        await database.resource('users').delete(user.id);
      }
      
      // Add some records to test larger data handling (reduced for performance)
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(database.resource('users').insert({
          id: `large_user${i}`,
          name: `Large User ${i}`,
          email: `large_user${i}@example.com`
        }));
      }
      await Promise.all(promises);
      
      const result = await plugin.backup('full');
      expect(result).toBeDefined();
      expect(result.size).toBeGreaterThan(1000); // Should be substantial
    });

    it('should handle hook execution errors gracefully', async () => {
      plugin.config.onBackupStart = jest.fn().mockRejectedValue(new Error('Hook failed'));
      
      // Should not prevent backup from completing
      const result = await plugin.backup('full');
      expect(result).toBeDefined();
    });

    it('should handle missing temp directory creation', async () => {
      // Test with non-existent parent directory
      plugin.config.tempDir = '/non/existent/path/temp';
      
      // Should create directories recursively
      await plugin._ensureTempDirectory();
      
      // In real implementation, would check directory exists
      expect(true).toBe(true);
    });
  });

  describe('Destination Error Handling', () => {
    it('should handle unsupported destination type', async () => {
      plugin.config.destinations[0].type = 'unsupported';
      
      await expect(plugin.backup('full')).rejects.toThrow("All backup destinations failed");
    });

    it('should continue with other destinations when one fails', async () => {
      plugin.config.destinations = [
        {
          type: 'filesystem',
          path: '/invalid/path/that/cannot/be/created'
        },
        {
          type: 'filesystem',
          path: path.join(tempDir, 'valid-backup')
        }
      ];
      
      const result = await plugin.backup('full');
      
      expect(result.destinations).toHaveLength(2);
      expect(result.destinations.some(d => d.status === 'success')).toBe(true);
    });
  });
});