import EventEmitter from 'events';

/**
 * Base class for all replicator drivers
 * Defines the interface that all replicators must implement
 */
export class BaseReplicator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.name = this.constructor.name;
    this.enabled = config.enabled !== false;
  }

  /**
   * Initialize the replicator
   * @param {Object} database - The s3db database instance
   * @returns {Promise<void>}
   */
  async initialize(database) {
    this.database = database;
    this.emit('initialized', { replicator: this.name });
  }

  /**
   * Replicate data to the target
   * @param {string} resourceName - Name of the resource being replicated
   * @param {string} operation - Operation type (insert, update, delete)
   * @param {Object} data - The data to replicate
   * @param {string} id - Record ID
   * @returns {Promise<Object>} Replication result
   */
  async replicate(resourceName, operation, data, id) {
    throw new Error(`replicate() method must be implemented by ${this.name}`);
  }

  /**
   * Replicate multiple records in batch
   * @param {string} resourceName - Name of the resource being replicated
   * @param {Array} records - Array of records to replicate
   * @returns {Promise<Object>} Batch replication result
   */
  async replicateBatch(resourceName, records) {
    throw new Error(`replicateBatch() method must be implemented by ${this.name}`);
  }

  /**
   * Test the connection to the target
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    throw new Error(`testConnection() method must be implemented by ${this.name}`);
  }

  /**
   * Get replicator status and statistics
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config,
      connected: false
    };
  }

  /**
   * Cleanup resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.emit('cleanup', { replicator: this.name });
  }

  /**
   * Validate replicator configuration
   * @returns {Object} Validation result
   */
  validateConfig() {
    return { isValid: true, errors: [] };
  }
}

export default BaseReplicator; 