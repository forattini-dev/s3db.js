import { EventEmitter } from 'events';
import { PartitionDriverError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';

/**
 * Base class for all partition drivers
 * Defines the interface that all drivers must implement
 */
export class BasePartitionDriver extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.stats = {
      queued: 0,
      processed: 0,
      failed: 0,
      processing: 0
    };
  }

  /**
   * Initialize the driver
   */
  async initialize() {
    // Override in subclasses if needed
  }

  /**
   * Queue partition operations for processing
   * @param {Object} operation - The partition operation to queue
   * @param {string} operation.type - 'create', 'update', or 'delete'
   * @param {Object} operation.resource - The resource instance
   * @param {Object} operation.data - The data for the operation
   */
  async queue(operation) {
    throw new PartitionDriverError('queue() must be implemented by subclass', {
      driver: this.name || 'BasePartitionDriver',
      operation: 'queue',
      suggestion: 'Extend BasePartitionDriver and implement the queue() method'
    });
  }

  /**
   * Process a single partition operation
   */
  async processOperation(operation) {
    const { type, resource, data } = operation;
    
    this.stats.processing++;

    const [ok, error] = await tryFn(async () => {
      switch (type) {
        case 'create':
          await resource.createPartitionReferences(data.object);
          break;

        case 'update':
          await resource.handlePartitionReferenceUpdates(data.original, data.updated);
          break;

        case 'delete':
          await resource.deletePartitionReferences(data.object);
          break;

        default:
          throw new PartitionDriverError(`Unknown partition operation type: ${type}`, {
            driver: this.name || 'BasePartitionDriver',
            operation: type,
            availableOperations: ['create', 'update', 'delete'],
            suggestion: 'Use one of the supported partition operations: create, update, or delete'
          });
      }

      this.stats.processed++;
      this.emit('processed', operation);
    });

    // Always execute (finally equivalent)
    this.stats.processing--;

    if (!ok) {
      this.stats.failed++;
      this.emit('error', { operation, error });
      throw error;
    }
  }

  /**
   * Flush any pending operations
   */
  async flush() {
    // Override in subclasses if needed
  }

  /**
   * Get driver statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Shutdown the driver
   */
  async shutdown() {
    await this.flush();
    this.removeAllListeners();
  }
}