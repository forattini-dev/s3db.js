import { BackupError } from '../backup.errors.js';
import type BaseBackupDriver from './base-backup-driver.class.js';
import type { BackupDriverConfig } from './base-backup-driver.class.js';
import FilesystemBackupDriver from './filesystem-backup-driver.class.js';
import S3BackupDriver from './s3-backup-driver.class.js';

export type BackupDriverType = 'filesystem' | 's3' | 'multi';

export interface BackupDriverConstructor {
  new (config?: BackupDriverConfig): BaseBackupDriver;
}

export interface DestinationConfig {
  driver: BackupDriverType;
  config?: BackupDriverConfig;
}

export interface MultiBackupDriverConfig extends BackupDriverConfig {
  destinations: DestinationConfig[];
  strategy?: 'all' | 'any' | 'priority';
  concurrency?: number;
}

const BACKUP_DRIVERS_MAP: Record<string, BackupDriverConstructor> = {
  filesystem: FilesystemBackupDriver,
  s3: S3BackupDriver
};

export const BACKUP_DRIVERS: Record<string, BackupDriverConstructor | null> = {
  filesystem: FilesystemBackupDriver,
  s3: S3BackupDriver,
  multi: null
};

export function createBackupDriver(driver: string, config: BackupDriverConfig = {}): BaseBackupDriver {
  const DriverClass = BACKUP_DRIVERS[driver] || BACKUP_DRIVERS_MAP[driver];

  if (!DriverClass) {
    throw new BackupError(`Unknown backup driver: ${driver}`, {
      operation: 'createBackupDriver',
      driver,
      availableDrivers: Object.keys(BACKUP_DRIVERS),
      suggestion: `Use one of the available drivers: ${Object.keys(BACKUP_DRIVERS).join(', ')}`
    });
  }

  return new DriverClass(config);
}

export function validateBackupConfig(driver: string, config: BackupDriverConfig = {}): boolean {
  if (!driver || typeof driver !== 'string') {
    throw new BackupError('Driver type must be a non-empty string', {
      operation: 'validateBackupConfig',
      driver,
      suggestion: 'Provide a valid driver type string (filesystem, s3, or multi)'
    });
  }

  if (!BACKUP_DRIVERS[driver]) {
    throw new BackupError(`Unknown backup driver: ${driver}`, {
      operation: 'validateBackupConfig',
      driver,
      availableDrivers: Object.keys(BACKUP_DRIVERS),
      suggestion: `Use one of the available drivers: ${Object.keys(BACKUP_DRIVERS).join(', ')}`
    });
  }

  switch (driver) {
    case 'filesystem':
      if (!(config as { path?: string }).path) {
        throw new BackupError('FilesystemBackupDriver requires "path" configuration', {
          operation: 'validateBackupConfig',
          driver: 'filesystem',
          config,
          suggestion: 'Provide a "path" property in config: { path: "/path/to/backups" }'
        });
      }
      break;

    case 's3':
      break;

    case 'multi': {
      const multiConfig = config as MultiBackupDriverConfig;
      if (!Array.isArray(multiConfig.destinations) || multiConfig.destinations.length === 0) {
        throw new BackupError('MultiBackupDriver requires non-empty "destinations" array', {
          operation: 'validateBackupConfig',
          driver: 'multi',
          config,
          suggestion: 'Provide destinations array: { destinations: [{ driver: "s3", config: {...} }] }'
        });
      }

      multiConfig.destinations.forEach((dest, index) => {
        if (!dest.driver) {
          throw new BackupError(`Destination ${index} must have a "driver" property`, {
            operation: 'validateBackupConfig',
            driver: 'multi',
            destinationIndex: index,
            destination: dest,
            suggestion: 'Each destination must have a driver property: { driver: "s3", config: {...} }'
          });
        }

        if (dest.driver !== 'multi') {
          validateBackupConfig(dest.driver, dest.config || {});
        }
      });
      break;
    }
  }

  return true;
}
