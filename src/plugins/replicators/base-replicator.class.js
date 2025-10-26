import EventEmitter from 'events';
import { ReplicationError } from '../replicator.errors.js';

/**
 * Base class for all replicator drivers
 * Defines the interface that all replicators must implement
 */
export class BaseReplicator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.name = this.constructor.name;
    this.enabled = config.enabled !== false; // Default to enabled unless explicitly disabled
  }

  /**
   * Initialize the replicator
   * @param {Object} database - The s3db database instance
   * @returns {Promise<void>}
   */
  async initialize(database) {
    this.database = database;
    this.emit('db:plugin:initialized', { replicator: this.name });
  }

  /**
   * Replicate data to the target
   * @param {string} resourceName - Name of the resource being replicated
   * @param {string} operation - Operation type (insert, update, delete)
   * @param {Object} data - The data to replicate
   * @param {string} id - Record ID
   * @returns {Promise<Object>} replicator result
   */
  async replicate(resourceName, operation, data, id) {
    throw new ReplicationError('replicate() method must be implemented by subclass', {
      operation: 'replicate',
      replicatorClass: this.name,
      resourceName,
      suggestion: 'Extend BaseReplicator and implement the replicate() method'
    });
  }

  /**
   * Replicate multiple records in batch
   * @param {string} resourceName - Name of the resource being replicated
   * @param {Array} records - Array of records to replicate
   * @returns {Promise<Object>} Batch replicator result
   */
  async replicateBatch(resourceName, records) {
    throw new ReplicationError('replicateBatch() method must be implemented by subclass', {
      operation: 'replicateBatch',
      replicatorClass: this.name,
      resourceName,
      batchSize: records?.length,
      suggestion: 'Extend BaseReplicator and implement the replicateBatch() method'
    });
  }

  /**
   * Test the connection to the target
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    throw new ReplicationError('testConnection() method must be implemented by subclass', {
      operation: 'testConnection',
      replicatorClass: this.name,
      suggestion: 'Extend BaseReplicator and implement the testConnection() method'
    });
  }

  /**
   * Get replicator status and statistics
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    return {
      name: this.name,
      // Removed: enabled: this.enabled,
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