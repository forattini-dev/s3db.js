import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";

/**
 * TransactionsPlugin - Distributed Queue System with ETag-based Atomicity
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
 * new TransactionsPlugin({
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
 * await db.resource('emails').enqueue({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'World'
 * });
 *
 * // Start processing (if not auto-started)
 * await db.resource('emails').startProcessing(async (email) => {
 *   await sendEmail(email);
 * }, { concurrency: 10 });
 *
 * // Stop processing
 * await db.resource('emails').stopProcessing();
 *
 * // Get queue statistics
 * const stats = await db.resource('emails').queueStats();
 * // { total: 100, pending: 50, processing: 20, completed: 25, failed: 5, dead: 0 }
 */
export class TransactionsPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    if (!options.resource) {
      throw new Error('TransactionsPlugin requires "resource" option');
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

    this.queueResource = null;       // Resource: <resource>_queue
    this.targetResource = null;      // Resource original do usuário
    this.deadLetterResourceObj = null;
    this.workers = [];
    this.isRunning = false;
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async onSetup() {
    // Get target resource
    this.targetResource = this.database.resources[this.config.resource];
    if (!this.targetResource) {
      throw new Error(`TransactionsPlugin: resource '${this.config.resource}' not found`);
    }

    // Create queue metadata resource
    const queueName = `${this.config.resource}_queue`;
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

    if (!ok && !this.database.resources[queueName]) {
      throw new Error(`Failed to create queue resource: ${err?.message}`);
    }

    this.queueResource = this.database.resources[queueName];

    // Add helper methods to target resource
    this.addHelperMethods();

    // Create dead letter resource if configured
    if (this.config.deadLetterResource) {
      await this.createDeadLetterResource();
    }

    if (this.config.verbose) {
      console.log(`[TransactionsPlugin] Setup completed for resource '${this.config.resource}'`);
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

      plugin.emit('message.enqueued', { id: record.id, queueId: queueEntry.id });

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
        console.log('[TransactionsPlugin] Already running');
      }
      return;
    }

    const messageHandler = handler || this.config.onMessage;
    if (!messageHandler) {
      throw new Error('TransactionsPlugin: onMessage handler required');
    }

    this.isRunning = true;
    const concurrency = options.concurrency || this.config.concurrency;

    // Start N workers
    for (let i = 0; i < concurrency; i++) {
      const worker = this.createWorker(messageHandler, i);
      this.workers.push(worker);
    }

    if (this.config.verbose) {
      console.log(`[TransactionsPlugin] Started ${concurrency} workers`);
    }

    this.emit('workers.started', { concurrency, workerId: this.workerId });
  }

  async stopProcessing() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Wait for workers to finish current tasks
    await Promise.all(this.workers);
    this.workers = [];

    if (this.config.verbose) {
      console.log('[TransactionsPlugin] Stopped all workers');
    }

    this.emit('workers.stopped', { workerId: this.workerId });
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

  async attemptClaim(msg) {
    const now = Date.now();

    // Attempt atomic claim using ETag
    const [ok, err, result] = await tryFn(() =>
      this.queueResource.updateConditional(msg.id, {
        status: 'processing',
        claimedBy: this.workerId,
        claimedAt: now,
        visibleAt: now + this.config.visibilityTimeout,
        attempts: msg.attempts + 1
      }, {
        ifMatch: msg._etag  // ← ATOMIC CLAIM using ETag!
      })
    );

    if (!ok || !result.success) {
      // Race lost - another worker claimed it
      return null;
    }

    // Success! Now load the original record
    const [okRecord, errRecord, record] = await tryFn(() =>
      this.targetResource.get(msg.originalId)
    );

    if (!okRecord) {
      // Original record was deleted? Mark queue entry as failed
      await this.failMessage(msg.id, 'Original record not found');
      return null;
    }

    return {
      queueId: msg.id,
      record,
      attempts: msg.attempts + 1,
      maxAttempts: msg.maxAttempts
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

      this.emit('message.completed', {
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

        this.emit('message.retry', {
          queueId: message.queueId,
          originalId: message.record.id,
          attempts: message.attempts,
          error: error.message
        });
      } else {
        // Max attempts reached - move to dead letter queue
        await this.moveToDeadLetter(message.queueId, message.record, error.message);

        this.emit('message.dead', {
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
  }

  async getStats() {
    const [ok, err, allMessages] = await tryFn(() =>
      this.queueResource.list()
    );

    if (!ok) {
      if (this.config.verbose) {
        console.warn('[TransactionsPlugin] Failed to get stats:', err.message);
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
    const [ok, err] = await tryFn(() =>
      this.database.createResource({
        name: this.config.deadLetterResource,
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

    if (ok || this.database.resources[this.config.deadLetterResource]) {
      this.deadLetterResourceObj = this.database.resources[this.config.deadLetterResource];

      if (this.config.verbose) {
        console.log(`[TransactionsPlugin] Dead letter queue created: ${this.config.deadLetterResource}`);
      }
    }
  }
}

export default TransactionsPlugin;
