import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { createBackupDriver, validateBackupConfig } from "./backup/index.js";
import { StreamingExporter } from "./backup/streaming-exporter.js";
import { createWriteStream, createReadStream } from 'fs';
import zlib from 'node:zlib';
import { pipeline } from 'stream/promises';
import { mkdir, writeFile, readFile, unlink, stat, readdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { PluginError } from "../errors.js";

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
    super(options);

    const {
      driver = 'filesystem',
      config: driverConfig = {},
      schedule = {},
      retention = {},
      compression = 'gzip',
      encryption = null,
      verification = true,
      parallelism = 4,
      include = null,
      exclude = [],
      backupMetadataResource = 'plg_backup_metadata',
      tempDir = path.join(os.tmpdir(), 's3db', 'backups'),
      onBackupStart = null,
      onBackupComplete = null,
      onBackupError = null,
      onRestoreStart = null,
      onRestoreComplete = null,
      onRestoreError = null,
      ...rest
    } = this.options;

    this.config = {
      // Driver configuration
      driver,
      driverConfig,

      // Scheduling configuration
      schedule,

      // Retention policy (Grandfather-Father-Son)
      retention: {
        daily: 7,
        weekly: 4,
        monthly: 12,
        yearly: 3,
        ...retention
      },

      // Backup options
      compression,
      encryption,
      verification,
      parallelism,
      include,
      exclude,
      backupMetadataResource,
      tempDir,
      verbose: this.verbose,

      // Hooks
      onBackupStart,
      onBackupComplete,
      onBackupError,
      onRestoreStart,
      onRestoreComplete,
      onRestoreError,
      ...rest
    };

    this.driver = null;
    this.activeBackups = new Set();

    // Validate driver configuration
    validateBackupConfig(this.config.driver, this.config.driverConfig);

    this._validateConfiguration();
  }

  createError(message, details = {}) {
    const {
      operation = 'unknown',
      statusCode = 500,
      retriable = false,
      docs = 'docs/plugins/backup.md',
      ...rest
    } = details;

    return new PluginError(message, {
      pluginName: 'BackupPlugin',
      operation,
      statusCode,
      retriable,
      docs,
      ...rest
    });
  }

  _validateConfiguration() {
    // Driver validation is done in constructor
    
    if (this.config.encryption && (!this.config.encryption.key || !this.config.encryption.algorithm)) {
      throw this.createError('BackupPlugin: Encryption requires both key and algorithm', {
        operation: 'validateConfiguration',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide both encryption.key and encryption.algorithm (e.g. aes-256-gcm) or disable encryption.'
      });
    }
    
    if (this.config.compression && !['none', 'gzip', 'brotli', 'deflate'].includes(this.config.compression)) {
      throw this.createError('BackupPlugin: Invalid compression type. Use: none, gzip, brotli, deflate', {
        operation: 'validateConfiguration',
        statusCode: 400,
        retriable: false,
        suggestion: 'Choose one of the supported compression strategies: none, gzip, brotli, or deflate.'
      });
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

    // 🪵 Debug: initialized with driver
    const storageInfo = this.driver.getStorageInfo();
    this.logger.debug({ driverType: storageInfo.type, storageInfo }, `Initialized with driver: ${storageInfo.type}`);

    this.emit('db:plugin:initialized', {
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

    if (!ok) {
      // 🪵 Debug: backup metadata resource exists
      this.logger.debug({ resourceName: this.config.backupMetadataResource }, `Backup metadata resource '${this.config.backupMetadataResource}' already exists`);
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
      throw this.createError(`Backup '${backupId}' is already in progress`, {
        operation: 'createBackup',
        statusCode: 409,
        retriable: true,
        suggestion: 'Wait for the current backup task to finish or use a different backupId before retrying.',
        metadata: { backupId }
      });
    }

    try {
      this.activeBackups.add(backupId);
      
      // Execute onBackupStart hook
      if (this.config.onBackupStart) {
        await this._executeHook(this.config.onBackupStart, type, { backupId });
      }
      
      this.emit('plg:backup:start', { id: backupId, type });
      
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
          throw this.createError('No resources were exported for backup', {
            operation: 'exportResources',
            statusCode: 500,
            retriable: false,
            suggestion: 'Check include/exclude filters and ensure resources have data before starting the backup.',
            metadata: { backupId, type }
          });
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
            throw this.createError('Backup verification failed', {
              operation: 'verifyBackup',
              statusCode: 502,
              retriable: true,
              suggestion: 'Inspect driver logs or rerun the backup with verbose logging to diagnose verification failures.',
              metadata: { backupId, checksum }
            });
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
        
        this.emit('plg:backup:complete', { 
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
      
      this.emit('plg:backup:error', { id: backupId, type, error: error.message });
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
      this.database.resources[this.config.backupMetadataResource].insert(metadata)
    );
    
    return metadata;
  }

  async _updateBackupMetadata(backupId, updates) {
    const [ok] = await tryFn(() => 
      this.database.resources[this.config.backupMetadataResource].update(backupId, updates)
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
    const resourceStats = new Map();

    // Create StreamingExporter
    const exporter = new StreamingExporter({
      compress: true, // Always use gzip for backups
      onProgress: this.verbose ? (stats) => {
        if (stats.recordCount % 10000 === 0) {
          this.logger.debug(
            { recordCount: stats.recordCount, resourceName: stats.resourceName },
            'Export progress'
          );
        }
      } : null
    });

    // Determine timestamp for incremental backups
    let sinceTimestamp = null;
    if (type === 'incremental') {
      const [lastBackupOk, , lastBackups] = await tryFn(() =>
        this.database.resources[this.config.backupMetadataResource].list({
          filter: {
            status: 'completed',
            type: { $in: ['full', 'incremental'] }
          },
          sort: { timestamp: -1 },
          limit: 1
        })
      );

      if (lastBackupOk && lastBackups && lastBackups.length > 0) {
        sinceTimestamp = new Date(lastBackups[0].timestamp);
      } else {
        // No previous backup found, use last 24 hours as fallback
        sinceTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      // 🪵 Debug: incremental backup timestamp
      this.logger.debug({ sinceTimestamp: sinceTimestamp.toISOString() }, `Incremental backup since ${sinceTimestamp.toISOString()}`);
    }

    // Export each resource using streaming
    for (const resourceName of resourceNames) {
      const resource = this.database.resources[resourceName];
      if (!resource) {
        // 🪵 Warning: resource not found
        this.logger.warn({ resourceName }, `Resource '${resourceName}' not found, skipping`);
        continue;
      }

      const exportPath = path.join(tempDir, `${resourceName}.jsonl.gz`);

      try {
        // Export with streaming (constant memory usage!)
        const stats = await exporter.exportResource(resource, exportPath, type, sinceTimestamp);

        exportedFiles.push(exportPath);
        resourceStats.set(resourceName, {
          ...stats,
          definition: resource.config
        });

        // 🪵 Debug: exported resource
        const sizeMB = (stats.bytesWritten / 1024 / 1024).toFixed(2);
        this.logger.debug(
          { resourceName, recordCount: stats.recordCount, sizeMB: parseFloat(sizeMB) },
          `Exported ${stats.recordCount} records from '${resourceName}' (${sizeMB} MB compressed)`
        );
      } catch (error) {
        // 🪵 Error: export failed
        this.logger.error({ resourceName, error: error.message }, `Error exporting '${resourceName}': ${error.message}`);
        throw error;
      }
    }

    // Generate s3db.json metadata file
    await this._generateMetadataFile(tempDir, resourceStats, type);
    exportedFiles.push(path.join(tempDir, 's3db.json'));

    return exportedFiles;
  }

  /**
   * Generate s3db.json metadata file
   */
  async _generateMetadataFile(tempDir, resourceStats, type) {
    const metadata = {
      version: '1.0',
      backupType: type,
      exportedAt: new Date().toISOString(),
      database: {
        bucket: this.database.bucket,
        region: this.database.region
      },
      resources: {}
    };

    for (const [resourceName, stats] of resourceStats.entries()) {
      metadata.resources[resourceName] = {
        name: resourceName,
        attributes: stats.definition.attributes || {},
        partitions: stats.definition.partitions || {},
        timestamps: stats.definition.timestamps || false,
        recordCount: stats.recordCount,
        exportFile: `${resourceName}.jsonl.gz`,
        compression: 'gzip',
        format: 'jsonl',
        bytesWritten: stats.bytesWritten
      };
    }

    const metadataPath = path.join(tempDir, 's3db.json');
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // 🪵 Debug: generated metadata
    this.logger.debug({ metadataPath }, 'Generated s3db.json metadata');
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
        // 🪵 Warning: failed to read file
        this.logger.warn({ filePath, error: readErr?.message }, `Failed to read ${filePath}: ${readErr?.message}`);
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
      throw this.createError(`Failed to generate checksum for ${filePath}: ${err?.message}`, {
        operation: 'generateChecksum',
        statusCode: 500,
        retriable: true,
        suggestion: 'Ensure the archive is readable and rerun the backup with verbose logging.',
        metadata: { filePath }
      });
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
      
      this.emit('plg:backup:restore-start', { id: backupId, options });
      
      // Get backup metadata
      const backup = await this.getBackupStatus(backupId);
      if (!backup) {
        throw this.createError(`Backup '${backupId}' not found`, {
          operation: 'restore',
          statusCode: 404,
          retriable: false,
          suggestion: 'Confirm the backupId exists or create a new backup before attempting restore.',
          metadata: { backupId }
        });
      }
      
      if (backup.status !== 'completed') {
        throw this.createError(`Backup '${backupId}' is not in completed status`, {
          operation: 'restore',
          statusCode: 409,
          retriable: true,
          suggestion: 'Allow the running backup to finish or investigate previous errors before retrying restore.',
          metadata: { backupId, status: backup.status }
        });
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
            throw this.createError('Backup verification failed during restore', {
              operation: 'restoreVerify',
              statusCode: 422,
              retriable: false,
              suggestion: 'Recreate the backup to generate a fresh checksum or disable verification temporarily.',
              metadata: { backupId, expectedChecksum: backup.checksum, actualChecksum }
            });
          }
        }
        
        // Extract and restore data
        const restoredResources = await this._restoreFromBackup(downloadPath, options);
        
        // Execute onRestoreComplete hook
        if (this.config.onRestoreComplete) {
          await this._executeHook(this.config.onRestoreComplete, backupId, { restored: restoredResources });
        }
        
        this.emit('plg:backup:restore-complete', { 
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
      
      this.emit('plg:backup:restore-error', { id: backupId, error: error.message });
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
        throw this.createError(`Failed to parse backup archive: ${parseError.message}`, {
          operation: 'restoreParse',
          statusCode: 400,
          retriable: false,
          suggestion: 'Verify the backup file is intact or recreate the backup before restoring.',
          metadata: { backupPath }
        });
      }

      if (!archive || typeof archive !== 'object') {
        throw this.createError('Invalid backup archive: not a valid JSON object', {
          operation: 'restoreParse',
          statusCode: 400,
          retriable: false,
          suggestion: 'Ensure the uploaded archive has JSON content and is not truncated.',
          metadata: { backupPath }
        });
      }

      if (!archive.version || !archive.files) {
        throw this.createError('Invalid backup archive format: missing version or files array', {
          operation: 'restoreParse',
          statusCode: 400,
          retriable: false,
          suggestion: 'Generate backups with the current plugin version to include version and files metadata.',
          metadata: { backupPath }
        });
      }

      // 🪵 Debug: restoring files
      this.logger.debug({ fileCount: archive.files.length }, `Restoring ${archive.files.length} files from backup`);

      // Process each file in the archive
      for (const file of archive.files) {
        try {
          const resourceData = JSON.parse(file.content);

          if (!resourceData.resourceName || !resourceData.definition) {
            // 🪵 Warning: invalid file
            this.logger.warn({ fileName: file.name }, `Skipping invalid file: ${file.name}`);
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
            // 🪵 Debug: creating resource
            this.logger.debug({ resourceName }, `Creating resource '${resourceName}'`);

            const [createOk, createErr] = await tryFn(() =>
              this.database.createResource(resourceData.definition)
            );

            if (!createOk) {
              // 🪵 Warning: failed to create resource
              this.logger.warn({ resourceName, error: createErr?.message }, `Failed to create resource '${resourceName}': ${createErr?.message}`);
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

            // 🪵 Debug: restored records
            this.logger.debug({ resourceName, insertedCount, totalRecords: resourceData.records.length }, `Restored ${insertedCount}/${resourceData.records.length} records to '${resourceName}'`);
          }

        } catch (fileError) {
          // 🪵 Warning: file processing error
          this.logger.warn({ fileName: file.name, error: fileError.message }, `Error processing file ${file.name}: ${fileError.message}`);
        }
      }

      return restoredResources;

    } catch (error) {
      // 🪵 Error: restore failed
      this.logger.error({ error: error.message, stack: error.stack }, `Error restoring backup: ${error.message}`);
      throw this.createError(`Failed to restore backup: ${error.message}`, {
        operation: 'restore',
        statusCode: 500,
        retriable: false,
        suggestion: 'Review the nested error message above and address resource-level failures before retrying.',
        original: error
      });
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
        this.database.resources[this.config.backupMetadataResource].list({
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
      // 🪵 Warning: error listing backups
      this.logger.warn({ error: error.message }, `Error listing backups: ${error.message}`);
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
      this.database.resources[this.config.backupMetadataResource].get(backupId)
    );
    
    return ok ? backup : null;
  }

  async _cleanupOldBackups() {
    try {
      // Get all completed backups sorted by timestamp
      const [listOk, , allBackups] = await tryFn(() =>
        this.database.resources[this.config.backupMetadataResource].list({
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

      // 🪵 Debug: cleaning up old backups
      this.logger.debug({ deleteCount: backupsToDelete.length, keepCount: toKeep.size }, `Cleaning up ${backupsToDelete.length} old backups (keeping ${toKeep.size})`);

      // Delete old backups
      for (const backup of backupsToDelete) {
        try {
          // Delete from driver
          await this.driver.delete(backup.id, backup.driverInfo);

          // Delete metadata
          await this.database.resources[this.config.backupMetadataResource].delete(backup.id);

          // 🪵 Debug: deleted old backup
          this.logger.debug({ backupId: backup.id }, `Deleted old backup: ${backup.id}`);
        } catch (deleteError) {
          // 🪵 Warning: failed to delete backup
          this.logger.warn({ backupId: backup.id, error: deleteError.message }, `Failed to delete backup ${backup.id}: ${deleteError.message}`);
        }
      }

    } catch (error) {
      // 🪵 Warning: cleanup error
      this.logger.warn({ error: error.message }, `Error during cleanup: ${error.message}`);
    }
  }

  async _executeHook(hook, ...args) {
    if (typeof hook === 'function') {
      return await hook(...args);
    }
  }

  async start() {
    // 🪵 Debug: started
    const storageInfo = this.driver.getStorageInfo();
    this.logger.debug({ driverType: storageInfo.type }, `Started with driver: ${storageInfo.type}`);
  }

  async stop() {
    // Cancel any active backups
    for (const backupId of this.activeBackups) {
      this.emit('plg:backup:cancelled', { id: backupId });
    }
    this.activeBackups.clear();
    
    // Cleanup driver
    if (this.driver) {
      await this.driver.cleanup();
    }
  }
}
