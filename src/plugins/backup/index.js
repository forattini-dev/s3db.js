import BaseBackupDriver from './base-backup-driver.class.js';
import FilesystemBackupDriver from './filesystem-backup-driver.class.js';
import S3BackupDriver from './s3-backup-driver.class.js';
import MultiBackupDriver from './multi-backup-driver.class.js';
import { BACKUP_DRIVERS, createBackupDriver, validateBackupConfig } from './factory.js';

// Register MultiBackupDriver in BACKUP_DRIVERS to avoid circular dependency
BACKUP_DRIVERS.multi = MultiBackupDriver;

// Re-export driver classes
export {
  BaseBackupDriver,
  FilesystemBackupDriver,
  S3BackupDriver,
  MultiBackupDriver
};

// Re-export factory functions and constants
export {
  BACKUP_DRIVERS,
  createBackupDriver,
  validateBackupConfig
};