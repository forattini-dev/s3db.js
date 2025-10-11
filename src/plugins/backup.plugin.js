import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { createBackupDriver, validateBackupConfig } from "./backup/index.js";
import { createWriteStream, createReadStream } from 'fs';
import zlib from 'node:zlib';
import { pipeline } from 'stream/promises';
import { mkdir, writeFile, readFile, unlink, stat, readdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

/**
 * BackupPlugin - Automated Database Backup System
 *
 * Provides comprehensive backup functionality with configurable drivers,
 * retention policies, and restoration capabilities.
 *
 * === Driver-Based Architecture ===
 * Uses the standard S3DB plugin driver pattern:
 * - driver: Driver type (filesystem, s3, multi)
 * - config: Driver-specific configuration
 *
 * === Configuration Examples ===
 *
 * // Filesystem backup
 * new BackupPlugin({
 *   driver: 'filesystem',
 *   config: {
 *     path: '/var/backups/s3db/{date}/',
 *     compression: 'gzip'
 *   }
 * });
 *
 * // S3 backup
 * new BackupPlugin({
 *   driver: 's3',
 *   config: {
 *     bucket: 'my-backup-bucket',
 *     path: 'database/{date}/',
 *     storageClass: 'STANDARD_IA'
 *   }
 * });
 *
 * // Multiple destinations
 * new BackupPlugin({
 *   driver: 'multi',
 *   config: {
 *     strategy: 'all', // 'all', 'any', 'priority'
 *     destinations: [
 *       { 
 *         driver: 'filesystem', 
 *         config: { path: '/var/backups/s3db/' } 
 *       },
 *       { 
 *         driver: 's3', 
 *         config: { 
 *           bucket: 'remote-backups',
 *           storageClass: 'GLACIER'
 *         } 
 *       }
 *     ]
 *   }
 * });
 *
 * === Additional Plugin Options ===
 * - schedule: Cron expressions for automated backups
 * - retention: Backup retention policy (GFS)
 * - compression: Compression type (gzip, brotli, none)
 * - encryption: Encryption configuration
 * - verification: Enable backup verification
 * - backupMetadataResource: Resource name for metadata
 */
export class BackupPlugin extends Plugin {
  constructor(options = {}) {
    super();

    this.config = {
      // Driver configuration
      driver: options.driver || 'filesystem',
      driverConfig: options.config || {},

      // Scheduling configuration
      schedule: options.schedule || {},

      // Retention policy (Grandfather-Father-Son)
      retention: {
        daily: 7,
        weekly: 4,
        monthly: 12,
        yearly: 3,
        ...options.retention
      },

      // Backup options
      compression: options.compression || 'gzip',
      encryption: options.encryption || null,
      verification: options.verification !== false,
      parallelism: options.parallelism || 4,
      include: options.include || null,
      exclude: options.exclude || [],
      backupMetadataResource: options.backupMetadataResource || 'plg_backup_metadata',
      tempDir: options.tempDir || path.join(os.tmpdir(), 's3db', 'backups'),
      verbose: options.verbose || false,

      // Hooks
      onBackupStart: options.onBackupStart || null,
      onBackupComplete: options.onBackupComplete || null,
      onBackupError: options.onBackupError || null,
      onRestoreStart: options.onRestoreStart || null,
      onRestoreComplete: options.onRestoreComplete || null,
      onRestoreError: options.onRestoreError || null
    };

    this.driver = null;
    this.activeBackups = new Set();

    // Validate driver configuration
    validateBackupConfig(this.config.driver, this.config.driverConfig);

    this._validateConfiguration();
  }

  _validateConfiguration() {
    // Driver validation is done in constructor
    
    if (this.config.encryption && (!this.config.encryption.key || !this.config.encryption.algorithm)) {
      throw new Error('BackupPlugin: Encryption requires both key and algorithm');
    }
    
    if (this.config.compression && !['none', 'gzip', 'brotli', 'deflate'].includes(this.config.compression)) {
      throw new Error('BackupPlugin: Invalid compression type. Use: none, gzip, brotli, deflate');
    }
  }

  async onInstall() {
    // Create backup driver instance
    this.driver = createBackupDriver(this.config.driver, this.config.driverConfig);
    await this.driver.setup(this.database);

    // Create temporary directory
    await mkdir(this.config.tempDir, { recursive: true });

    // Create backup metadata resource
    await this._createBackupMetadataResource();

    if (this.config.verbose) {
      const storageInfo = this.driver.getStorageInfo();
      console.log(`[BackupPlugin] Initialized with driver: ${storageInfo.type}`);
    }

    this.emit('initialized', {
      driver: this.driver.getType(),
      config: this.driver.getStorageInfo()
    });
  }

  async _createBackupMetadataResource() {
    const [ok] = await tryFn(() => this.database.createResource({
      name: this.config.backupMetadataResource,
      attributes: {
        id: 'string|required',
        type: 'string|required',
        timestamp: 'number|required',
        resources: 'json|required',
        driverInfo: 'json|required', // Store driver info instead of destinations
        size: 'number|default:0',
        compressed: 'boolean|default:false',
        encrypted: 'boolean|default:false',
        checksum: 'string|default:null',
        status: 'string|required',
        error: 'string|default:null',
        duration: 'number|default:0',
        createdAt: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: true
    }));

    if (!ok && this.config.verbose) {
      console.log(`[BackupPlugin] Backup metadata resource '${this.config.backupMetadataResource}' already exists`);
    }
  }

  /**
   * Create a backup
   * @param {string} type - Backup type ('full' or 'incremental')
   * @param {Object} options - Backup options
   * @returns {Object} Backup result
   */
  async backup(type = 'full', options = {}) {
    const backupId = this._generateBackupId(type);
    const startTime = Date.now();

    // Check for race condition
    if (this.activeBackups.has(backupId)) {
      throw new Error(`Backup '${backupId}' is already in progress`);
    }

    try {
      this.activeBackups.add(backupId);
      
      // Execute onBackupStart hook
      if (this.config.onBackupStart) {
        await this._executeHook(this.config.onBackupStart, type, { backupId });
      }
      
      this.emit('backup_start', { id: backupId, type });
      
      // Create backup metadata
      const metadata = await this._createBackupMetadata(backupId, type);
      
      // Create temporary backup directory
      const tempBackupDir = path.join(this.config.tempDir, backupId);
      await mkdir(tempBackupDir, { recursive: true });
      
      try {
        // Create backup manifest
        const manifest = await this._createBackupManifest(type, options);
        
        // Export resources to backup files
        const exportedFiles = await this._exportResources(manifest.resources, tempBackupDir, type);
        
        // Check if we have any files to backup
        if (exportedFiles.length === 0) {
          throw new Error('No resources were exported for backup');
        }
        
        // Create archive
        const archiveExtension = this.config.compression !== 'none' ? '.tar.gz' : '.json';
        const finalPath = path.join(tempBackupDir, `${backupId}${archiveExtension}`);
        const totalSize = await this._createArchive(exportedFiles, finalPath, this.config.compression);
        
        // Generate checksum
        const checksum = await this._generateChecksum(finalPath);
        
        // Upload using driver
        const uploadResult = await this.driver.upload(finalPath, backupId, manifest);
        
        // Verify backup if enabled
        if (this.config.verification) {
          const isValid = await this.driver.verify(backupId, checksum, uploadResult);
          if (!isValid) {
            throw new Error('Backup verification failed');
          }
        }
        
        const duration = Date.now() - startTime;
        
        // Update metadata
        await this._updateBackupMetadata(backupId, {
          status: 'completed',
          size: totalSize,
          checksum,
          driverInfo: uploadResult,
          duration
        });
        
        // Execute onBackupComplete hook
        if (this.config.onBackupComplete) {
          const stats = { backupId, type, size: totalSize, duration, driverInfo: uploadResult };
          await this._executeHook(this.config.onBackupComplete, type, stats);
        }
        
        this.emit('backup_complete', { 
          id: backupId, 
          type, 
          size: totalSize, 
          duration,
          driverInfo: uploadResult
        });
        
        // Cleanup retention
        await this._cleanupOldBackups();
        
        return {
          id: backupId,
          type,
          size: totalSize,
          duration,
          checksum,
          driverInfo: uploadResult
        };
        
      } finally {
        // Cleanup temporary files
        await this._cleanupTempFiles(tempBackupDir);
      }
      
    } catch (error) {
      // Execute onBackupError hook
      if (this.config.onBackupError) {
        await this._executeHook(this.config.onBackupError, type, { backupId, error });
      }
      
      // Update metadata with error
      await this._updateBackupMetadata(backupId, {
        status: 'failed',
        error: error.message,
        duration: Date.now() - startTime
      });
      
      this.emit('backup_error', { id: backupId, type, error: error.message });
      throw error;
      
    } finally {
      this.activeBackups.delete(backupId);
    }
  }

  _generateBackupId(type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${timestamp}-${random}`;
  }

  async _createBackupMetadata(backupId, type) {
    const now = new Date();
    const metadata = {
      id: backupId,
      type,
      timestamp: Date.now(),
      resources: [],
      driverInfo: {},
      size: 0,
      status: 'in_progress',
      compressed: this.config.compression !== 'none',
      encrypted: !!this.config.encryption,
      checksum: null,
      error: null,
      duration: 0,
      createdAt: now.toISOString().slice(0, 10)
    };
    
    const [ok] = await tryFn(() => 
      this.database.resource(this.config.backupMetadataResource).insert(metadata)
    );
    
    return metadata;
  }

  async _updateBackupMetadata(backupId, updates) {
    const [ok] = await tryFn(() => 
      this.database.resource(this.config.backupMetadataResource).update(backupId, updates)
    );
  }

  async _createBackupManifest(type, options) {
    let resourcesToBackup = options.resources || 
      (this.config.include ? this.config.include : await this.database.listResources());
    
    // Ensure we have resource names as strings
    if (Array.isArray(resourcesToBackup) && resourcesToBackup.length > 0 && typeof resourcesToBackup[0] === 'object') {
      resourcesToBackup = resourcesToBackup.map(resource => resource.name || resource);
    }
    
    // Filter excluded resources
    const filteredResources = resourcesToBackup.filter(name => 
      !this.config.exclude.includes(name)
    );
    
    return {
      type,
      timestamp: Date.now(),
      resources: filteredResources,
      compression: this.config.compression,
      encrypted: !!this.config.encryption,
      s3db_version: this.database.constructor.version || 'unknown'
    };
  }

  async _exportResources(resourceNames, tempDir, type) {
    const exportedFiles = [];
    
    for (const resourceName of resourceNames) {
      const resource = this.database.resources[resourceName];
      if (!resource) {
        if (this.config.verbose) {
          console.warn(`[BackupPlugin] Resource '${resourceName}' not found, skipping`);
        }
        continue;
      }
      
      const exportPath = path.join(tempDir, `${resourceName}.json`);
      
      // Export resource data
      let records;
      if (type === 'incremental') {
        // For incremental, only export records changed since last successful backup
        const [lastBackupOk, , lastBackups] = await tryFn(() =>
          this.database.resource(this.config.backupMetadataResource).list({
            filter: {
              status: 'completed',
              type: { $in: ['full', 'incremental'] }
            },
            sort: { timestamp: -1 },
            limit: 1
          })
        );

        let sinceTimestamp;
        if (lastBackupOk && lastBackups && lastBackups.length > 0) {
          sinceTimestamp = new Date(lastBackups[0].timestamp);
        } else {
          // No previous backup found, use last 24 hours as fallback
          sinceTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000);
        }

        if (this.config.verbose) {
          console.log(`[BackupPlugin] Incremental backup for '${resourceName}' since ${sinceTimestamp.toISOString()}`);
        }

        // Get records updated since last backup
        records = await resource.list({
          filter: { updatedAt: { '>': sinceTimestamp.toISOString() } }
        });
      } else {
        records = await resource.list();
      }
      
      const exportData = {
        resourceName,
        definition: resource.config,
        records,
        exportedAt: new Date().toISOString(),
        type
      };
      
      await writeFile(exportPath, JSON.stringify(exportData, null, 2));
      exportedFiles.push(exportPath);
      
      if (this.config.verbose) {
        console.log(`[BackupPlugin] Exported ${records.length} records from '${resourceName}'`);
      }
    }
    
    return exportedFiles;
  }

  async _createArchive(files, targetPath, compressionType) {
    // Create a JSON-based archive with file metadata and contents
    const archive = {
      version: '1.0',
      created: new Date().toISOString(),
      files: []
    };

    let totalSize = 0;

    // Read all files and add to archive
    for (const filePath of files) {
      const [readOk, readErr, content] = await tryFn(() => readFile(filePath, 'utf8'));

      if (!readOk) {
        if (this.config.verbose) {
          console.warn(`[BackupPlugin] Failed to read ${filePath}: ${readErr?.message}`);
        }
        continue;
      }

      const fileName = path.basename(filePath);
      totalSize += content.length;

      archive.files.push({
        name: fileName,
        size: content.length,
        content
      });
    }

    // Write archive (compressed or uncompressed)
    const archiveJson = JSON.stringify(archive);

    if (compressionType === 'none') {
      // Write uncompressed JSON
      await writeFile(targetPath, archiveJson, 'utf8');
    } else {
      // Write compressed JSON
      const output = createWriteStream(targetPath);
      const gzip = zlib.createGzip({ level: 6 });

      await pipeline(
        async function* () {
          yield Buffer.from(archiveJson, 'utf8');
        },
        gzip,
        output
      );
    }

    const [statOk, , stats] = await tryFn(() => stat(targetPath));
    return statOk ? stats.size : totalSize;
  }

  async _generateChecksum(filePath) {
    const [ok, err, result] = await tryFn(async () => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);

      await pipeline(stream, hash);
      return hash.digest('hex');
    });

    if (!ok) {
      throw new Error(`Failed to generate checksum for ${filePath}: ${err?.message}`);
    }

    return result;
  }

  async _cleanupTempFiles(tempDir) {
    const [ok] = await tryFn(() => 
      import('fs/promises').then(fs => fs.rm(tempDir, { recursive: true, force: true }))
    );
  }

  /**
   * Restore from backup
   * @param {string} backupId - Backup identifier
   * @param {Object} options - Restore options
   * @returns {Object} Restore result
   */
  async restore(backupId, options = {}) {
    try {
      // Execute onRestoreStart hook
      if (this.config.onRestoreStart) {
        await this._executeHook(this.config.onRestoreStart, backupId, options);
      }
      
      this.emit('restore_start', { id: backupId, options });
      
      // Get backup metadata
      const backup = await this.getBackupStatus(backupId);
      if (!backup) {
        throw new Error(`Backup '${backupId}' not found`);
      }
      
      if (backup.status !== 'completed') {
        throw new Error(`Backup '${backupId}' is not in completed status`);
      }
      
      // Create temporary restore directory
      const tempRestoreDir = path.join(this.config.tempDir, `restore-${backupId}`);
      await mkdir(tempRestoreDir, { recursive: true });
      
      try {
        // Download backup using driver
        const downloadPath = path.join(tempRestoreDir, `${backupId}.backup`);
        await this.driver.download(backupId, downloadPath, backup.driverInfo);
        
        // Verify backup if enabled
        if (this.config.verification && backup.checksum) {
          const actualChecksum = await this._generateChecksum(downloadPath);
          if (actualChecksum !== backup.checksum) {
            throw new Error('Backup verification failed during restore');
          }
        }
        
        // Extract and restore data
        const restoredResources = await this._restoreFromBackup(downloadPath, options);
        
        // Execute onRestoreComplete hook
        if (this.config.onRestoreComplete) {
          await this._executeHook(this.config.onRestoreComplete, backupId, { restored: restoredResources });
        }
        
        this.emit('restore_complete', { 
          id: backupId, 
          restored: restoredResources 
        });
        
        return {
          backupId,
          restored: restoredResources
        };
        
      } finally {
        // Cleanup temporary files
        await this._cleanupTempFiles(tempRestoreDir);
      }
      
    } catch (error) {
      // Execute onRestoreError hook
      if (this.config.onRestoreError) {
        await this._executeHook(this.config.onRestoreError, backupId, { error });
      }
      
      this.emit('restore_error', { id: backupId, error: error.message });
      throw error;
    }
  }

  async _restoreFromBackup(backupPath, options) {
    const restoredResources = [];

    try {
      // Read and decompress the archive
      let archiveData = '';

      if (this.config.compression !== 'none') {
        // Decompress the archive
        const input = createReadStream(backupPath);
        const gunzip = zlib.createGunzip();
        const chunks = [];

        // Use pipeline with proper stream handling
        await new Promise((resolve, reject) => {
          input.pipe(gunzip)
            .on('data', chunk => chunks.push(chunk))
            .on('end', resolve)
            .on('error', reject);
        });

        archiveData = Buffer.concat(chunks).toString('utf8');
      } else {
        // Read uncompressed archive
        archiveData = await readFile(backupPath, 'utf8');
      }

      // Parse the archive
      let archive;
      try {
        archive = JSON.parse(archiveData);
      } catch (parseError) {
        throw new Error(`Failed to parse backup archive: ${parseError.message}`);
      }

      if (!archive || typeof archive !== 'object') {
        throw new Error('Invalid backup archive: not a valid JSON object');
      }

      if (!archive.version || !archive.files) {
        throw new Error('Invalid backup archive format: missing version or files array');
      }

      if (this.config.verbose) {
        console.log(`[BackupPlugin] Restoring ${archive.files.length} files from backup`);
      }

      // Process each file in the archive
      for (const file of archive.files) {
        try {
          const resourceData = JSON.parse(file.content);

          if (!resourceData.resourceName || !resourceData.definition) {
            if (this.config.verbose) {
              console.warn(`[BackupPlugin] Skipping invalid file: ${file.name}`);
            }
            continue;
          }

          const resourceName = resourceData.resourceName;

          // Check if we should restore this resource
          if (options.resources && !options.resources.includes(resourceName)) {
            continue;
          }

          // Ensure resource exists or create it
          let resource = this.database.resources[resourceName];

          if (!resource) {
            if (this.config.verbose) {
              console.log(`[BackupPlugin] Creating resource '${resourceName}'`);
            }

            const [createOk, createErr] = await tryFn(() =>
              this.database.createResource(resourceData.definition)
            );

            if (!createOk) {
              if (this.config.verbose) {
                console.warn(`[BackupPlugin] Failed to create resource '${resourceName}': ${createErr?.message}`);
              }
              continue;
            }

            resource = this.database.resources[resourceName];
          }

          // Restore records
          if (resourceData.records && Array.isArray(resourceData.records)) {
            const mode = options.mode || 'merge'; // 'merge', 'replace', 'skip'

            if (mode === 'replace') {
              // Clear existing data
              const ids = await resource.listIds();
              for (const id of ids) {
                await resource.delete(id);
              }
            }

            // Insert records
            let insertedCount = 0;
            for (const record of resourceData.records) {
              const [insertOk] = await tryFn(async () => {
                if (mode === 'skip') {
                  // Check if record exists
                  const existing = await resource.get(record.id);
                  if (existing) {
                    return false;
                  }
                }
                await resource.insert(record);
                return true;
              });

              if (insertOk) {
                insertedCount++;
              }
            }

            restoredResources.push({
              name: resourceName,
              recordsRestored: insertedCount,
              totalRecords: resourceData.records.length
            });

            if (this.config.verbose) {
              console.log(`[BackupPlugin] Restored ${insertedCount}/${resourceData.records.length} records to '${resourceName}'`);
            }
          }

        } catch (fileError) {
          if (this.config.verbose) {
            console.warn(`[BackupPlugin] Error processing file ${file.name}: ${fileError.message}`);
          }
        }
      }

      return restoredResources;

    } catch (error) {
      if (this.config.verbose) {
        console.error(`[BackupPlugin] Error restoring backup: ${error.message}`);
      }
      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }

  /**
   * List available backups
   * @param {Object} options - List options
   * @returns {Array} List of backups
   */
  async listBackups(options = {}) {
    try {
      // Get backups from driver
      const driverBackups = await this.driver.list(options);
      
      // Merge with metadata from database
      const [metaOk, , metadataRecords] = await tryFn(() => 
        this.database.resource(this.config.backupMetadataResource).list({
          limit: options.limit || 50,
          sort: { timestamp: -1 }
        })
      );
      
      const metadataMap = new Map();
      if (metaOk) {
        metadataRecords.forEach(record => metadataMap.set(record.id, record));
      }
      
      // Combine driver data with metadata
      const combinedBackups = driverBackups.map(backup => ({
        ...backup,
        ...(metadataMap.get(backup.id) || {})
      }));
      
      return combinedBackups;
      
    } catch (error) {
      if (this.config.verbose) {
        console.log(`[BackupPlugin] Error listing backups: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Get backup status
   * @param {string} backupId - Backup identifier
   * @returns {Object|null} Backup status
   */
  async getBackupStatus(backupId) {
    const [ok, , backup] = await tryFn(() => 
      this.database.resource(this.config.backupMetadataResource).get(backupId)
    );
    
    return ok ? backup : null;
  }

  async _cleanupOldBackups() {
    try {
      // Get all completed backups sorted by timestamp
      const [listOk, , allBackups] = await tryFn(() =>
        this.database.resource(this.config.backupMetadataResource).list({
          filter: { status: 'completed' },
          sort: { timestamp: -1 }
        })
      );

      if (!listOk || !allBackups || allBackups.length === 0) {
        return;
      }

      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const msPerWeek = 7 * msPerDay;
      const msPerMonth = 30 * msPerDay;
      const msPerYear = 365 * msPerDay;

      // Categorize backups by retention period
      const categorized = {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: []
      };

      for (const backup of allBackups) {
        const age = now - backup.timestamp;

        if (age <= msPerDay * this.config.retention.daily) {
          categorized.daily.push(backup);
        } else if (age <= msPerWeek * this.config.retention.weekly) {
          categorized.weekly.push(backup);
        } else if (age <= msPerMonth * this.config.retention.monthly) {
          categorized.monthly.push(backup);
        } else if (age <= msPerYear * this.config.retention.yearly) {
          categorized.yearly.push(backup);
        }
      }

      // Apply GFS retention: keep one backup per period
      const toKeep = new Set();

      // Keep all daily backups within retention
      categorized.daily.forEach(b => toKeep.add(b.id));

      // Keep one backup per week
      const weeklyByWeek = new Map();
      for (const backup of categorized.weekly) {
        const weekNum = Math.floor((now - backup.timestamp) / msPerWeek);
        if (!weeklyByWeek.has(weekNum)) {
          weeklyByWeek.set(weekNum, backup);
          toKeep.add(backup.id);
        }
      }

      // Keep one backup per month
      const monthlyByMonth = new Map();
      for (const backup of categorized.monthly) {
        const monthNum = Math.floor((now - backup.timestamp) / msPerMonth);
        if (!monthlyByMonth.has(monthNum)) {
          monthlyByMonth.set(monthNum, backup);
          toKeep.add(backup.id);
        }
      }

      // Keep one backup per year
      const yearlyByYear = new Map();
      for (const backup of categorized.yearly) {
        const yearNum = Math.floor((now - backup.timestamp) / msPerYear);
        if (!yearlyByYear.has(yearNum)) {
          yearlyByYear.set(yearNum, backup);
          toKeep.add(backup.id);
        }
      }

      // Delete backups not in the keep set
      const backupsToDelete = allBackups.filter(b => !toKeep.has(b.id));

      if (backupsToDelete.length === 0) {
        return;
      }

      if (this.config.verbose) {
        console.log(`[BackupPlugin] Cleaning up ${backupsToDelete.length} old backups (keeping ${toKeep.size})`);
      }

      // Delete old backups
      for (const backup of backupsToDelete) {
        try {
          // Delete from driver
          await this.driver.delete(backup.id, backup.driverInfo);

          // Delete metadata
          await this.database.resource(this.config.backupMetadataResource).delete(backup.id);

          if (this.config.verbose) {
            console.log(`[BackupPlugin] Deleted old backup: ${backup.id}`);
          }
        } catch (deleteError) {
          if (this.config.verbose) {
            console.warn(`[BackupPlugin] Failed to delete backup ${backup.id}: ${deleteError.message}`);
          }
        }
      }

    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[BackupPlugin] Error during cleanup: ${error.message}`);
      }
    }
  }

  async _executeHook(hook, ...args) {
    if (typeof hook === 'function') {
      return await hook(...args);
    }
  }

  async start() {
    if (this.config.verbose) {
      const storageInfo = this.driver.getStorageInfo();
      console.log(`[BackupPlugin] Started with driver: ${storageInfo.type}`);
    }
  }

  async stop() {
    // Cancel any active backups
    for (const backupId of this.activeBackups) {
      this.emit('backup_cancelled', { id: backupId });
    }
    this.activeBackups.clear();
    
    // Cleanup driver
    if (this.driver) {
      await this.driver.cleanup();
    }
  }

  /**
   * Cleanup plugin resources (alias for stop for backward compatibility)
   */
  async cleanup() {
    await this.stop();
  }
}

export default BackupPlugin;