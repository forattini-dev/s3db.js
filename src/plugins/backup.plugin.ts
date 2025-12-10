import { Plugin } from './plugin.class.js';
import tryFn from '../concerns/try-fn.js';
import { createBackupDriver, validateBackupConfig } from './backup/index.js';
import { StreamingExporter } from './backup/streaming-exporter.js';
import { createWriteStream, createReadStream } from 'fs';
import zlib from 'node:zlib';
import { pipeline } from 'stream/promises';
import { mkdir, writeFile, readFile, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { PluginError } from '../errors.js';
import type { Database } from '../database.class.js';
import type { Resource } from '../resource.class.js';
import type BaseBackupDriver from './backup/base-backup-driver.class.js';
import type { BackupManifest, UploadResult } from './backup/base-backup-driver.class.js';

export type CompressionType = 'none' | 'gzip' | 'brotli' | 'deflate';
export type BackupType = 'full' | 'incremental';

export interface EncryptionConfig {
  key: string;
  algorithm: string;
}

export interface RetentionPolicy {
  daily?: number;
  weekly?: number;
  monthly?: number;
  yearly?: number;
}

export interface BackupHookContext {
  backupId: string;
  type?: BackupType;
  error?: Error;
  size?: number;
  duration?: number;
  driverInfo?: UploadResult | UploadResult[];
  restored?: RestoredResourceInfo[];
  [key: string]: unknown;
}

export type BackupHook = (type: string, context: BackupHookContext) => void | Promise<void>;
export type RestoreHook = (backupId: string, context: Record<string, unknown>) => void | Promise<void>;

export interface BackupPluginOptions {
  driver?: string;
  config?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  retention?: RetentionPolicy;
  compression?: CompressionType;
  encryption?: EncryptionConfig | null;
  verification?: boolean;
  parallelism?: number;
  include?: string[] | null;
  exclude?: string[];
  backupMetadataResource?: string;
  tempDir?: string;
  onBackupStart?: BackupHook | null;
  onBackupComplete?: BackupHook | null;
  onBackupError?: BackupHook | null;
  onRestoreStart?: RestoreHook | null;
  onRestoreComplete?: RestoreHook | null;
  onRestoreError?: RestoreHook | null;
  logLevel?: string;
  [key: string]: unknown;
}

export interface BackupPluginConfig {
  driver: string;
  driverConfig: Record<string, unknown>;
  schedule: Record<string, unknown>;
  retention: Required<RetentionPolicy>;
  compression: CompressionType;
  encryption: EncryptionConfig | null;
  verification: boolean;
  parallelism: number;
  include: string[] | null;
  exclude: string[];
  backupMetadataResource: string;
  tempDir: string;
  logLevel?: string;
  onBackupStart: BackupHook | null;
  onBackupComplete: BackupHook | null;
  onBackupError: BackupHook | null;
  onRestoreStart: RestoreHook | null;
  onRestoreComplete: RestoreHook | null;
  onRestoreError: RestoreHook | null;
  [key: string]: unknown;
}

export interface BackupMetadataRecord {
  id: string;
  type: BackupType;
  timestamp: number;
  resources: string[];
  driverInfo: UploadResult | UploadResult[];
  size: number;
  compressed: boolean;
  encrypted: boolean;
  checksum: string | null;
  status: 'in_progress' | 'completed' | 'failed';
  error: string | null;
  duration: number;
  createdAt: string;
}

export interface BackupResult {
  id: string;
  type: BackupType;
  size: number;
  duration: number;
  checksum: string;
  driverInfo: UploadResult;
}

export interface RestoredResourceInfo {
  name: string;
  recordsRestored: number;
  totalRecords: number;
}

export interface RestoreResult {
  backupId: string;
  restored: RestoredResourceInfo[];
}

export interface RestoreOptions {
  resources?: string[];
  mode?: 'merge' | 'replace' | 'skip';
}

export interface ListBackupsOptions {
  limit?: number;
}

interface ArchiveFile {
  name: string;
  size: number;
  content: string;
}

interface BackupArchive {
  version: string;
  created: string;
  files: ArchiveFile[];
}

interface ResourceExportData {
  resourceName: string;
  definition: Record<string, unknown>;
  records?: Record<string, unknown>[];
}

export class BackupPlugin extends Plugin {
  config: BackupPluginConfig;
  driver: BaseBackupDriver | null;
  activeBackups: Set<string>;

  constructor(options: BackupPluginOptions = {}) {
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
    } = this.options as BackupPluginOptions;

    this.config = {
      driver,
      driverConfig,
      schedule,
      retention: {
        daily: 7,
        weekly: 4,
        monthly: 12,
        yearly: 3,
        ...retention
      },
      compression,
      encryption,
      verification,
      parallelism,
      include,
      exclude,
      backupMetadataResource,
      tempDir,
      logLevel: this.logLevel,
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

    validateBackupConfig(this.config.driver, this.config.driverConfig);
    this._validateConfiguration();
  }

  createError(message: string, details: Record<string, unknown> = {}): PluginError {
    const {
      operation = 'unknown',
      statusCode = 500,
      retriable = false,
      docs = 'docs/plugins/backup.md',
      ...rest
    } = details;

    return new PluginError(message, {
      pluginName: 'BackupPlugin',
      operation: operation as string,
      statusCode: statusCode as number,
      retriable: retriable as boolean,
      docs: docs as string,
      ...rest
    });
  }

  private _validateConfiguration(): void {
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

  override async onInstall(): Promise<void> {
    this.driver = createBackupDriver(this.config.driver, this.config.driverConfig);
    await this.driver.setup(this.database);

    await mkdir(this.config.tempDir, { recursive: true });
    await this._createBackupMetadataResource();

    const storageInfo = this.driver.getStorageInfo();
    this.logger.debug({ driverType: storageInfo.type, storageInfo }, `Initialized with driver: ${storageInfo.type}`);

    this.emit('db:plugin:initialized', {
      driver: this.driver.getType(),
      config: this.driver.getStorageInfo()
    });
  }

  private async _createBackupMetadataResource(): Promise<void> {
    const [ok] = await tryFn(() => this.database.createResource({
      name: this.config.backupMetadataResource,
      attributes: {
        id: 'string|required',
        type: 'string|required',
        timestamp: 'number|required',
        resources: 'json|required',
        driverInfo: 'json|required',
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
      this.logger.debug(
        { resourceName: this.config.backupMetadataResource },
        `Backup metadata resource '${this.config.backupMetadataResource}' already exists`
      );
    }
  }

  async backup(type: BackupType = 'full', options: { resources?: string[] } = {}): Promise<BackupResult> {
    const backupId = this._generateBackupId(type);
    const startTime = Date.now();

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

      if (this.config.onBackupStart) {
        await this._executeHook(this.config.onBackupStart, type, { backupId });
      }

      this.emit('plg:backup:start', { id: backupId, type });

      await this._createBackupMetadata(backupId, type);

      const tempBackupDir = path.join(this.config.tempDir, backupId);
      await mkdir(tempBackupDir, { recursive: true });

      try {
        const manifest = await this._createBackupManifest(type, options);
        const exportedFiles = await this._exportResources(manifest.resources!, tempBackupDir, type);

        if (exportedFiles.length === 0) {
          throw this.createError('No resources were exported for backup', {
            operation: 'exportResources',
            statusCode: 500,
            retriable: false,
            suggestion: 'Check include/exclude filters and ensure resources have data before starting the backup.',
            metadata: { backupId, type }
          });
        }

        const archiveExtension = this.config.compression !== 'none' ? '.tar.gz' : '.json';
        const finalPath = path.join(tempBackupDir, `${backupId}${archiveExtension}`);
        const totalSize = await this._createArchive(exportedFiles, finalPath, this.config.compression);

        const checksum = await this._generateChecksum(finalPath);

        const uploadResult = await this.driver!.upload(finalPath, backupId, manifest);

        if (this.config.verification) {
          const isValid = await this.driver!.verify(backupId, checksum, uploadResult as any);
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

        await this._updateBackupMetadata(backupId, {
          status: 'completed',
          size: totalSize,
          checksum,
          driverInfo: uploadResult,
          duration
        });

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

        await this._cleanupOldBackups();

        return {
          id: backupId,
          type,
          size: totalSize,
          duration,
          checksum,
          driverInfo: Array.isArray(uploadResult) ? uploadResult[0]! : uploadResult
        };

      } finally {
        await this._cleanupTempFiles(tempBackupDir);
      }

    } catch (error) {
      if (this.config.onBackupError) {
        await this._executeHook(this.config.onBackupError, type, { backupId, error: error as Error });
      }

      await this._updateBackupMetadata(backupId, {
        status: 'failed',
        error: (error as Error).message,
        duration: Date.now() - startTime
      });

      this.emit('plg:backup:error', { id: backupId, type, error: (error as Error).message });
      throw error;

    } finally {
      this.activeBackups.delete(backupId);
    }
  }

  private _generateBackupId(type: BackupType): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${timestamp}-${random}`;
  }

  private async _createBackupMetadata(backupId: string, type: BackupType): Promise<BackupMetadataRecord> {
    const now = new Date();
    const metadata: BackupMetadataRecord = {
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

    await tryFn(() =>
      (this.database.resources as Record<string, Resource>)[this.config.backupMetadataResource]!.insert(metadata as any)
    );

    return metadata;
  }

  private async _updateBackupMetadata(backupId: string, updates: Partial<BackupMetadataRecord>): Promise<void> {
    await tryFn(() =>
      (this.database.resources as Record<string, Resource>)[this.config.backupMetadataResource]!.update(backupId, updates)
    );
  }

  private async _createBackupManifest(type: BackupType, options: { resources?: string[] }): Promise<BackupManifest> {
    let resourcesToBackup: string[] | Array<{ name: string }> = options.resources ||
      (this.config.include ? this.config.include : await this.database.listResources());

    if (Array.isArray(resourcesToBackup) && resourcesToBackup.length > 0 && typeof resourcesToBackup[0] === 'object') {
      resourcesToBackup = (resourcesToBackup as Array<{ name: string }>).map(resource => resource.name || String(resource));
    }

    const filteredResources = (resourcesToBackup as string[]).filter(name =>
      !this.config.exclude.includes(name)
    );

    return {
      type,
      timestamp: Date.now(),
      resources: filteredResources,
      compression: this.config.compression,
      encrypted: !!this.config.encryption,
      s3db_version: (this.database.constructor as { version?: string }).version || 'unknown'
    };
  }

  private async _exportResources(resourceNames: string[], tempDir: string, type: BackupType): Promise<string[]> {
    const exportedFiles: string[] = [];
    const resourceStats = new Map<string, { recordCount: number; bytesWritten: number; definition: Record<string, unknown> }>();

    const exporter = new StreamingExporter({
      compress: true,
      onProgress: this.logLevel === 'debug' || this.logLevel === 'trace' ? (stats) => {
        if (stats.recordCount % 10000 === 0) {
          this.logger.debug(
            { recordCount: stats.recordCount, resourceName: stats.resourceName },
            'Export progress'
          );
        }
      } : null
    });

    let sinceTimestamp: Date | null = null;
    if (type === 'incremental') {
      const [lastBackupOk, , lastBackups] = await tryFn(() =>
        (this.database.resources as Record<string, Resource>)[this.config.backupMetadataResource]!.list({
          filter: {
            status: 'completed',
            type: { $in: ['full', 'incremental'] }
          },
          sort: { timestamp: -1 },
          limit: 1
        } as any)
      );

      if (lastBackupOk && lastBackups && (lastBackups as unknown as BackupMetadataRecord[]).length > 0) {
        sinceTimestamp = new Date((lastBackups as unknown as BackupMetadataRecord[])[0]!.timestamp);
      } else {
        sinceTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      this.logger.debug({ sinceTimestamp: sinceTimestamp.toISOString() }, `Incremental backup since ${sinceTimestamp.toISOString()}`);
    }

    for (const resourceName of resourceNames) {
      const resource = (this.database.resources as Record<string, Resource>)[resourceName];
      if (!resource) {
        this.logger.warn({ resourceName }, `Resource '${resourceName}' not found, skipping`);
        continue;
      }

      const exportPath = path.join(tempDir, `${resourceName}.jsonl.gz`);

      try {
        const stats = await exporter.exportResource(resource, exportPath, type, sinceTimestamp);

        exportedFiles.push(exportPath);
        resourceStats.set(resourceName, {
          ...stats,
          definition: resource.config as any
        });

        const sizeMB = (stats.bytesWritten / 1024 / 1024).toFixed(2);
        this.logger.debug(
          { resourceName, recordCount: stats.recordCount, sizeMB: parseFloat(sizeMB) },
          `Exported ${stats.recordCount} records from '${resourceName}' (${sizeMB} MB compressed)`
        );
      } catch (error) {
        this.logger.error({ resourceName, error: (error as Error).message }, `Error exporting '${resourceName}': ${(error as Error).message}`);
        throw error;
      }
    }

    await this._generateMetadataFile(tempDir, resourceStats, type);
    exportedFiles.push(path.join(tempDir, 's3db.json'));

    return exportedFiles;
  }

  private async _generateMetadataFile(
    tempDir: string,
    resourceStats: Map<string, { recordCount: number; bytesWritten: number; definition: Record<string, unknown> }>,
    type: BackupType
  ): Promise<void> {
    const metadata: Record<string, unknown> = {
      version: '1.0',
      backupType: type,
      exportedAt: new Date().toISOString(),
      database: {
        bucket: (this.database as { bucket?: string }).bucket,
        region: (this.database as { region?: string }).region
      },
      resources: {} as Record<string, unknown>
    };

    for (const [resourceName, stats] of resourceStats.entries()) {
      (metadata.resources as Record<string, unknown>)[resourceName] = {
        name: resourceName,
        attributes: (stats.definition as { attributes?: Record<string, unknown> }).attributes || {},
        partitions: (stats.definition as { partitions?: Record<string, unknown> }).partitions || {},
        timestamps: (stats.definition as { timestamps?: boolean }).timestamps || false,
        recordCount: stats.recordCount,
        exportFile: `${resourceName}.jsonl.gz`,
        compression: 'gzip',
        format: 'jsonl',
        bytesWritten: stats.bytesWritten
      };
    }

    const metadataPath = path.join(tempDir, 's3db.json');
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    this.logger.debug({ metadataPath }, 'Generated s3db.json metadata');
  }

  private async _createArchive(files: string[], targetPath: string, compressionType: CompressionType): Promise<number> {
    const archive: BackupArchive = {
      version: '1.0',
      created: new Date().toISOString(),
      files: []
    };

    let totalSize = 0;

    for (const filePath of files) {
      const [readOk, readErr, content] = await tryFn(() => readFile(filePath, 'utf8'));

      if (!readOk) {
        this.logger.warn({ filePath, error: readErr?.message }, `Failed to read ${filePath}: ${readErr?.message}`);
        continue;
      }

      const fileName = path.basename(filePath);
      totalSize += content!.length;

      archive.files.push({
        name: fileName,
        size: content!.length,
        content: content!
      });
    }

    const archiveJson = JSON.stringify(archive);

    if (compressionType === 'none') {
      await writeFile(targetPath, archiveJson, 'utf8');
    } else {
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
    return statOk ? stats!.size : totalSize;
  }

  private async _generateChecksum(filePath: string): Promise<string> {
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

    return result!;
  }

  private async _cleanupTempFiles(tempDir: string): Promise<void> {
    await tryFn(() =>
      import('fs/promises').then(fs => fs.rm(tempDir, { recursive: true, force: true }))
    );
  }

  async restore(backupId: string, options: RestoreOptions = {}): Promise<RestoreResult> {
    try {
      if (this.config.onRestoreStart) {
        await this._executeRestoreHook(this.config.onRestoreStart, backupId, options as any);
      }

      this.emit('plg:backup:restore-start', { id: backupId, options });

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

      const tempRestoreDir = path.join(this.config.tempDir, `restore-${backupId}`);
      await mkdir(tempRestoreDir, { recursive: true });

      try {
        const downloadPath = path.join(tempRestoreDir, `${backupId}.backup`);
        await this.driver!.download(backupId, downloadPath, backup.driverInfo as any);

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

        const restoredResources = await this._restoreFromBackup(downloadPath, options);

        if (this.config.onRestoreComplete) {
          await this._executeRestoreHook(this.config.onRestoreComplete, backupId, { restored: restoredResources });
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
        await this._cleanupTempFiles(tempRestoreDir);
      }

    } catch (error) {
      if (this.config.onRestoreError) {
        await this._executeRestoreHook(this.config.onRestoreError, backupId, { error });
      }

      this.emit('plg:backup:restore-error', { id: backupId, error: (error as Error).message });
      throw error;
    }
  }

  private async _restoreFromBackup(backupPath: string, options: RestoreOptions): Promise<RestoredResourceInfo[]> {
    const restoredResources: RestoredResourceInfo[] = [];

    try {
      let archiveData = '';

      if (this.config.compression !== 'none') {
        const input = createReadStream(backupPath);
        const gunzip = zlib.createGunzip();
        const chunks: Buffer[] = [];

        await new Promise<void>((resolve, reject) => {
          input.pipe(gunzip)
            .on('data', (chunk: Buffer) => chunks.push(chunk))
            .on('end', resolve)
            .on('error', reject);
        });

        archiveData = Buffer.concat(chunks).toString('utf8');
      } else {
        archiveData = await readFile(backupPath, 'utf8');
      }

      let archive: BackupArchive;
      try {
        archive = JSON.parse(archiveData);
      } catch (parseError) {
        throw this.createError(`Failed to parse backup archive: ${(parseError as Error).message}`, {
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

      this.logger.debug({ fileCount: archive.files.length }, `Restoring ${archive.files.length} files from backup`);

      for (const file of archive.files) {
        try {
          const resourceData: ResourceExportData = JSON.parse(file.content);

          if (!resourceData.resourceName || !resourceData.definition) {
            this.logger.warn({ fileName: file.name }, `Skipping invalid file: ${file.name}`);
            continue;
          }

          const resourceName = resourceData.resourceName;

          if (options.resources && !options.resources.includes(resourceName)) {
            continue;
          }

          let resource = (this.database.resources as Record<string, Resource>)[resourceName];

          if (!resource) {
            this.logger.debug({ resourceName }, `Creating resource '${resourceName}'`);

            const [createOk, createErr] = await tryFn(() =>
              this.database.createResource(resourceData.definition as { name: string; attributes: Record<string, string> })
            );

            if (!createOk) {
              this.logger.warn({ resourceName, error: createErr?.message }, `Failed to create resource '${resourceName}': ${createErr?.message}`);
              continue;
            }

            resource = (this.database.resources as Record<string, Resource>)[resourceName];
          }

          if (!resource) {
            this.logger.warn({ resourceName }, `Resource '${resourceName}' not found after creation attempt`);
            continue;
          }

          if (resourceData.records && Array.isArray(resourceData.records)) {
            const mode = options.mode || 'merge';

            if (mode === 'replace') {
              const ids = await resource.listIds();
              for (const id of ids) {
                await resource.delete(id);
              }
            }

            let insertedCount = 0;
            for (const record of resourceData.records) {
              const [insertOk] = await tryFn(async () => {
                if (mode === 'skip') {
                  const existing = await resource!.get(record.id as string);
                  if (existing) {
                    return false;
                  }
                }
                await resource!.insert(record);
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

            this.logger.debug(
              { resourceName, insertedCount, totalRecords: resourceData.records.length },
              `Restored ${insertedCount}/${resourceData.records.length} records to '${resourceName}'`
            );
          }

        } catch (fileError) {
          this.logger.warn({ fileName: file.name, error: (fileError as Error).message }, `Error processing file ${file.name}: ${(fileError as Error).message}`);
        }
      }

      return restoredResources;

    } catch (error) {
      this.logger.error({ error: (error as Error).message, stack: (error as Error).stack }, `Error restoring backup: ${(error as Error).message}`);
      throw this.createError(`Failed to restore backup: ${(error as Error).message}`, {
        operation: 'restore',
        statusCode: 500,
        retriable: false,
        suggestion: 'Review the nested error message above and address resource-level failures before retrying.',
        original: error
      });
    }
  }

  async listBackups(options: ListBackupsOptions = {}): Promise<BackupMetadataRecord[]> {
    try {
      const driverBackups = await this.driver!.list(options as any);

      const [metaOk, , metadataRecords] = await tryFn(() =>
        (this.database.resources as Record<string, Resource>)[this.config.backupMetadataResource]!.list({
          limit: options.limit || 50,
          sort: { timestamp: -1 }
        } as any)
      );

      const metadataMap = new Map<string, BackupMetadataRecord>();
      if (metaOk) {
        (metadataRecords as unknown as BackupMetadataRecord[]).forEach(record => metadataMap.set(record.id, record));
      }

      const combinedBackups = driverBackups.map(backup => ({
        ...backup,
        ...(metadataMap.get(backup.id) || {})
      }));

      return combinedBackups as BackupMetadataRecord[];

    } catch (error) {
      this.logger.warn({ error: (error as Error).message }, `Error listing backups: ${(error as Error).message}`);
      return [];
    }
  }

  async getBackupStatus(backupId: string): Promise<BackupMetadataRecord | null> {
    const [ok, , backup] = await tryFn(() =>
      (this.database.resources as Record<string, Resource>)[this.config.backupMetadataResource]!.get(backupId)
    );

    return ok ? (backup as unknown as BackupMetadataRecord) : null;
  }

  private async _cleanupOldBackups(): Promise<void> {
    try {
      const [listOk, , allBackups] = await tryFn(() =>
        (this.database.resources as Record<string, Resource>)[this.config.backupMetadataResource]!.list({
          filter: { status: 'completed' },
          sort: { timestamp: -1 }
        } as any)
      );

      if (!listOk || !allBackups || (allBackups as unknown as BackupMetadataRecord[]).length === 0) {
        return;
      }

      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const msPerWeek = 7 * msPerDay;
      const msPerMonth = 30 * msPerDay;
      const msPerYear = 365 * msPerDay;

      const categorized: Record<string, BackupMetadataRecord[]> = {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: []
      };

      for (const backup of (allBackups as unknown as BackupMetadataRecord[])) {
        const age = now - backup.timestamp;

        if (age <= msPerDay * this.config.retention.daily) {
          categorized.daily!.push(backup);
        } else if (age <= msPerWeek * this.config.retention.weekly) {
          categorized.weekly!.push(backup);
        } else if (age <= msPerMonth * this.config.retention.monthly) {
          categorized.monthly!.push(backup);
        } else if (age <= msPerYear * this.config.retention.yearly) {
          categorized.yearly!.push(backup);
        }
      }

      const toKeep = new Set<string>();

      categorized.daily!.forEach(b => toKeep.add(b.id));

      const weeklyByWeek = new Map<number, BackupMetadataRecord>();
      for (const backup of categorized.weekly!) {
        const weekNum = Math.floor((now - backup.timestamp) / msPerWeek);
        if (!weeklyByWeek.has(weekNum)) {
          weeklyByWeek.set(weekNum, backup);
          toKeep.add(backup.id);
        }
      }

      const monthlyByMonth = new Map<number, BackupMetadataRecord>();
      for (const backup of categorized.monthly!) {
        const monthNum = Math.floor((now - backup.timestamp) / msPerMonth);
        if (!monthlyByMonth.has(monthNum)) {
          monthlyByMonth.set(monthNum, backup);
          toKeep.add(backup.id);
        }
      }

      const yearlyByYear = new Map<number, BackupMetadataRecord>();
      for (const backup of categorized.yearly!) {
        const yearNum = Math.floor((now - backup.timestamp) / msPerYear);
        if (!yearlyByYear.has(yearNum)) {
          yearlyByYear.set(yearNum, backup);
          toKeep.add(backup.id);
        }
      }

      const backupsToDelete = (allBackups as unknown as BackupMetadataRecord[]).filter(b => !toKeep.has(b.id));

      if (backupsToDelete.length === 0) {
        return;
      }

      this.logger.debug(
        { deleteCount: backupsToDelete.length, keepCount: toKeep.size },
        `Cleaning up ${backupsToDelete.length} old backups (keeping ${toKeep.size})`
      );

      for (const backup of backupsToDelete) {
        try {
          await this.driver!.delete(backup.id, backup.driverInfo as any);
          await (this.database.resources as Record<string, Resource>)[this.config.backupMetadataResource]!.delete(backup.id);

          this.logger.debug({ backupId: backup.id }, `Deleted old backup: ${backup.id}`);
        } catch (deleteError) {
          this.logger.warn(
            { backupId: backup.id, error: (deleteError as Error).message },
            `Failed to delete backup ${backup.id}: ${(deleteError as Error).message}`
          );
        }
      }

    } catch (error) {
      this.logger.warn({ error: (error as Error).message }, `Error during cleanup: ${(error as Error).message}`);
    }
  }

  private async _executeHook(hook: BackupHook, type: string, context: BackupHookContext): Promise<void> {
    if (typeof hook === 'function') {
      await hook(type, context);
    }
  }

  private async _executeRestoreHook(hook: RestoreHook, backupId: string, context: Record<string, unknown>): Promise<void> {
    if (typeof hook === 'function') {
      await hook(backupId, context);
    }
  }

  override async start(): Promise<void> {
    const storageInfo = this.driver!.getStorageInfo();
    this.logger.debug({ driverType: storageInfo.type }, `Started with driver: ${storageInfo.type}`);
  }

  override async stop(): Promise<void> {
    for (const backupId of this.activeBackups) {
      this.emit('plg:backup:cancelled', { id: backupId });
    }
    this.activeBackups.clear();

    if (this.driver) {
      await this.driver.cleanup();
    }
  }
}
