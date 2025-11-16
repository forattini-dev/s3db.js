import EventEmitter from 'events';
import { PromisePool } from '@supercharge/promise-pool';
import { ReplicationError } from '../replicator.errors.js';
import { createLogger } from '../../concerns/logger.js';

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
    this.batchConcurrency = Math.max(1, config.batchConcurrency ?? 5);

    // 🪵 Logger initialization
    if (config.logger) {
      this.logger = config.logger;
    } else {
      const logLevel = config.logLevel ? 'debug' : 'info';
      this.logger = createLogger({ name: this.name, level: logLevel });
    }
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
   * Update the default batch concurrency at runtime
   * @param {number} value
   */
  setBatchConcurrency(value) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new ReplicationError('Batch concurrency must be a positive number', {
        operation: 'setBatchConcurrency',
        replicatorClass: this.name,
        providedValue: value,
        suggestion: 'Provide a positive integer value greater than zero.'
      });
    }
    this.batchConcurrency = Math.floor(value);
  }

  /**
   * Generic helper to process batches with controlled concurrency
   * @param {Array} records - Items to process
   * @param {Function} handler - Async handler executed for each record
   * @param {Object} options
   * @param {number} [options.concurrency] - Concurrency override
  * @param {Function} [options.mapError] - Maps thrown errors before collection
   * @returns {Promise<{results: Array, errors: Array}>}
   */
  async processBatch(records = [], handler, { concurrency, mapError } = {}) {
    if (!Array.isArray(records) || records.length === 0) {
      return { results: [], errors: [] };
    }

    if (typeof handler !== 'function') {
      throw new ReplicationError('processBatch requires an async handler function', {
        operation: 'processBatch',
        replicatorClass: this.name,
        suggestion: 'Provide an async handler: async (record) => { ... }'
      });
    }

    const limit = Math.max(1, concurrency ?? this.batchConcurrency ?? 5);
    const results = [];
    const errors = [];

    await PromisePool
      .withConcurrency(limit)
      .for(records)
      .process(async record => {
        try {
          const result = await handler(record);
          results.push(result);
        } catch (error) {
          if (typeof mapError === 'function') {
            const mapped = mapError(error, record);
            if (mapped !== undefined) {
              errors.push(mapped);
            }
          } else {
            errors.push({ record, error });
          }
        }
      });

    return { results, errors };
  }

  /**
   * Helper to build replication errors with contextual metadata
   * @param {string} message
   * @param {Object} details
   * @returns {ReplicationError}
   */
  createError(message, details = {}) {
    return new ReplicationError(message, {
      replicatorClass: this.name,
      operation: details.operation || 'unknown',
      resourceName: details.resourceName,
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion,
      description: details.description,
      docs: details.docs,
      hint: details.hint,
      metadata: details.metadata,
      ...details
    });
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
