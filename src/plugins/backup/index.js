import BaseBackupDriver from './base-backup-driver.class.js';
import FilesystemBackupDriver from './filesystem-backup-driver.class.js';
import S3BackupDriver from './s3-backup-driver.class.js';
import MultiBackupDriver from './multi-backup-driver.class.js';

export { 
  BaseBackupDriver, 
  FilesystemBackupDriver, 
  S3BackupDriver, 
  MultiBackupDriver 
};

/**
 * Available backup drivers
 */
export const BACKUP_DRIVERS = {
  filesystem: FilesystemBackupDriver,
  s3: S3BackupDriver,
  multi: MultiBackupDriver
};

/**
 * Create a backup driver instance based on driver type
 * @param {string} driver - Driver type (filesystem, s3, multi)
 * @param {Object} config - Driver configuration
 * @returns {BaseBackupDriver} Driver instance
 */
export function createBackupDriver(driver, config = {}) {
  const DriverClass = BACKUP_DRIVERS[driver];
  
  if (!DriverClass) {
    throw new Error(`Unknown backup driver: ${driver}. Available drivers: ${Object.keys(BACKUP_DRIVERS).join(', ')}`);
  }
  
  return new DriverClass(config);
}

/**
 * Validate backup driver configuration
 * @param {string} driver - Driver type
 * @param {Object} config - Driver configuration
 * @throws {Error} If configuration is invalid
 */
export function validateBackupConfig(driver, config = {}) {
  if (!driver || typeof driver !== 'string') {
    throw new Error('Driver type must be a non-empty string');
  }

  if (!BACKUP_DRIVERS[driver]) {
    throw new Error(`Unknown backup driver: ${driver}. Available drivers: ${Object.keys(BACKUP_DRIVERS).join(', ')}`);
  }

  // Driver-specific validation
  switch (driver) {
    case 'filesystem':
      if (!config.path) {
        throw new Error('FilesystemBackupDriver requires "path" configuration');
      }
      break;

    case 's3':
      // S3 driver can use database client/bucket, so no strict validation here
      break;

    case 'multi':
      if (!Array.isArray(config.destinations) || config.destinations.length === 0) {
        throw new Error('MultiBackupDriver requires non-empty "destinations" array');
      }
      
      // Validate each destination
      config.destinations.forEach((dest, index) => {
        if (!dest.driver) {
          throw new Error(`Destination ${index} must have a "driver" property`);
        }
        
        // Recursive validation for nested drivers
        if (dest.driver !== 'multi') { // Prevent infinite recursion
          validateBackupConfig(dest.driver, dest.config || {});
        }
      });
      break;
  }

  return true;
}