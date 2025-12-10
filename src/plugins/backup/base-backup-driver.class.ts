import { BackupError, type BackupErrorDetails } from '../backup.errors.js';
import { createLogger, type Logger } from '../../concerns/logger.js';
import type { Database } from '../../database.class.js';

export interface BackupDriverConfig {
  compression?: 'none' | 'gzip' | 'brotli' | 'deflate';
  encryption?: {
    key: string;
    algorithm: string;
  } | null;
  logLevel?: string;
  [key: string]: unknown;
}

export interface BackupManifest {
  type?: string;
  timestamp?: number;
  resources?: string[];
  compression?: string;
  encrypted?: boolean;
  s3db_version?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface UploadResult {
  path?: string;
  key?: string;
  bucket?: string;
  manifestPath?: string;
  manifestKey?: string;
  size?: number;
  uploadedAt?: string;
  storageClass?: string;
  etag?: string;
  [key: string]: unknown;
}

export interface BackupMetadata {
  path?: string;
  key?: string;
  bucket?: string;
  manifestPath?: string;
  manifestKey?: string;
  destination?: number;
  destinations?: BackupMetadata[];
  status?: string;
  [key: string]: unknown;
}

export interface ListOptions {
  limit?: number;
  prefix?: string;
  [key: string]: unknown;
}

export interface BackupListItem {
  id: string;
  path?: string;
  key?: string;
  bucket?: string;
  manifestPath?: string;
  manifestKey?: string;
  size?: number;
  createdAt?: string;
  lastModified?: string;
  storageClass?: string;
  destinations?: BackupMetadata[];
  [key: string]: unknown;
}

export interface StorageInfo {
  type: string;
  config: BackupDriverConfig;
  [key: string]: unknown;
}

export default class BaseBackupDriver {
  config: BackupDriverConfig;
  logger: Logger;
  database!: Database;

  constructor(config: BackupDriverConfig = {}) {
    this.config = {
      compression: 'gzip',
      encryption: null,
      logLevel: 'info',
      ...config
    };

    this.logger = createLogger({
      name: 'BackupDriver',
      level: this.config.logLevel as import('../../concerns/logger.js').LogLevel
    });
  }

  async setup(database: Database): Promise<void> {
    this.database = database;
    await this.onSetup();
  }

  async onSetup(): Promise<void> {
    // Override in subclasses
  }

  async upload(_filePath: string, backupId: string, _manifest: BackupManifest): Promise<UploadResult | UploadResult[]> {
    throw new BackupError('upload() method must be implemented by subclass', {
      operation: 'upload',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the upload() method'
    });
  }

  async download(backupId: string, _targetPath: string, _metadata: BackupMetadata): Promise<string> {
    throw new BackupError('download() method must be implemented by subclass', {
      operation: 'download',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the download() method'
    });
  }

  async delete(backupId: string, _metadata: BackupMetadata): Promise<void> {
    throw new BackupError('delete() method must be implemented by subclass', {
      operation: 'delete',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the delete() method'
    });
  }

  async list(_options: ListOptions = {}): Promise<BackupListItem[]> {
    throw new BackupError('list() method must be implemented by subclass', {
      operation: 'list',
      driver: this.constructor.name,
      suggestion: 'Extend BaseBackupDriver and implement the list() method'
    });
  }

  async verify(backupId: string, _expectedChecksum: string, _metadata: BackupMetadata): Promise<boolean> {
    throw new BackupError('verify() method must be implemented by subclass', {
      operation: 'verify',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the verify() method'
    });
  }

  getType(): string {
    throw new BackupError('getType() method must be implemented by subclass', {
      operation: 'getType',
      driver: this.constructor.name,
      suggestion: 'Extend BaseBackupDriver and implement the getType() method'
    });
  }

  getStorageInfo(): StorageInfo {
    return {
      type: this.getType(),
      config: this.config
    };
  }

  async cleanup(): Promise<void> {
    // Override in subclasses if needed
  }

  log(message: string): void {
    if (this.config.logLevel) {
      this.logger.info(`[${this.getType()}BackupDriver] ${message}`);
    }
  }
}
