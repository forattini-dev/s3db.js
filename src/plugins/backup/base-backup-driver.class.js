import { BackupError } from '../backup.errors.js';

/**
 * BaseBackupDriver - Abstract base class for backup drivers
 *
 * Defines the interface that all backup drivers must implement.
 * Each driver handles a specific destination type (filesystem, S3, etc.)
 */
export default class BaseBackupDriver {
  constructor(config = {}) {
    this.config = {
      compression: 'gzip',
      encryption: null,
      verbose: false,
      ...config
    };
  }

  /**
   * Initialize the driver
   * @param {Database} database - S3DB database instance
   */
  async setup(database) {
    this.database = database;
    await this.onSetup();
  }

  /**
   * Override this method to perform driver-specific setup
   */
  async onSetup() {
    // Override in subclasses
  }

  /**
   * Upload a backup file to the destination
   * @param {string} filePath - Path to the backup file
   * @param {string} backupId - Unique backup identifier
   * @param {Object} manifest - Backup manifest with metadata
   * @returns {Object} Upload result with destination info
   */
  async upload(filePath, backupId, manifest) {
    throw new BackupError('upload() method must be implemented by subclass', {
      operation: 'upload',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the upload() method'
    });
  }

  /**
   * Download a backup file from the destination
   * @param {string} backupId - Unique backup identifier
   * @param {string} targetPath - Local path to save the backup
   * @param {Object} metadata - Backup metadata
   * @returns {string} Path to downloaded file
   */
  async download(backupId, targetPath, metadata) {
    throw new BackupError('download() method must be implemented by subclass', {
      operation: 'download',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the download() method'
    });
  }

  /**
   * Delete a backup from the destination
   * @param {string} backupId - Unique backup identifier
   * @param {Object} metadata - Backup metadata
   */
  async delete(backupId, metadata) {
    throw new BackupError('delete() method must be implemented by subclass', {
      operation: 'delete',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the delete() method'
    });
  }

  /**
   * List backups available in the destination
   * @param {Object} options - List options (limit, prefix, etc.)
   * @returns {Array} List of backup metadata
   */
  async list(options = {}) {
    throw new BackupError('list() method must be implemented by subclass', {
      operation: 'list',
      driver: this.constructor.name,
      suggestion: 'Extend BaseBackupDriver and implement the list() method'
    });
  }

  /**
   * Verify backup integrity
   * @param {string} backupId - Unique backup identifier
   * @param {string} expectedChecksum - Expected file checksum
   * @param {Object} metadata - Backup metadata
   * @returns {boolean} True if backup is valid
   */
  async verify(backupId, expectedChecksum, metadata) {
    throw new BackupError('verify() method must be implemented by subclass', {
      operation: 'verify',
      driver: this.constructor.name,
      backupId,
      suggestion: 'Extend BaseBackupDriver and implement the verify() method'
    });
  }

  /**
   * Get driver type identifier
   * @returns {string} Driver type
   */
  getType() {
    throw new BackupError('getType() method must be implemented by subclass', {
      operation: 'getType',
      driver: this.constructor.name,
      suggestion: 'Extend BaseBackupDriver and implement the getType() method'
    });
  }

  /**
   * Get driver-specific storage info
   * @returns {Object} Storage information
   */
  getStorageInfo() {
    return {
      type: this.getType(),
      config: this.config
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Override in subclasses if needed
  }

  /**
   * Log message if verbose mode is enabled
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.config.verbose) {
      this.logger.info(`[${this.getType()}BackupDriver] ${message}`);
    }
  }
}