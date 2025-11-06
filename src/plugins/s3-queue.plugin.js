import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { resolveResourceName } from "./concerns/resource-names.js";
import { QueueError } from "./queue.errors.js";
import { getCronManager } from "../concerns/cron-manager.js";

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

    const {
      resource,
      resourceNames = {},
      visibilityTimeout = 30000,
      pollInterval = 1000,
      maxAttempts = 3,
      concurrency = 1,
      deadLetterResource = null,
      autoStart = true,
      onMessage,
      onError,
      onComplete,
      pollBatchSize,
      recoveryInterval = 5000,
      recoveryBatchSize,
      processedCacheTTL = 30000,
      maxPollInterval,
      queueResource,
      orderingMode = 'fifo',
      orderingGuarantee = true,
      orderingLockTTL = 1500,
      failureStrategy,
      lockTTL = 5,
      ...rest
    } = this.options;

    if (!resource) {
      throw new QueueError('S3QueuePlugin requires "resource" option', {
        pluginName: 'S3QueuePlugin',
        operation: 'constructor',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide the target resource name: new S3QueuePlugin({ resource: "orders", ... }).'
      });
    }

    const initialDeadLetter = deadLetterResource ?? failureStrategy?.deadLetterQueue ?? null;
    const normalizedFailureStrategy = this._normalizeFailureStrategy({
      failureStrategy,
      deadLetterResource: initialDeadLetter,
      maxAttempts
    });
    const normalizedOrderingMode = this._normalizeOrderingMode(orderingMode);

    this.config = {
      ...rest,
      resource,
      visibilityTimeout,
      pollInterval,
      maxAttempts,
      concurrency,
      deadLetterResource: normalizedFailureStrategy.deadLetterQueue || initialDeadLetter,
      autoStart,
      onMessage,
      onError,
      onComplete,
      verbose: this.verbose,
      orderingGuarantee: Boolean(orderingGuarantee),
      orderingLockTTL: Math.max(250, orderingLockTTL),
      orderingMode: normalizedOrderingMode,
      failureStrategy: normalizedFailureStrategy,
      lockTTL: Math.max(1, lockTTL)
    };
    this.config.maxAttempts = normalizedFailureStrategy.maxRetries ?? maxAttempts;
    this.config.pollBatchSize = pollBatchSize ?? Math.max((this.config.concurrency || 1) * 4, 16);
    this.config.recoveryInterval = recoveryInterval;
    this.config.recoveryBatchSize = recoveryBatchSize ?? Math.max((this.config.concurrency || 1) * 2, 10);
    this.config.processedCacheTTL = processedCacheTTL;
    this.config.maxPollInterval = maxPollInterval ?? this.config.pollInterval;

    this._queueResourceDescriptor = {
      defaultName: `plg_s3queue_${this.config.resource}_queue`,
      override: resourceNames.queue || queueResource
    };
    this.queueResourceName = this._resolveQueueResourceName();
    this.config.queueResourceName = this.queueResourceName;

    if (this.config.deadLetterResource) {
      this._deadLetterDescriptor = {
        defaultName: `plg_s3queue_${this.config.resource}_dead`,
        override: resourceNames.deadLetter || this.config.deadLetterResource
      };
    } else {
      this._deadLetterDescriptor = null;
    }

    this.deadLetterResourceName = this._resolveDeadLetterResourceName();
    this.config.deadLetterResource = this.deadLetterResourceName;
    if (this.config.failureStrategy.deadLetterQueue) {
      this.config.failureStrategy.deadLetterQueue = this.deadLetterResourceName;
    }

    this.queueResourceAlias = queueResource || `${this.config.resource}_queue`;
    this.deadLetterResourceAlias = deadLetterResource || null;

    this.queueResource = null;       // Resource: <resource>_queue
    this.targetResource = null;      // Resource original do usuário
    this.deadLetterResourceObj = null;
    this.workers = [];
    this.isRunning = false;
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Deduplication cache to prevent S3 eventual consistency issues
    // Tracks recently processed messages to avoid reprocessing
    this.processedCache = new Map(); // queueId -> expiresAt
    this.cacheCleanupJobName = null;
    this.messageLocks = new Map();
    this._lastRecovery = 0;
    this._recoveryInFlight = false;
    this._bestEffortNotified = false;
  }

  _resolveQueueResourceName() {
    return resolveResourceName('s3queue', this._queueResourceDescriptor, {
      namespace: this.namespace
    });
  }

  _resolveDeadLetterResourceName() {
    if (!this._deadLetterDescriptor) return null;
    const { override, defaultName } = this._deadLetterDescriptor;
    if (override) {
      // Honor explicit overrides verbatim unless user opted into plg_* naming.
      if (override.startsWith('plg_')) {
        return resolveResourceName('s3queue', { override }, {
          namespace: this.namespace,
          applyNamespaceToOverrides: true
        });
      }
      return override;
    }
    return resolveResourceName('s3queue', { defaultName }, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    if (!this._queueResourceDescriptor) return;
    this.queueResourceName = this._resolveQueueResourceName();
    this.config.queueResourceName = this.queueResourceName;
    this.deadLetterResourceName = this._resolveDeadLetterResourceName();
    this.config.deadLetterResource = this.deadLetterResourceName;
    if (this.config.failureStrategy.deadLetterQueue) {
      this.config.failureStrategy.deadLetterQueue = this.deadLetterResourceName;
    }
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
          lockToken: 'string|optional',       // Token exclusivo do lock
          attempts: 'number|default:0',
          maxAttempts: 'number|default:3',
          queuedAt: 'number|required',        // Timestamp de enfileiramento
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

    if (this.queueResourceAlias) {
      const existing = this.database.resources[this.queueResourceAlias];
      if (!existing || existing === this.queueResource) {
        this.database.resources[this.queueResourceAlias] = this.queueResource;
      }
    }

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

      const now = Date.now();
      const maxAttemptsForMessage = options.maxAttempts ?? plugin._resolveMaxAttempts();

      // Create queue entry
      const queueEntry = {
        id: idGenerator(),
        originalId: record.id,
        status: 'pending',
        visibleAt: now,
        attempts: 0,
        maxAttempts: maxAttemptsForMessage,
        queuedAt: now,
        createdAt: new Date(now).toISOString()
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

    /**
     * Extend visibility timeout for a specific queue entry
     */
    resource.extendQueueVisibility = async function(queueId, extraMilliseconds, options = {}) {
      return await plugin.extendVisibility(queueId, extraMilliseconds, options);
    };

    resource.renewQueueLock = async function(queueId, lockToken, extraMilliseconds) {
      return await plugin.renewLock(queueId, lockToken, extraMilliseconds);
    };

    resource.clearQueueCache = async function() {
      plugin.clearProcessedCache();
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
    const cronManager = getCronManager();
    this.cacheCleanupJobName = cronManager.scheduleInterval(
      5000,
      () => {
        const now = Date.now();
        const ttl = this.config.processedCacheTTL;

        for (const [queueId, expiresAt] of this.processedCache.entries()) {
          if (expiresAt <= now || expiresAt - now > ttl * 4) {
            this.processedCache.delete(queueId);
          }
        }
      },
      `queue-cache-cleanup-${this.workerId}`
    );

    // Lock cleanup no longer needed - TTL handles expiration automatically
    this._lastRecovery = 0;

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
    if (this.cacheCleanupJobName) {
      const cronManager = getCronManager();
      cronManager.stop(this.cacheCleanupJobName);
      this.cacheCleanupJobName = null;
    }

    // Lock cleanup no longer needed (TTL handles it)

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
      let idleStreak = 0;
      while (this.isRunning) {
        try {
          // Try to claim a message
          const message = await this.claimMessage();

          if (message) {
            idleStreak = 0;
            // Process the claimed message
            await this.processMessage(message, handler);
          } else {
            // No messages available, wait before polling again
            idleStreak = Math.min(idleStreak + 1, 10);
            const delay = this._computeIdleDelay(idleStreak);
            await this._sleep(delay);
          }
        } catch (error) {
          if (this.config.verbose) {
            console.error(`[Worker ${workerIndex}] Error:`, error.message);
          }
          // Wait a bit before retrying on error
          await this._sleep(1000);
        }
      }
    })();
  }

  async claimMessage() {
    const now = Date.now();

    await this.recoverStalledMessages(now);

    // Query for available messages
    const [ok, err, messages] = await tryFn(() =>
      this.queueResource.query({
        status: 'pending',
        visibleAt: { '<=': now }
      }, {
        limit: this.config.pollBatchSize
      })
    );

    if (!ok || !messages || messages.length === 0) {
      return null;
    }

    const available = this._prepareAvailableMessages(messages, now);
    if (available.length === 0) {
      return null;
    }

    if (!this.config.orderingGuarantee) {
      this._notifyBestEffortOrdering();
      return await this._attemptMessagesInOrder(available);
    }

    const releaseOrderingLock = await this._acquireOrderingLock();
    if (!releaseOrderingLock) {
      return null;
    }

    try {
      const next = available[0];
      if (!next) return null;
      return await this.attemptClaim(next, { enforceOrder: true });
    } finally {
      await releaseOrderingLock();
    }
  }

  _prepareAvailableMessages(messages, now) {
    const prepared = [];
    for (const message of messages) {
      if (!message || message.visibleAt > now) continue;
      const queuedAt = this._ensureQueuedAt(message);
      prepared.push({
        ...message,
        _queuedAt: queuedAt
      });
    }
    return this._sortMessages(prepared);
  }

  _ensureQueuedAt(message) {
    if (typeof message.queuedAt === 'number' && Number.isFinite(message.queuedAt)) {
      return message.queuedAt;
    }
    if (message.createdAt) {
      const parsed = Date.parse(message.createdAt);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    if (typeof message.visibleAt === 'number') {
      return message.visibleAt;
    }
    return Date.now();
  }

  _sortMessages(messages) {
    const mode = this.config.orderingMode;
    const sorted = [...messages];
    const comparator = mode === 'lifo'
      ? (a, b) => (b._queuedAt - a._queuedAt) || a.id.localeCompare(b.id)
      : (a, b) => (a._queuedAt - b._queuedAt) || a.id.localeCompare(b.id);
    sorted.sort(comparator);
    return sorted;
  }

  async _attemptMessagesInOrder(messages) {
    for (const msg of messages) {
      const claimed = await this.attemptClaim(msg);
      if (claimed) return claimed;
    }
    return null;
  }

  _generateLockToken() {
    return `lt-${idGenerator()}`;
  }

  _notifyBestEffortOrdering() {
    if (this._bestEffortNotified) return;
    this._bestEffortNotified = true;
    this.emit('plg:s3-queue:ordering-best-effort', {
      queue: this.queueResourceName,
      orderingMode: this.config.orderingMode,
      orderingGuarantee: this.config.orderingGuarantee
    });
  }

  _orderingLockName() {
    return `order-${this.queueResourceName}`;
  }

  async _acquireOrderingLock() {
    const storage = this.getStorage();
    try {
      const ttlSeconds = Math.max(1, Math.ceil(this.config.orderingLockTTL / 1000));
      const lock = await storage.acquireLock(this._orderingLockName(), {
        ttl: ttlSeconds,
        timeout: 0,
        workerId: this.workerId
      });

      if (!lock) {
        return null;
      }

      return async () => {
        try {
          await storage.releaseLock(lock);
        } catch (releaseErr) {
          if (this.config.verbose) {
            console.warn('[S3QueuePlugin] Failed to release ordering lock:', releaseErr?.message || releaseErr);
          }
        }
      };
    } catch (error) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] Ordering lock acquisition failed:', error?.message || error);
      }
      return null;
    }
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
        ttl: this.config.lockTTL, // seconds
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

  async attemptClaim(msg, options = {}) {
    const now = Date.now();
    const { enforceOrder = false } = options;

    // Try to acquire distributed lock for cache check
    // This prevents race condition where multiple workers check cache simultaneously
    const lock = await this.acquireLock(msg.id);

    if (!lock) {
      // Another worker is checking/claiming this message, skip it
      return null;
    }

    try {
      // Check deduplication cache (protected by lock)
      const alreadyProcessed = await this._isRecentlyProcessed(msg.id);
      if (alreadyProcessed) {
        if (this.config.verbose) {
          console.log(`[attemptClaim] Message ${msg.id} already processed (in cache)`);
        }
        return null;
      }

      // Add to cache immediately (while still holding lock)
      // This prevents other workers from claiming this message
      await this._markMessageProcessed(msg.id);
    } finally {
      await this.releaseLock(lock);
    }

    // Fetch the message with ETag (query doesn't return _etag)
    const [okGet, errGet, msgWithETag] = await tryFn(() =>
      this.queueResource.get(msg.id)
    );

    if (!okGet || !msgWithETag) {
      // Message was deleted or not found - remove from cache
      await this._clearProcessedMarker(msg.id);
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

    msgWithETag.queuedAt = this._ensureQueuedAt(msgWithETag);

    if (enforceOrder && msg._queuedAt !== undefined && msgWithETag.queuedAt !== msg._queuedAt) {
      // Queue order changed while acquiring lock - release marker and let another pass retry
      this.processedCache.delete(msg.id);
      return null;
    }

    if (this.config.verbose) {
      console.log(`[attemptClaim] Attempting to claim ${msg.id} with ETag: ${msgWithETag._etag}`);
    }

    const lockToken = this._generateLockToken();
    const nextVisibleAt = now + this.config.visibilityTimeout;

    // Attempt atomic claim using ETag
    const [ok, err, result] = await tryFn(() =>
      this.queueResource.updateConditional(msgWithETag.id, {
        status: 'processing',
        claimedBy: this.workerId,
        claimedAt: now,
        lockToken,
        visibleAt: nextVisibleAt,
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
      await this.failMessage({
        queueId: msgWithETag.id,
        lockToken,
        attempts: msgWithETag.attempts + 1,
        maxAttempts: msgWithETag.maxAttempts,
        record: null,
        originalId: msgWithETag.originalId
      }, 'Original record not found');
      return null;
    }

    const claimedData = result.data || msgWithETag;

    return {
      queueId: msgWithETag.id,
      record,
      attempts: msgWithETag.attempts + 1,
      maxAttempts: msgWithETag.maxAttempts,
      originalId: record.id,
      lockToken,
      visibleUntil: nextVisibleAt,
      etag: result.etag || claimedData._etag,
      queuedAt: msgWithETag.queuedAt
    };
  }

  async processMessage(message, handler) {
    const startTime = Date.now();

    const context = {
      queueId: message.queueId,
      attempts: message.attempts,
      workerId: this.workerId,
      lockToken: message.lockToken,
      visibleUntil: message.visibleUntil,
      renewLock: async (extraMilliseconds) => {
        return await this.renewLock(message.queueId, message.lockToken, extraMilliseconds);
      }
    };

    try {
      // Execute user handler
      const result = await handler(message.record, context);

      // Mark as completed
      await this.completeMessage(message, result);

      const duration = Date.now() - startTime;

      const eventPayload = {
        queueId: message.queueId,
        originalId: message.record.id,
        duration,
        attempts: message.attempts,
        finalStatus: 'processed'
      };

      this.emit('plg:s3-queue:message-completed', eventPayload);
      this._emitOutcome('processed', message, { duration });

      if (this.config.onComplete) {
        await this.config.onComplete(message.record, result);
      }

    } catch (error) {
      const finalStatus = await this._handleProcessingFailure(message, error);

      this._emitOutcome(finalStatus, message, {
        error: error?.message
      });

      if (this.config.onError) {
        await this.config.onError(error, message.record);
      }
    }
  }

  async completeMessage(message, result) {
    await this._updateQueueEntryWithLock(message, {
      status: 'completed',
      completedAt: Date.now(),
      result,
      claimedBy: this.workerId,
      claimedAt: Date.now(),
      lockToken: null,
      error: null
    });

    // Note: message already in cache from attemptClaim()
  }

  async failMessage(message, error) {
    await this._updateQueueEntryWithLock(message, {
      status: 'failed',
      error,
      claimedBy: null,
      claimedAt: Date.now(),
      lockToken: null
    }, { clearProcessedMarker: true });
  }

  async retryMessage(message, attempts, error) {
    // Exponential backoff: 2^attempts * 1000ms, max 30 seconds
    const backoff = Math.min(Math.pow(2, attempts) * 1000, 30000);

    await this._updateQueueEntryWithLock(message, {
      status: 'pending',
      visibleAt: Date.now() + backoff,
      claimedBy: null,
      claimedAt: null,
      lockToken: null,
      error
    }, { clearProcessedMarker: true });
  }

  async moveToDeadLetter(message, error) {
    // Save to dead letter queue if configured
    if (this.config.deadLetterResource && this.deadLetterResourceObj) {
      const msg = await this.queueResource.get(message.queueId);

      const dataPayload = message.record ?? { id: message.originalId, _missing: true };

      await this.deadLetterResourceObj.insert({
        id: idGenerator(),
        originalId: message.originalId ?? dataPayload.id,
        queueId: message.queueId,
        data: dataPayload,
        error,
        attempts: msg?.attempts ?? message.attempts,
        createdAt: new Date().toISOString()
      });
    }

    // Mark as dead in queue
    await this._updateQueueEntryWithLock(message, {
      status: 'dead',
      error,
      claimedBy: null,
      claimedAt: Date.now(),
      lockToken: null
    }, { clearProcessedMarker: true });
  }

  async getStats() {
    const statusKeys = ['pending', 'processing', 'completed', 'failed', 'dead'];
    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0
    };

    const counts = await Promise.all(
      statusKeys.map(status => tryFn(() => this.queueResource.count({ status })))
    );

    let derivedTotal = 0;

    counts.forEach(([ok, err, count], index) => {
      const status = statusKeys[index];
      if (ok) {
        stats[status] = count || 0;
        derivedTotal += count || 0;
      } else if (this.config.verbose) {
        console.warn(`[S3QueuePlugin] Failed to count status '${status}':`, err?.message);
      }
    });

    const [totalOk, totalErr, totalCount] = await tryFn(() => this.queueResource.count());
    if (totalOk) {
      stats.total = totalCount || 0;
    } else {
      stats.total = derivedTotal;
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] Failed to count total messages:', totalErr?.message);
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
    if (this.config.failureStrategy.deadLetterQueue) {
      this.config.failureStrategy.deadLetterQueue = this.deadLetterResourceName;
    }

    if (this.deadLetterResourceAlias) {
      const existing = this.database.resources[this.deadLetterResourceAlias];
      if (!existing || existing === this.deadLetterResourceObj) {
        this.database.resources[this.deadLetterResourceAlias] = this.deadLetterResourceObj;
      }
    }

    if (this.config.verbose) {
      console.log(`[S3QueuePlugin] Dead letter queue ready: ${this.deadLetterResourceName}`);
    }
  }

  async extendVisibility(queueId, extraMilliseconds, { lockToken } = {}) {
    if (!queueId || !extraMilliseconds || extraMilliseconds <= 0) {
      return false;
    }

    if (!lockToken) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] extendVisibility requires a lockToken to renew visibility');
      }
      return false;
    }

    const [okGet, errGet, entry] = await tryFn(() => this.queueResource.get(queueId));
    if (!okGet || !entry) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] extendVisibility failed to load entry:', errGet?.message);
      }
      return false;
    }

    if (entry.lockToken !== lockToken) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] extendVisibility lock token mismatch for queueId:', queueId);
      }
      return false;
    }

    const baseTime = Math.max(entry.visibleAt || 0, Date.now());
    const newVisibleAt = baseTime + extraMilliseconds;

    const [okUpdate, errUpdate, result] = await tryFn(() =>
      this.queueResource.updateConditional(queueId, {
        visibleAt: newVisibleAt,
        claimedAt: entry.claimedAt || Date.now()
      }, {
        ifMatch: entry._etag
      })
    );

    if (!okUpdate || !result?.success) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] extendVisibility conditional update failed:', errUpdate?.message || result?.error);
      }
      return false;
    }

    return true;
  }

  async renewLock(queueId, lockToken, extraMilliseconds) {
    if (extraMilliseconds === undefined || extraMilliseconds === null) {
      extraMilliseconds = this.config.visibilityTimeout;
    }
    return await this.extendVisibility(queueId, extraMilliseconds, { lockToken });
  }

  async recoverStalledMessages(now) {
    if (this.config.recoveryInterval <= 0) return;
    if (this._recoveryInFlight) return;
    if (this._lastRecovery && now - this._lastRecovery < this.config.recoveryInterval) {
      return;
    }

    this._recoveryInFlight = true;
    this._lastRecovery = now;

    try {
      const [ok, err, candidates] = await tryFn(() =>
        this.queueResource.query({
          status: 'processing',
          visibleAt: { '<=': now }
        }, {
          limit: this.config.recoveryBatchSize
        })
      );

      if (!ok) {
        if (this.config.verbose) {
          console.warn('[S3QueuePlugin] Failed to query stalled messages:', err?.message);
        }
        return;
      }

      if (!candidates || candidates.length === 0) {
        return;
      }

      for (const candidate of candidates) {
        await this._recoverSingleMessage(candidate, now);
      }
    } finally {
      this._recoveryInFlight = false;
    }
  }

  async _recoverSingleMessage(candidate, now) {
    const [okGet, errGet, queueEntry] = await tryFn(() => this.queueResource.get(candidate.id));
    if (!okGet || !queueEntry) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] Failed to load stalled message:', errGet?.message);
      }
      return;
    }

    if (queueEntry.status !== 'processing' || queueEntry.visibleAt > now) {
      return;
    }

    // If max attempts reached, move to dead letter
    if (queueEntry.maxAttempts !== undefined && queueEntry.attempts >= queueEntry.maxAttempts) {
      let record = null;
      const [okRecord, , original] = await tryFn(() => this.targetResource.get(queueEntry.originalId));
      if (okRecord && original) {
        record = original;
      } else {
        record = { id: queueEntry.originalId, _missing: true };
      }

      const recoveredMessage = {
        queueId: queueEntry.id,
        originalId: queueEntry.originalId,
        record,
        attempts: queueEntry.attempts,
        maxAttempts: queueEntry.maxAttempts,
        lockToken: queueEntry.lockToken
      };

      const timeoutError = 'visibility-timeout exceeded max attempts';

      if (this.config.failureStrategy.mode === 'dead-letter' || this.config.failureStrategy.mode === 'hybrid') {
        await this.moveToDeadLetter(recoveredMessage, timeoutError);
        this.emit('plg:s3-queue:message-dead', {
          queueId: queueEntry.id,
          originalId: queueEntry.originalId,
          error: timeoutError,
          finalStatus: 'dead-lettered'
        });
        this._emitOutcome('dead-lettered', recoveredMessage, { error: timeoutError });
      } else {
        await this.failMessage(recoveredMessage, timeoutError);
        this.emit('plg:s3-queue:message-failed', {
          queueId: queueEntry.id,
          originalId: queueEntry.originalId,
          attempts: queueEntry.attempts,
          error: timeoutError,
          finalStatus: 'failed'
        });
        this._emitOutcome('failed', recoveredMessage, { error: timeoutError });
      }
      return;
    }

    const [okUpdate, errUpdate, result] = await tryFn(() =>
      this.queueResource.updateConditional(queueEntry.id, {
        status: 'pending',
        visibleAt: now,
        claimedBy: null,
        claimedAt: null,
        lockToken: null,
        error: 'Recovered after visibility timeout'
      }, {
        ifMatch: queueEntry._etag
      })
    );

    if (!okUpdate || !result?.success) {
      if (this.config.verbose) {
        console.warn('[S3QueuePlugin] Failed to recover message:', errUpdate?.message || result?.error);
      }
      return;
    }

    await this._clearProcessedMarker(queueEntry.id);
    this.emit('plg:s3-queue:message-recovered', {
      queueId: queueEntry.id,
      originalId: queueEntry.originalId
    });
  }

  _emitOutcome(finalStatus, message, extra = {}) {
    this.emit('plg:s3-queue:message-outcome', {
      queueId: message.queueId,
      originalId: message.record?.id,
      finalStatus,
      attempts: message.attempts,
      maxAttempts: message.maxAttempts,
      orderingMode: this.config.orderingMode,
      orderingGuarantee: this.config.orderingGuarantee,
      ...extra
    });
  }

  async _handleProcessingFailure(message, error) {
    const strategy = this.config.failureStrategy;
    const errorMessage = error?.message || 'Processing failed';
    const attempts = message.attempts;
    const maxAttempts = message.maxAttempts ?? strategy.maxRetries ?? 0;

    if (strategy.mode === 'dead-letter') {
      await this.moveToDeadLetter(message, errorMessage);
      this.emit('plg:s3-queue:message-dead', {
        queueId: message.queueId,
        originalId: message.record?.id,
        error: errorMessage,
        finalStatus: 'dead-lettered'
      });
      return 'dead-lettered';
    }

    if (attempts < maxAttempts) {
      await this.retryMessage(message, attempts, errorMessage);
      this.emit('plg:s3-queue:message-retry', {
        queueId: message.queueId,
        originalId: message.record?.id,
        attempts,
        error: errorMessage,
        finalStatus: 'retrying'
      });
      return 'retrying';
    }

    if (strategy.mode === 'hybrid' && strategy.deadLetterQueue) {
      await this.moveToDeadLetter(message, errorMessage);
      this.emit('plg:s3-queue:message-dead', {
        queueId: message.queueId,
        originalId: message.record?.id,
        error: errorMessage,
        finalStatus: 'dead-lettered'
      });
      return 'dead-lettered';
    }

    await this.failMessage(message, errorMessage);
    this.emit('plg:s3-queue:message-failed', {
      queueId: message.queueId,
      originalId: message.record?.id,
      attempts,
      error: errorMessage,
      finalStatus: 'failed'
    });
    return 'failed';
  }

  async _updateQueueEntryWithLock(message, attributes, { clearProcessedMarker = false, requireLock = true } = {}) {
    const { queueId, lockToken } = message;

    const [okGet, errGet, entry] = await tryFn(() => this.queueResource.get(queueId));
    if (!okGet || !entry) {
      throw new QueueError(`Queue entry '${queueId}' not found during lock-protected update`, {
        pluginName: 'S3QueuePlugin',
        operation: 'updateWithLock',
        queueId,
        statusCode: 404,
        retriable: false,
        original: errGet
      });
    }

    if (requireLock && entry.lockToken !== lockToken) {
      throw new QueueError('Lock token mismatch', {
        pluginName: 'S3QueuePlugin',
        operation: 'updateWithLock',
        queueId,
        statusCode: 409,
        retriable: false,
        suggestion: 'Ensure renewLock/finish is called with the token returned by attemptClaim().'
      });
    }

    const mergedAttributes = {
      ...attributes,
      lockToken: attributes.lockToken ?? null
    };

    const [okUpdate, errUpdate, result] = await tryFn(() =>
      this.queueResource.updateConditional(queueId, mergedAttributes, {
        ifMatch: entry._etag
      })
    );

    if (!okUpdate || !result?.success) {
      throw new QueueError('Failed to update queue entry with lock', {
        pluginName: 'S3QueuePlugin',
        operation: 'updateWithLock',
        queueId,
        statusCode: 409,
        retriable: true,
        suggestion: 'Re-fetch the entry and retry. The message may have been recovered or reassigned.',
        original: errUpdate || result?.error
      });
    }

    if (clearProcessedMarker) {
      await this._clearProcessedMarker(queueId);
    }

    return result;
  }

  _normalizeOrderingMode(orderingMode) {
    const candidate = (orderingMode || 'fifo').toString().toLowerCase();
    if (candidate !== 'fifo' && candidate !== 'lifo') {
      throw new QueueError(`Invalid orderingMode '${orderingMode}'`, {
        pluginName: 'S3QueuePlugin',
        operation: 'normalizeOrderingMode',
        statusCode: 400,
        retriable: false,
        suggestion: "Use 'fifo' (default) or 'lifo'."
      });
    }
    return candidate;
  }

  _normalizeFailureStrategy({ failureStrategy, deadLetterResource, maxAttempts }) {
    const defaultStrategy = {
      mode: deadLetterResource ? 'hybrid' : 'retry',
      maxRetries: Math.max(0, maxAttempts ?? 3),
      deadLetterQueue: deadLetterResource || null
    };

    if (!failureStrategy) {
      return defaultStrategy;
    }

    if (typeof failureStrategy === 'string') {
      failureStrategy = { mode: failureStrategy };
    }

    const mode = (failureStrategy.mode || defaultStrategy.mode || 'retry').toLowerCase();
    const maxRetries = failureStrategy.maxRetries ?? defaultStrategy.maxRetries;
    const deadLetterQueue = failureStrategy.deadLetterQueue ?? deadLetterResource ?? defaultStrategy.deadLetterQueue;

    if (mode === 'retry') {
      return {
        mode,
        maxRetries: Math.max(0, maxRetries ?? 3),
        deadLetterQueue: null
      };
    }

    if (mode === 'dead-letter') {
      if (!deadLetterQueue) {
        throw new QueueError('dead-letter mode requires a deadLetterQueue/deadLetterResource', {
          pluginName: 'S3QueuePlugin',
          operation: 'normalizeFailureStrategy',
          statusCode: 400,
          retriable: false,
          suggestion: 'Provide deadLetterResource or failureStrategy.deadLetterQueue.'
        });
      }
      return {
        mode,
        maxRetries: 0,
        deadLetterQueue
      };
    }

    if (mode === 'hybrid') {
      if (!deadLetterQueue) {
        throw new QueueError('hybrid failure strategy requires a dead-letter queue', {
          pluginName: 'S3QueuePlugin',
          operation: 'normalizeFailureStrategy',
          statusCode: 400,
          retriable: false,
          suggestion: 'Set deadLetterResource or failureStrategy.deadLetterQueue.'
        });
      }
      return {
        mode,
        maxRetries: Math.max(0, maxRetries ?? 3),
        deadLetterQueue
      };
    }

    throw new QueueError(`Unknown failure strategy mode '${mode}'`, {
      pluginName: 'S3QueuePlugin',
      operation: 'normalizeFailureStrategy',
      statusCode: 400,
      retriable: false,
      suggestion: "Supported modes: 'retry', 'dead-letter', 'hybrid'."
    });
  }

  _resolveMaxAttempts() {
    const strategy = this.config?.failureStrategy;
    if (!strategy) {
      return this.config.maxAttempts ?? 3;
    }
    if (strategy.mode === 'dead-letter') {
      return 0;
    }
    return strategy.maxRetries ?? this.config.maxAttempts ?? 3;
  }

  _computeIdleDelay(idleStreak) {
    const base = this.config.pollInterval;
    const maxInterval = Math.max(base, this.config.maxPollInterval || base);
    if (maxInterval <= base) {
      return base;
    }
    const factor = Math.pow(2, Math.max(0, idleStreak - 1));
    const delay = base * factor;
    return Math.min(delay, maxInterval);
  }

  async _sleep(ms) {
    if (!ms || ms <= 0) return;
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  clearProcessedCache() {
    this.processedCache.clear();
  }

  async _markMessageProcessed(messageId) {
    const ttl = Math.max(1000, this.config.processedCacheTTL);
    const expiresAt = Date.now() + ttl;
    this.processedCache.set(messageId, expiresAt);

    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'cache', 'processed', messageId);
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));

    const payload = {
      workerId: this.workerId,
      markedAt: Date.now()
    };

    const [ok, err] = await tryFn(() =>
      storage.set(key, payload, {
        ttl: ttlSeconds,
        behavior: 'body-only'
      })
    );

    if (!ok && this.config.verbose) {
      console.warn('[S3QueuePlugin] Failed to persist processed marker:', err?.message);
    }
  }

  async _isRecentlyProcessed(messageId) {
    const now = Date.now();
    const localExpiresAt = this.processedCache.get(messageId);
    if (localExpiresAt && localExpiresAt > now) {
      return true;
    }
    if (localExpiresAt && localExpiresAt <= now) {
      this.processedCache.delete(messageId);
    }

    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'cache', 'processed', messageId);
    const [ok, err, data] = await tryFn(() => storage.get(key));

    if (!ok) {
      if (err && err.code !== 'NoSuchKey' && err.code !== 'NotFound' && this.config.verbose) {
        console.warn('[S3QueuePlugin] Failed to read processed marker:', err.message || err);
      }
      return false;
    }

    if (!data) {
      return false;
    }

    const ttl = Math.max(1000, this.config.processedCacheTTL);
    this.processedCache.set(messageId, now + ttl);
    return true;
  }

  async _clearProcessedMarker(messageId) {
    this.processedCache.delete(messageId);

    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'cache', 'processed', messageId);

    const [ok, err] = await tryFn(() => storage.delete(key));
    if (!ok && err && err.code !== 'NoSuchKey' && err.code !== 'NotFound' && this.config.verbose) {
      console.warn('[S3QueuePlugin] Failed to delete processed marker:', err.message || err);
    }
  }
}
