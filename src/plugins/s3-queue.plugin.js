import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { resolveResourceName } from "./concerns/resource-names.js";
import { QueueError } from "./queue.errors.js";

/**
 * S3QueuePlugin - Distributed Queue System with ETag-based Atomicity
 *
 * Provides a distributed queue processing system using S3 as backend with:
 * - Atomic message claiming using S3 ETags (zero race conditions)
 * - Visibility timeout pattern (like SQS)
 * - Automatic retries with exponential backoff
 * - Dead letter queue support
 * - Concurrent workers with configurable concurrency
 * - At-least-once delivery guarantee
 *
 * === Configuration Example ===
 *
 * new S3QueuePlugin({
 *   resource: 'emails',                    // Target resource name
 *   visibilityTimeout: 30000,              // 30 seconds
 *   pollInterval: 1000,                    // 1 second
 *   maxAttempts: 3,                        // Max retry attempts
 *   concurrency: 5,                        // Number of concurrent workers
 *   deadLetterResource: 'failed_emails',   // Dead letter queue (optional)
 *   autoStart: true,                       // Auto-start workers
 *
 *   onMessage: async (record, context) => {
 *     // Process message
 *     await sendEmail(record);
 *     return { sent: true };
 *   },
 *
 *   onError: (error, record) => {
 *     console.error('Failed:', error);
 *   },
 *
 *   onComplete: (record, result) => {
 *     console.log('Completed:', result);
 *   }
 * });
 *
 * === Usage ===
 *
 * // Enqueue a message
 * await db.resources.emails.enqueue({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'World'
 * });
 *
 * // Start processing (if not auto-started)
 * await db.resources.emails.startProcessing(async (email) => {
 *   await sendEmail(email);
 * }, { concurrency: 10 });
 *
 * // Stop processing
 * await db.resources.emails.stopProcessing();
 *
 * // Get queue statistics
 * const stats = await db.resources.emails.queueStats();
 * // { total: 100, pending: 50, processing: 20, completed: 25, failed: 5, dead: 0 }
 */
export class S3QueuePlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    const resourceNamesOption = options.resourceNames || {};
    if (!options.resource) {
      throw new QueueError('S3QueuePlugin requires "resource" option', {
        pluginName: 'S3QueuePlugin',
        operation: 'constructor',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide the target resource name: new S3QueuePlugin({ resource: "orders", ... }).'
      });
    }

    this.config = {
      resource: options.resource,
      visibilityTimeout: options.visibilityTimeout || 30000,     // 30 seconds
      pollInterval: options.pollInterval || 1000,                 // 1 second
      maxAttempts: options.maxAttempts || 3,
      concurrency: options.concurrency || 1,
      deadLetterResource: options.deadLetterResource || null,
      autoStart: options.autoStart !== false,
      onMessage: options.onMessage,
      onError: options.onError,
      onComplete: options.onComplete,
      verbose: options.verbose || false,
      ...options
    };

    this._queueResourceDescriptor = {
      defaultName: `plg_s3queue_${this.config.resource}_queue`,
      override: resourceNamesOption.queue || options.queueResource
    };
    this.queueResourceName = this._resolveQueueResourceName();
    this.config.queueResourceName = this.queueResourceName;

    if (this.config.deadLetterResource) {
      this._deadLetterDescriptor = {
        defaultName: `plg_s3queue_${this.config.resource}_dead`,
        override: resourceNamesOption.deadLetter || this.config.deadLetterResource
      };
    } else {
      this._deadLetterDescriptor = null;
    }

    this.deadLetterResourceName = this._resolveDeadLetterResourceName();
    this.config.deadLetterResource = this.deadLetterResourceName;

    this.queueResource = null;       // Resource: <resource>_queue
    this.targetResource = null;      // Resource original do usuário
    this.deadLetterResourceObj = null;
    this.workers = [];
    this.isRunning = false;
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Deduplication cache to prevent S3 eventual consistency issues
    // Tracks recently processed messages to avoid reprocessing
    this.processedCache = new Map(); // queueId -> timestamp
    this.cacheCleanupInterval = null;
    this.lockCleanupInterval = null;
    this.messageLocks = new Map();
  }

  _resolveQueueResourceName() {
    return resolveResourceName('s3queue', this._queueResourceDescriptor, {
      namespace: this.namespace
    });
  }

  _resolveDeadLetterResourceName() {
    if (!this._deadLetterDescriptor) return null;
    return resolveResourceName('s3queue', this._deadLetterDescriptor, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    if (!this._queueResourceDescriptor) return;
    this.queueResourceName = this._resolveQueueResourceName();
    this.config.queueResourceName = this.queueResourceName;
    this.deadLetterResourceName = this._resolveDeadLetterResourceName();
    this.config.deadLetterResource = this.deadLetterResourceName;
  }

  async onInstall() {
    // Get target resource
    this.targetResource = this.database.resources[this.config.resource];
    if (!this.targetResource) {
      throw new QueueError(`Resource '${this.config.resource}' not found`, {
        pluginName: 'S3QueuePlugin',
        operation: 'onInstall',
        resourceName: this.config.resource,
        statusCode: 404,
        retriable: false,
        suggestion: 'Create the resource before installing S3QueuePlugin or update the plugin configuration.',
        availableResources: Object.keys(this.database.resources || {})
      });
    }

    // Create queue metadata resource
    const queueName = this.queueResourceName;
    const [ok, err] = await tryFn(() =>
      this.database.createResource({
        name: queueName,
        attributes: {
          id: 'string|required',
          originalId: 'string|required',      // ID do registro original
          status: 'string|required',          // pending/processing/completed/failed/dead
          visibleAt: 'number|required',       // Timestamp de visibilidade
          claimedBy: 'string|optional',       // Worker que claimed
          claimedAt: 'number|optional',       // Timestamp do claim
          attempts: 'number|default:0',
          maxAttempts: 'number|default:3',
          error: 'string|optional',
          result: 'json|optional',
          createdAt: 'string|required',
          completedAt: 'number|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        asyncPartitions: true,
        partitions: {
          byStatus: { fields: { status: 'string' } },
          byDate: { fields: { createdAt: 'string|maxlength:10' } }
        }
      })
    );

    if (ok) {
      this.queueResource = this.database.resources[queueName];
    } else {
      this.queueResource = this.database.resources[queueName];
      if (!this.queueResource) {
        throw new QueueError(`Failed to create queue resource: ${err?.message}`, {
          pluginName: 'S3QueuePlugin',
          operation: 'createQueueResource',
          queueName,
          statusCode: 500,
          retriable: false,
          suggestion: 'Check database permissions and ensure createResource() was successful.',
          original: err
        });
      }
    }
    this.queueResourceName = this.queueResource.name;

    // Locks are now managed by PluginStorage with TTL - no Resource needed
    // Lock acquisition is handled via storage.acquireLock() with automatic expiration

    // Add helper methods to target resource
    this.addHelperMethods();

    // Create dead letter resource if configured
    if (this.config.deadLetterResource) {
      await this.createDeadLetterResource();
    }

    if (this.config.verbose) {
      console.log(`[S3QueuePlugin] Setup completed for resource '${this.config.resource}'`);
    }
  }

  async onStart() {
    if (this.config.autoStart && this.config.onMessage) {
      await this.startProcessing();
    }
  }

  async onStop() {
    await this.stopProcessing();
  }

  addHelperMethods() {
    const plugin = this;
    const resource = this.targetResource;

    /**
     * Enqueue a message to the queue
     */
    resource.enqueue = async function(data, options = {}) {
      // Generate ID if not provided
      const recordData = {
        id: data.id || idGenerator(),
        ...data
      };

      // Insert original record first
      const record = await resource.insert(recordData);

      // Create queue entry
      const queueEntry = {
        id: idGenerator(),
        originalId: record.id,
        status: 'pending',
        visibleAt: Date.now(),
        attempts: 0,
        maxAttempts: options.maxAttempts || plugin.config.maxAttempts,
        createdAt: new Date().toISOString().slice(0, 10)
      };

      await plugin.queueResource.insert(queueEntry);

      plugin.emit('plg:s3-queue:message-enqueued', { id: record.id, queueId: queueEntry.id });

      return record;
    };

    /**
     * Get queue statistics
     */
    resource.queueStats = async function() {
      return await plugin.getStats();
    };

    /**
     * Start processing messages with worker(s)
     */
    resource.startProcessing = async function(handler, options = {}) {
      return await plugin.startProcessing(handler, options);
    };

    /**
     * Stop all workers
     */
    resource.stopProcessing = async function() {
      return await plugin.stopProcessing();
    };
  }

  async startProcessing(handler = null, options = {}) {
    if (this.isRunning) {
      if (this.config.verbose) {
        console.log('[S3QueuePlugin] Already running');
      }
      return;
    }

    const messageHandler = handler || this.config.onMessage;
    if (!messageHandler) {
      throw new QueueError('onMessage handler required', {
        pluginName: 'S3QueuePlugin',
        operation: 'startProcessing',
        queueName: this.queueResourceName,
        statusCode: 400,
        retriable: false,
        suggestion: 'Pass a handler: resource.startProcessing(async msg => {...}) or configure onMessage in plugin options.'
      });
    }

    this.isRunning = true;
    const concurrency = options.concurrency || this.config.concurrency;

    // Start cache cleanup (every 5 seconds, remove entries older than 30 seconds)
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 30000; // 30 seconds

      for (const [queueId, timestamp] of this.processedCache.entries()) {
        if (now - timestamp > maxAge) {
          this.processedCache.delete(queueId);
        }
      }
    }, 5000);

    // Lock cleanup no longer needed - TTL handles expiration automatically

    // Start N workers
    for (let i = 0; i < concurrency; i++) {
      const worker = this.createWorker(messageHandler, i);
      this.workers.push(worker);
    }

    if (this.config.verbose) {
      console.log(`[S3QueuePlugin] Started ${concurrency} workers`);
    }

    this.emit('plg:s3-queue:workers-started', { concurrency, workerId: this.workerId });
  }

  async stopProcessing() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop cache cleanup
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }

    // Lock cleanup interval no longer exists (TTL handles it)

    // Wait for workers to finish current tasks
    await Promise.all(this.workers);
    this.workers = [];

    // Clear deduplication cache
    this.processedCache.clear();

    if (this.config.verbose) {
      console.log('[S3QueuePlugin] Stopped all workers');
    }

    this.emit('plg:s3-queue:workers-stopped', { workerId: this.workerId });
  }

  createWorker(handler, workerIndex) {
    return (async () => {
      while (this.isRunning) {
        try {
          // Try to claim a message
          const message = await this.claimMessage();

          if (message) {
            // Process the claimed message
            await this.processMessage(message, handler);
          } else {
            // No messages available, wait before polling again
            await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
          }
        } catch (error) {
          if (this.config.verbose) {
            console.error(`[Worker ${workerIndex}] Error:`, error.message);
          }
          // Wait a bit before retrying on error
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    })();
  }

  async claimMessage() {
    const now = Date.now();

    // Query for available messages
    const [ok, err, messages] = await tryFn(() =>
      this.queueResource.query({
        status: 'pending'
      })
    );

    if (!ok || !messages || messages.length === 0) {
      return null;
    }

    // Filter messages that are visible now
    const available = messages.filter(m => m.visibleAt <= now);
    if (available.length === 0) {
      return null;
    }

    // Try to claim first available message using ETag
    for (const msg of available) {
      const claimed = await this.attemptClaim(msg);
      if (claimed) {
        return claimed;
      }
    }

    return null;
  }

  /**
   * Acquire a distributed lock using PluginStorage TTL
   * This ensures only one worker can claim a message at a time
   */
  _lockNameForMessage(messageId) {
    return `msg-${messageId}`;
  }

  async acquireLock(messageId) {
    const storage = this.getStorage();
    const lockName = this._lockNameForMessage(messageId);

    try {
      const lock = await storage.acquireLock(lockName, {
        ttl: 5, // 5 seconds
        timeout: 0, // Don't wait if locked
        workerId: this.workerId
      });

      if (lock) {
        this.messageLocks.set(lock.name, lock);
      }

      return lock;
    } catch (error) {
      // On any error, skip this message
      if (this.config.verbose) {
        console.log(`[acquireLock] Error: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Release a distributed lock via PluginStorage
   */
  async releaseLock(lockOrMessageId) {
    const storage = this.getStorage();
    let lock = null;

    if (lockOrMessageId && typeof lockOrMessageId === 'object') {
      lock = lockOrMessageId;
    } else {
      const lockName = this._lockNameForMessage(lockOrMessageId);
      lock = this.messageLocks.get(lockName) || null;
    }

    if (!lock) {
      return;
    }

    try {
      await storage.releaseLock(lock);
    } catch (error) {
      // Ignore errors on release (lock may have expired or been cleaned up)
      if (this.config.verbose) {
        console.log(`[releaseLock] Failed to release lock '${lock.name}': ${error.message}`);
      }
    } finally {
      if (lock?.name) {
        this.messageLocks.delete(lock.name);
      }
    }
  }

  /**
   * Clean up stale locks - NO LONGER NEEDED
   * TTL handles automatic expiration, no manual cleanup required
   */
  async cleanupStaleLocks() {
    // TTL automatically expires locks - no manual cleanup needed! ✨
    return;
  }

  async attemptClaim(msg) {
    const now = Date.now();

    // Try to acquire distributed lock for cache check
    // This prevents race condition where multiple workers check cache simultaneously
    const lock = await this.acquireLock(msg.id);

    if (!lock) {
      // Another worker is checking/claiming this message, skip it
      return null;
    }

    try {
      // Check deduplication cache (protected by lock)
      if (this.processedCache.has(msg.id)) {
        if (this.config.verbose) {
          console.log(`[attemptClaim] Message ${msg.id} already processed (in cache)`);
        }
        return null;
      }

      // Add to cache immediately (while still holding lock)
      // This prevents other workers from claiming this message
      this.processedCache.set(msg.id, Date.now());
    } finally {
      await this.releaseLock(lock);
    }

    // Fetch the message with ETag (query doesn't return _etag)
    const [okGet, errGet, msgWithETag] = await tryFn(() =>
      this.queueResource.get(msg.id)
    );

    if (!okGet || !msgWithETag) {
      // Message was deleted or not found - remove from cache
      this.processedCache.delete(msg.id);
      if (this.config.verbose) {
        console.log(`[attemptClaim] Message ${msg.id} not found or error: ${errGet?.message}`);
      }
      return null;
    }

    // Check if still pending and visible
    if (msgWithETag.status !== 'pending' || msgWithETag.visibleAt > now) {
      // Not claimable - remove from cache so another worker can try later
      this.processedCache.delete(msg.id);
      if (this.config.verbose) {
        console.log(`[attemptClaim] Message ${msg.id} not claimable: status=${msgWithETag.status}, visibleAt=${msgWithETag.visibleAt}, now=${now}`);
      }
      return null;
    }

    if (this.config.verbose) {
      console.log(`[attemptClaim] Attempting to claim ${msg.id} with ETag: ${msgWithETag._etag}`);
    }

    // Attempt atomic claim using ETag
    const [ok, err, result] = await tryFn(() =>
      this.queueResource.updateConditional(msgWithETag.id, {
        status: 'processing',
        claimedBy: this.workerId,
        claimedAt: now,
        visibleAt: now + this.config.visibilityTimeout,
        attempts: msgWithETag.attempts + 1
      }, {
        ifMatch: msgWithETag._etag  // ← ATOMIC CLAIM using ETag!
      })
    );

    if (!ok || !result.success) {
      // Race lost - another worker claimed it - remove from cache
      this.processedCache.delete(msg.id);
      if (this.config.verbose) {
        console.log(`[attemptClaim] Failed to claim ${msg.id}: ${err?.message || result.error}`)
      }
      return null;
    }

    if (this.config.verbose) {
      console.log(`[attemptClaim] Successfully claimed ${msg.id}`);
    }

    // Cache entry already added above, keep it

    // Success! Now load the original record
    const [okRecord, errRecord, record] = await tryFn(() =>
      this.targetResource.get(msgWithETag.originalId)
    );

    if (!okRecord) {
      // Original record was deleted? Mark queue entry as failed
      await this.failMessage(msgWithETag.id, 'Original record not found');
      return null;
    }

    return {
      queueId: msgWithETag.id,
      record,
      attempts: msgWithETag.attempts + 1,
      maxAttempts: msgWithETag.maxAttempts
    };
  }

  async processMessage(message, handler) {
    const startTime = Date.now();

    try {
      // Execute user handler
      const result = await handler(message.record, {
        queueId: message.queueId,
        attempts: message.attempts,
        workerId: this.workerId
      });

      // Mark as completed
      await this.completeMessage(message.queueId, result);

      const duration = Date.now() - startTime;

      this.emit('plg:s3-queue:message-completed', {
        queueId: message.queueId,
        originalId: message.record.id,
        duration,
        attempts: message.attempts
      });

      if (this.config.onComplete) {
        await this.config.onComplete(message.record, result);
      }

    } catch (error) {
      // Handle failure
      const shouldRetry = message.attempts < message.maxAttempts;

      if (shouldRetry) {
        // Retry with backoff
        await this.retryMessage(message.queueId, message.attempts, error.message);

        this.emit('plg:s3-queue:message-retry', {
          queueId: message.queueId,
          originalId: message.record.id,
          attempts: message.attempts,
          error: error.message
        });
      } else {
        // Max attempts reached - move to dead letter queue
        await this.moveToDeadLetter(message.queueId, message.record, error.message);

        this.emit('plg:s3-queue:message-dead', {
          queueId: message.queueId,
          originalId: message.record.id,
          error: error.message
        });
      }

      if (this.config.onError) {
        await this.config.onError(error, message.record);
      }
    }
  }

  async completeMessage(queueId, result) {
    await this.queueResource.update(queueId, {
      status: 'completed',
      completedAt: Date.now(),
      result
    });

    // Note: message already in cache from attemptClaim()
  }

  async failMessage(queueId, error) {
    await this.queueResource.update(queueId, {
      status: 'failed',
      error
    });
  }

  async retryMessage(queueId, attempts, error) {
    // Exponential backoff: 2^attempts * 1000ms, max 30 seconds
    const backoff = Math.min(Math.pow(2, attempts) * 1000, 30000);

    await this.queueResource.update(queueId, {
      status: 'pending',
      visibleAt: Date.now() + backoff,
      error
    });

    // Remove from cache so it can be retried
    this.processedCache.delete(queueId);
  }

  async moveToDeadLetter(queueId, record, error) {
    // Save to dead letter queue if configured
    if (this.config.deadLetterResource && this.deadLetterResourceObj) {
      const msg = await this.queueResource.get(queueId);

      await this.deadLetterResourceObj.insert({
        id: idGenerator(),
        originalId: record.id,
        queueId: queueId,
        data: record,
        error,
        attempts: msg.attempts,
        createdAt: new Date().toISOString()
      });
    }

    // Mark as dead in queue
    await this.queueResource.update(queueId, {
      status: 'dead',
      error
    });

    // Note: message already in cache from attemptClaim()
  }

  async getStats() {
    const [ok, err, allMessages] = await tryFn(() =>
      this.queueResource.list()
    );

    if (!ok) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] Failed to get stats:', err.message);
      }
      return null;
    }

    const stats = {
      total: allMessages.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0
    };

    for (const msg of allMessages) {
      if (stats[msg.status] !== undefined) {
        stats[msg.status]++;
      }
    }

    return stats;
  }

  async createDeadLetterResource() {
    if (!this.config.deadLetterResource) return;

    const resourceName = this.config.deadLetterResource;
    const [ok, err] = await tryFn(() =>
      this.database.createResource({
        name: resourceName,
        attributes: {
          id: 'string|required',
          originalId: 'string|required',
          queueId: 'string|required',
          data: 'json|required',
          error: 'string|required',
          attempts: 'number|required',
          createdAt: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true
      })
    );

    if (ok) {
      this.deadLetterResourceObj = this.database.resources[resourceName];
    } else {
      this.deadLetterResourceObj = this.database.resources[resourceName];
      if (!this.deadLetterResourceObj) {
        throw err;
      }
    }

    this.deadLetterResourceName = this.deadLetterResourceObj.name;
    if (this.config.verbose) {
      console.log(`[S3QueuePlugin] Dead letter queue ready: ${this.deadLetterResourceName}`);
    }
  }
}
