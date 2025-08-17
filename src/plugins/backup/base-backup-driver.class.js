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
    throw new Error('upload() method must be implemented by subclass');
  }

  /**
   * Download a backup file from the destination
   * @param {string} backupId - Unique backup identifier
   * @param {string} targetPath - Local path to save the backup
   * @param {Object} metadata - Backup metadata
   * @returns {string} Path to downloaded file
   */
  async download(backupId, targetPath, metadata) {
    throw new Error('download() method must be implemented by subclass');
  }

  /**
   * Delete a backup from the destination
   * @param {string} backupId - Unique backup identifier
   * @param {Object} metadata - Backup metadata
   */
  async delete(backupId, metadata) {
    throw new Error('delete() method must be implemented by subclass');
  }

  /**
   * List backups available in the destination
   * @param {Object} options - List options (limit, prefix, etc.)
   * @returns {Array} List of backup metadata
   */
  async list(options = {}) {
    throw new Error('list() method must be implemented by subclass');
  }

  /**
   * Verify backup integrity
   * @param {string} backupId - Unique backup identifier
   * @param {string} expectedChecksum - Expected file checksum
   * @param {Object} metadata - Backup metadata
   * @returns {boolean} True if backup is valid
   */
  async verify(backupId, expectedChecksum, metadata) {
    throw new Error('verify() method must be implemented by subclass');
  }

  /**
   * Get driver type identifier
   * @returns {string} Driver type
   */
  getType() {
    throw new Error('getType() method must be implemented by subclass');
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
      console.log(`[${this.getType()}BackupDriver] ${message}`);
    }
  }
}