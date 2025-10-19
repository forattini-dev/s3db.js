import { BasePartitionDriver } from './base-partition-driver.js';
import { PromisePool } from '@supercharge/promise-pool';
import { PartitionDriverError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';

/**
 * In-memory partition driver with background processing
 * Queues operations in memory and processes them asynchronously
 * Fast and efficient for single-instance applications
 */
export class MemoryPartitionDriver extends BasePartitionDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'memory';
    
    // Configuration
    this.batchSize = options.batchSize || 100;
    this.concurrency = options.concurrency || 10;
    this.flushInterval = options.flushInterval || 1000;
    this.maxQueueSize = options.maxQueueSize || 10000;
    this.maxRetries = options.maxRetries || 3;
    
    // State
    this.queue = [];
    this.isProcessing = false;
    this.flushTimer = null;
    this.retryQueue = [];
  }

  async initialize() {
    // Start background processor
    this.startProcessor();
  }

  /**
   * Add operation to in-memory queue
   */
  async queue(operation) {
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      const error = new PartitionDriverError('Memory queue full - backpressure detected', {
        driver: 'memory',
        operation: 'queue',
        queueSize: this.queue.length,
        maxQueueSize: this.maxQueueSize,
        suggestion: 'Increase maxQueueSize, enable rejectOnFull, or reduce operation rate'
      });
      this.emit('queueFull', { operation, queueSize: this.queue.length });

      if (this.options.rejectOnFull) {
        throw error;
      }

      // Wait for some space
      await this.waitForSpace();
    }
    
    // Add to queue with metadata
    const queueItem = {
      ...operation,
      id: `${Date.now()}-${Math.random()}`,
      queuedAt: new Date(),
      attempts: 0
    };
    
    this.queue.push(queueItem);
    this.stats.queued++;
    
    // Auto-flush when batch size reached
    if (this.queue.length >= this.batchSize) {
      this.triggerFlush();
    }
    
    return { 
      success: true, 
      driver: 'memory',
      queuePosition: this.queue.length,
      queueId: queueItem.id
    };
  }

  /**
   * Start the background processor
   */
  startProcessor() {
    // Set up periodic flush
    if (this.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        if (this.queue.length > 0 && !this.isProcessing) {
          this.processQueue();
        }
      }, this.flushInterval);
    }
  }

  /**
   * Trigger immediate flush
   */
  triggerFlush() {
    if (!this.isProcessing) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Process queued operations in batches
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;

    const [ok, err] = await tryFn(async () => {
      // Take a batch from the queue
      const batch = this.queue.splice(0, this.batchSize);

      // Process in parallel with concurrency control
      const { results, errors } = await PromisePool
        .for(batch)
        .withConcurrency(this.concurrency)
        .process(async (item) => {
          const [itemOk, itemErr, itemResult] = await tryFn(() => this.processOperation(item));

          if (itemOk) {
            return { success: true, item };
          } else {
            return this.handleError(item, itemErr);
          }
        });

      // Handle successful results
      const successful = results.filter(r => r.success);
      this.emit('batchProcessed', {
        processed: successful.length,
        failed: errors.length,
        retried: results.filter(r => r.retried).length
      });
    });

    // Always execute (finally equivalent)
    this.isProcessing = false;

    // Continue processing if more items
    if (this.queue.length > 0) {
      setImmediate(() => this.processQueue());
    }

    // Process retry queue if needed
    if (this.retryQueue.length > 0) {
      this.processRetryQueue();
    }
  }

  /**
   * Handle processing errors with retry logic
   */
  handleError(item, error) {
    item.attempts++;
    item.lastError = error;
    
    if (item.attempts < this.maxRetries) {
      // Add to retry queue with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, item.attempts - 1), 30000);
      
      setTimeout(() => {
        this.retryQueue.push(item);
        if (!this.isProcessing) {
          this.processRetryQueue();
        }
      }, delay);
      
      this.emit('retry', { item, error, attempt: item.attempts, delay });
      return { success: false, retried: true, item };
    } else {
      // Max retries exceeded
      this.emit('failed', { item, error, attempts: item.attempts });
      return { success: false, retried: false, item };
    }
  }

  /**
   * Process retry queue
   */
  async processRetryQueue() {
    if (this.retryQueue.length === 0) return;
    
    // Move retry items back to main queue
    const retryItems = this.retryQueue.splice(0, this.batchSize);
    this.queue.unshift(...retryItems);
    
    // Trigger processing
    this.triggerFlush();
  }

  /**
   * Wait for queue space
   */
  async waitForSpace() {
    const checkInterval = 100;
    const maxWait = 30000;
    const startTime = Date.now();
    
    while (this.queue.length >= this.maxQueueSize) {
      if (Date.now() - startTime > maxWait) {
        throw new PartitionDriverError('Timeout waiting for queue space', {
          driver: 'memory',
          operation: 'waitForSpace',
          queueSize: this.queue.length,
          maxQueueSize: this.maxQueueSize,
          waitedMs: Date.now() - startTime,
          maxWaitMs: maxWait,
          suggestion: 'Queue is full and not draining fast enough. Increase maxQueueSize or concurrency'
        });
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Force flush all pending operations
   */
  async flush() {
    // Process all remaining items
    while (this.queue.length > 0 || this.retryQueue.length > 0 || this.isProcessing) {
      await this.processQueue();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Get detailed statistics
   */
  getStats() {
    return {
      ...super.getStats(),
      queueLength: this.queue.length,
      retryQueueLength: this.retryQueue.length,
      isProcessing: this.isProcessing,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage of the queue
   */
  estimateMemoryUsage() {
    // Rough estimate: 1KB per queue item
    const bytes = (this.queue.length + this.retryQueue.length) * 1024;
    return {
      bytes,
      mb: (bytes / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Shutdown the driver
   */
  async shutdown() {
    // Stop the flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush remaining items
    await this.flush();
    
    // Clear queues
    this.queue = [];
    this.retryQueue = [];
    
    await super.shutdown();
  }

  getInfo() {
    return {
      name: this.name,
      mode: 'asynchronous',
      description: 'In-memory queue with background processing',
      config: {
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        flushInterval: this.flushInterval,
        maxQueueSize: this.maxQueueSize,
        maxRetries: this.maxRetries
      },
      stats: this.getStats()
    };
  }
}