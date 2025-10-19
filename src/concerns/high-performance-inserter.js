import { PromisePool } from '@supercharge/promise-pool';
import { tryFn } from './try-fn.js';

/**
 * High-performance bulk inserter for S3DB
 * Optimized for continuous high-volume inserts with partitions
 */
export class HighPerformanceInserter {
  constructor(resource, options = {}) {
    this.resource = resource;
    
    // Performance tuning
    this.batchSize = options.batchSize || 100;
    this.concurrency = options.concurrency || 50; // Parallel S3 operations
    this.flushInterval = options.flushInterval || 1000; // ms
    this.disablePartitions = options.disablePartitions || false;
    this.useStreamMode = options.useStreamMode || false;
    
    // Buffers
    this.insertBuffer = [];
    this.partitionBuffer = new Map(); // Deferred partition operations
    this.stats = {
      inserted: 0,
      failed: 0,
      partitionsPending: 0,
      avgInsertTime: 0
    };
    
    // Auto-flush timer
    this.flushTimer = null;
    this.isProcessing = false;
    
    // Partition processing queue
    this.partitionQueue = [];
    this.partitionProcessor = null;
  }

  /**
   * Add item to insert buffer (non-blocking)
   */
  async add(data) {
    this.insertBuffer.push({
      data,
      timestamp: Date.now(),
      promise: null
    });
    
    // Auto-flush when buffer is full
    if (this.insertBuffer.length >= this.batchSize) {
      setImmediate(() => this.flush());
    } else if (!this.flushTimer) {
      // Set flush timer if not already set
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
    
    return { queued: true, position: this.insertBuffer.length };
  }

  /**
   * Bulk add items
   */
  async bulkAdd(items) {
    for (const item of items) {
      await this.add(item);
    }
    return { queued: items.length };
  }

  /**
   * Process buffered inserts in parallel
   */
  async flush() {
    if (this.isProcessing || this.insertBuffer.length === 0) return;
    
    this.isProcessing = true;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    
    // Take current buffer and reset
    const batch = this.insertBuffer.splice(0, this.batchSize);
    const startTime = Date.now();

    const [ok, err] = await tryFn(async () => {
      // Process inserts in parallel with connection pooling
      const { results, errors } = await PromisePool
        .for(batch)
        .withConcurrency(this.concurrency)
        .process(async (item) => {
          return await this.performInsert(item);
        });

      // Update stats
      const duration = Date.now() - startTime;
      this.stats.inserted += results.filter(r => r.success).length;
      this.stats.failed += errors.length;
      this.stats.avgInsertTime = duration / batch.length;

      // Process partition queue separately (non-blocking)
      if (!this.disablePartitions && this.partitionQueue.length > 0) {
        this.processPartitionsAsync();
      }
    });

    // Always execute (finally equivalent)
    this.isProcessing = false;

    // Continue processing if more items
    if (this.insertBuffer.length > 0) {
      setImmediate(() => this.flush());
    }
  }

  /**
   * Perform single insert with optimizations
   */
  async performInsert(item) {
    const { data } = item;

    const [ok, error, result] = await tryFn(async () => {
      // Temporarily disable partitions for the insert
      const originalAsyncPartitions = this.resource.config.asyncPartitions;
      const originalPartitions = this.resource.config.partitions;

      if (this.disablePartitions) {
        // Completely bypass partitions during insert
        this.resource.config.partitions = {};
      }

      // Perform insert
      const [insertOk, insertErr, insertResult] = await tryFn(() => this.resource.insert(data));

      if (!insertOk) {
        throw insertErr; // Re-throw to be caught by outer tryFn
      }

      // Queue partition creation for later (if not disabled)
      if (!this.disablePartitions && originalPartitions && Object.keys(originalPartitions).length > 0) {
        this.partitionQueue.push({
          operation: 'create',
          data: insertResult,
          partitions: originalPartitions
        });
        this.stats.partitionsPending++;
      }

      // Restore original config
      this.resource.config.partitions = originalPartitions;
      this.resource.config.asyncPartitions = originalAsyncPartitions;

      return { success: true, data: insertResult };
    });

    if (!ok) {
      return { success: false, error };
    }

    return result;
  }

  /**
   * Process partitions asynchronously in background
   */
  async processPartitionsAsync() {
    if (this.partitionProcessor) return; // Already processing
    
    this.partitionProcessor = setImmediate(async () => {
      const batch = this.partitionQueue.splice(0, 100); // Process 100 at a time
      
      if (batch.length === 0) {
        this.partitionProcessor = null;
        return;
      }
      
      // Create partitions in parallel with lower priority
      await PromisePool
        .for(batch)
        .withConcurrency(10) // Lower concurrency for partitions
        .process(async (item) => {
          const [ok, err] = await tryFn(() => this.resource.createPartitionReferences(item.data));

          if (ok) {
            this.stats.partitionsPending--;
          } else {
            // Silently handle partition errors
            this.resource.emit('partitionIndexError', {
              operation: 'bulk-insert',
              error: err
            });
          }
        });
      
      // Continue processing if more partitions
      if (this.partitionQueue.length > 0) {
        this.processPartitionsAsync();
      } else {
        this.partitionProcessor = null;
      }
    });
  }

  /**
   * Force flush all pending operations
   */
  async forceFlush() {
    while (this.insertBuffer.length > 0 || this.isProcessing) {
      await this.flush();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.insertBuffer.length,
      isProcessing: this.isProcessing,
      throughput: this.stats.avgInsertTime > 0 
        ? Math.round(1000 / this.stats.avgInsertTime) 
        : 0 // inserts per second
    };
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    clearTimeout(this.flushTimer);
    this.insertBuffer = [];
    this.partitionQueue = [];
  }
}

/**
 * Stream-based inserter for maximum performance
 */
export class StreamInserter {
  constructor(resource, options = {}) {
    this.resource = resource;
    this.concurrency = options.concurrency || 100;
    this.skipPartitions = options.skipPartitions !== false;
    this.skipHooks = options.skipHooks || false;
    this.skipValidation = options.skipValidation || false;
  }

  /**
   * Direct S3 write bypassing most S3DB overhead
   */
  async fastInsert(data) {
    const id = data.id || this.resource.generateId();
    const key = this.resource.getResourceKey(id);
    
    // Minimal processing
    const metadata = this.skipValidation 
      ? { id, ...data }
      : await this.resource.schema.mapper({ id, ...data });
    
    // Direct S3 put
    const command = {
      Bucket: this.resource.client.config.bucket,
      Key: key,
      Metadata: metadata,
      Body: '' // Empty body for speed
    };
    
    await this.resource.client.client.send(new PutObjectCommand(command));
    
    return { id, inserted: true };
  }

  /**
   * Bulk insert with maximum parallelism
   */
  async bulkInsert(items) {
    const { results, errors } = await PromisePool
      .for(items)
      .withConcurrency(this.concurrency)
      .process(async (item) => {
        return await this.fastInsert(item);
      });
    
    return {
      success: results.length,
      failed: errors.length,
      errors: errors.slice(0, 10) // First 10 errors
    };
  }
}