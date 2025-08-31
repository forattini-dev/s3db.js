import { EventEmitter } from 'events';

/**
 * Robust partition operation queue with retry and persistence
 */
export class PartitionQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.persistence = options.persistence || null; // Could be filesystem/redis/etc
    this.queue = [];
    this.processing = false;
    this.failures = [];
  }

  /**
   * Add partition operation to queue
   */
  async enqueue(operation) {
    const item = {
      id: `${Date.now()}-${Math.random()}`,
      operation,
      retries: 0,
      createdAt: new Date(),
      status: 'pending'
    };
    
    this.queue.push(item);
    
    // Persist if configured
    if (this.persistence) {
      await this.persistence.save(item);
    }
    
    // Start processing if not already
    if (!this.processing) {
      setImmediate(() => this.process());
    }
    
    return item.id;
  }

  /**
   * Process queue items
   */
  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        await this.executeOperation(item);
        item.status = 'completed';
        this.emit('success', item);
        
        // Remove from persistence
        if (this.persistence) {
          await this.persistence.remove(item.id);
        }
      } catch (error) {
        item.retries++;
        item.lastError = error;
        
        if (item.retries < this.maxRetries) {
          // Retry with exponential backoff
          const delay = this.retryDelay * Math.pow(2, item.retries - 1);
          item.status = 'retrying';
          
          setTimeout(() => {
            this.queue.push(item);
            if (!this.processing) this.process();
          }, delay);
          
          this.emit('retry', { item, error, delay });
        } else {
          // Max retries reached
          item.status = 'failed';
          this.failures.push(item);
          this.emit('failure', { item, error });
          
          // Move to DLQ in persistence
          if (this.persistence) {
            await this.persistence.moveToDLQ(item);
          }
        }
      }
    }
    
    this.processing = false;
  }

  /**
   * Execute the actual partition operation
   */
  async executeOperation(item) {
    const { type, resource, data } = item.operation;
    
    switch (type) {
      case 'create':
        return await resource.createPartitionReferences(data);
      case 'update':
        return await resource.handlePartitionReferenceUpdates(data.original, data.updated);
      case 'delete':
        return await resource.deletePartitionReferences(data);
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  /**
   * Recover from persistence on startup
   */
  async recover() {
    if (!this.persistence) return;
    
    const items = await this.persistence.getPending();
    this.queue.push(...items);
    
    if (this.queue.length > 0) {
      this.emit('recovered', { count: this.queue.length });
      setImmediate(() => this.process());
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      pending: this.queue.length,
      failures: this.failures.length,
      processing: this.processing,
      failureRate: this.failures.length / (this.queue.length + this.failures.length) || 0
    };
  }
}

/**
 * Simple in-memory persistence (can be replaced with Redis, filesystem, etc)
 */
export class InMemoryPersistence {
  constructor() {
    this.items = new Map();
    this.dlq = new Map();
  }

  async save(item) {
    this.items.set(item.id, item);
  }

  async remove(id) {
    this.items.delete(id);
  }

  async moveToDLQ(item) {
    this.items.delete(item.id);
    this.dlq.set(item.id, item);
  }

  async getPending() {
    return Array.from(this.items.values());
  }

  async getDLQ() {
    return Array.from(this.dlq.values());
  }
}