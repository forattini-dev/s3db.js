import { EventEmitter } from 'events';

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
    throw new Error('queue() must be implemented by subclass');
  }

  /**
   * Process a single partition operation
   */
  async processOperation(operation) {
    const { type, resource, data } = operation;
    
    try {
      this.stats.processing++;
      
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
          throw new Error(`Unknown partition operation type: ${type}`);
      }
      
      this.stats.processed++;
      this.emit('processed', operation);
      
    } catch (error) {
      this.stats.failed++;
      this.emit('error', { operation, error });
      throw error;
    } finally {
      this.stats.processing--;
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