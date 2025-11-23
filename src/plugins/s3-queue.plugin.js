import { CoordinatorPlugin } from "./concerns/coordinator-plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { resolveResourceName } from "./concerns/resource-names.js";
import { QueueError } from "./queue.errors.js";
import { getCronManager } from "../concerns/cron-manager.js";
import { createLogger } from '../concerns/logger.js';

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
 * - FIFO/LIFO ordering with strict or best-effort guarantees
 * - Coordinator mode with worker registry, heartbeats, and leader election (opt-in)
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
 *   orderingMode: 'fifo',                  // 'fifo' or 'lifo' (default: 'fifo')
 *   orderingGuarantee: true,               // Strict ordering (default: true)
 *   failureStrategy: 'hybrid',             // 'retry', 'dead-letter', or 'hybrid'
 *
 *   // Coordinator mode (enabled by default for optimal performance)
 *   enableCoordinator: true,               // Enable coordinator mode (default: true)
 *   heartbeatInterval: 10000,              // Heartbeat interval in ms (default: 10000)
 *   heartbeatTTL: 30,                      // Heartbeat TTL in seconds (default: 30)
 *   epochDuration: 300000,                 // Coordinator epoch duration in ms (default: 300000)
 *   ticketBatchSize: 10,                   // Number of tickets to publish per dispatch (default: 10)
 *   dispatchInterval: 100,                 // Dispatch loop interval in ms (default: 100)
 *   coldStartDuration: 0,                  // Cold start observation period in ms (default: 0, disabled)
 *   skipColdStart: false,                  // Skip cold start period (for testing, default: false)
 *
 *   onMessage: async (record, context) => {
 *     // Process message
 *     await sendEmail(record);
 *     return { sent: true };
 *   },
 *
 *   onError: (error, record) => {
 *     this.logger.error('Failed:', error);
 *   },
 *
 *   onComplete: (record, result) => {
 *     this.logger.info('Completed:', result);
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
export class S3QueuePlugin extends CoordinatorPlugin {
  constructor(options = {}) {
    // Pass coordinator options to super()
    super({
      ...options,
      coordinatorWorkInterval: options.dispatchInterval || 100
    });

    // 🪵 Logger initialization (override CoordinatorPlugin logger with queue-specific name)
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.logLevel || 'info';
      this.logger = createLogger({ name: 'S3QueuePlugin', level: logLevel });
    }

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
      // Coordinator mode options (enabled by default for best performance)
      enableCoordinator = true,
      heartbeatInterval = 10000,      // 10 seconds
      heartbeatTTL = 30,              // 30 seconds
      epochDuration = 300000,         // 5 minutes
      ticketBatchSize = 10,
      dispatchInterval = 100,
      coldStartDuration = 0,          // 0 = disabled by default
      skipColdStart = false,
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
      logLevel: this.logLevel,
      orderingGuarantee: Boolean(orderingGuarantee),
      orderingLockTTL: Math.max(250, orderingLockTTL),
      orderingMode: normalizedOrderingMode,
      failureStrategy: normalizedFailureStrategy,
      lockTTL: Math.max(1, lockTTL),
      // Queue-specific coordinator configuration
      ticketBatchSize: Math.max(1, ticketBatchSize),
      dispatchInterval: Math.max(50, dispatchInterval)           // Min 50ms
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

    // Queue-specific resources
    this.queueResource = null;       // Resource: <resource>_queue
    this.targetResource = null;      // Resource original do usuário
    this.deadLetterResourceObj = null;
    this.workers = [];
    this.isRunning = false;

    // Deduplication cache to prevent S3 eventual consistency issues
    // Tracks recently processed messages to avoid reprocessing
    this.processedCache = new Map(); // queueId -> expiresAt
    this.cacheCleanupJobName = null;
    this.messageLocks = new Map();
    this._lastRecovery = 0;
    this._recoveryInFlight = false;
    this._bestEffortNotified = false;

    // Queue-specific coordinator properties
    this.dispatchHandle = null;

    // Re-emit coordinator events with s3-queue prefix for backward compatibility
    this.on('plg:coordinator:elected', (event) => {
      this.emit('plg:s3-queue:coordinator-elected', event);
    });
    this.on('plg:coordinator:promoted', (event) => {
      // Don't re-emit promoted - we emit it manually in onBecomeCoordinator
    });
    this.on('plg:coordinator:demoted', (event) => {
      // Don't re-emit demoted - we emit it manually in onStopBeingCoordinator
    });
    this.on('plg:coordinator:epoch-renewed', (event) => {
      this.emit('plg:s3-queue:coordinator-epoch-renewed', event);
    });
    this.on('plg:coordinator:cold-start-phase', (event) => {
      // Map 'preparation' phase to 'tickets' for S3Queue backward compatibility
      const phase = event.phase === 'preparation' ? 'tickets' : event.phase;
      this.emit('plg:s3-queue:cold-start-phase', { ...event, phase });
    });
    this.on('plg:coordinator:cold-start-complete', (event) => {
      this.emit('plg:s3-queue:cold-start-complete', event);
    });
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

    this.logger.debug(
      { resource: this.config.resource, queueResource: this.queueResourceName },
      `Setup completed for resource '${this.config.resource}'`
    );
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

  /**
   * Schedule interval that works both with CronManager and manual timers
   * Fallback to setInterval when CronManager is disabled (tests)
   *
   * @private
   */

  /**
   * Clear interval handle (cron or manual)
   * @private
   */

  /**
   * Execute cold start observation period
   *
   * Phases:
   * 1. Observing - Publish heartbeat and discover active workers
   * 2. Election - Participate in coordinator election
   * 3. Tickets - Wait for coordinator to publish initial tickets
   * 4. Ready - Cold start complete, ready to process
   *
   * @private
   */

  /**
   * Publish a batch of tickets (coordinator only)
   * @private
   */
  async _publishTickets() {
    if (!this.isCoordinator) return 0;

    const storage = this.getStorage();

    // Get pending messages using partition for O(1) query
    // Uses byStatus partition instead of scanning all messages
    const [okQuery, errQuery, pendingMessages] = await tryFn(async () => {
      return await this.queueResource.query({
        status: 'pending'
      }, {
        limit: this.config.ticketBatchSize
      });
    });

    if (!okQuery || !pendingMessages || pendingMessages.length === 0) {
      return 0;
    }

    let ticketsPublished = 0;

    for (const msg of pendingMessages) {
      const ticketId = `ticket/${msg.id}`;
      const ticketData = {
        messageId: msg.id,
        publishedAt: Date.now(),
        publishedBy: this.workerId,
        ttl: this.config.visibilityTimeout
      };

      const [okPut] = await tryFn(async () => {
        return await storage.set(
          ticketId,
          ticketData,
          {
            ttl: Math.ceil(this.config.visibilityTimeout / 1000),
            behavior: 'body-overflow'
          }
        );
      });

      if (okPut) {
        ticketsPublished++;
      }
    }

    return ticketsPublished;
  }

  // ==================== COORDINATOR HOOKS ====================

  /**
   * Called when this worker becomes coordinator
   * Starts ticket publishing
   */
  async onBecomeCoordinator() {
    this.logger.debug(
      { workerId: this.workerId, resource: this.config.resource },
      'Global coordinator elected this worker as leader - publishing initial tickets'
    );

    // Publish initial batch of tickets
    const count = await this._publishTickets();

    if (count > 0) {
      this.logger.debug(
        { ticketCount: count, workerId: this.workerId },
        `Published ${count} initial ticket(s)`
      );
    }

    // Emit tickets-published event (for backward compatibility with tests)
    if (count > 0) {
      this.emit('plg:s3-queue:tickets-published', {
        coordinatorId: this.workerId,
        count,
        timestamp: Date.now()
      });
    }

    this.emit('plg:s3-queue:coordinator-promoted', {
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  /**
   * Called when this worker stops being coordinator
   * Cleans up coordinator-only resources
   */
  async onStopBeingCoordinator() {
    this.logger.debug(
      { workerId: this.workerId, resource: this.config.resource },
      'Global coordinator demoted this worker from leader'
    );

    this.emit('plg:s3-queue:coordinator-demoted', {
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  /**
   * Periodic work that only coordinator does
   * Publishes dispatch tickets for workers to claim
   */
  async coordinatorWork() {
    await this.coordinatorDispatchLoop();
  }

  // ==================== LIFECYCLE ====================

  async startProcessing(handler = null, options = {}) {
    if (this.isRunning) {
      this.logger.debug({ resource: this.config.resource }, 'Already running');
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

    // Start coordinator system (handles cold start, heartbeat, election, etc.)
    await this.startCoordination();

    // Start N workers
    for (let i = 0; i < concurrency; i++) {
      const worker = this.createWorker(messageHandler, i);
      this.workers.push(worker);
    }

    this.logger.debug(
      { concurrency, workerId: this.workerId, resource: this.config.resource },
      `Started ${concurrency} workers`
    );

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

    // Stop dispatch loop (queue-specific)
    if (this.dispatchHandle) {
      this._clearIntervalHandle(this.dispatchHandle);
      this.dispatchHandle = null;

      this.logger.debug({ workerId: this.workerId }, 'Stopped coordinator dispatch loop');
    }

    // Stop coordinator system (heartbeat, epoch management, etc.)
    await this.stopCoordination();

    // Lock cleanup no longer needed (TTL handles it)

    // Wait for workers to finish current tasks
    await Promise.all(this.workers);
    this.workers = [];

    // Clear deduplication cache
    this.processedCache.clear();

    this.logger.debug({ workerId: this.workerId }, 'Stopped all workers');

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
          this.logger.warn(
            { workerIndex, error: error.message, workerId: this.workerId },
            `Worker ${workerIndex} error: ${error.message}`
          );
          // Wait a bit before retrying on error
          await this._sleep(1000);
        }
      }
    })();
  }

  async claimMessage() {
    const now = Date.now();

    // In coordinator mode, try to claim from dispatch tickets first
    if (this.config.enableCoordinator) {
      const tickets = await this.getAvailableTickets();
      if (tickets && tickets.length > 0) {
        // Try to claim from first available ticket (already ordered)
        for (const ticket of tickets) {
          const message = await this.claimFromTicket(ticket);
          if (message) {
            return message;
          }
        }
        // All tickets failed, fall through to further logic
      }

      let activeCoordinatorId = this.currentCoordinatorId;
      if (!activeCoordinatorId) {
        activeCoordinatorId = await this.getCoordinator();
      }
      if (activeCoordinatorId && this.config.orderingGuarantee) {
        // Give coordinator a moment to publish more tickets
        await this._sleep(Math.min(this.config.dispatchInterval, 200));

        const retryTickets = await this.getAvailableTickets();
        for (const ticket of retryTickets) {
          const message = await this.claimFromTicket(ticket);
          if (message) {
            return message;
          }
        }

        // Coordinator exists but no tickets yet; yield control
        return null;
      }
    }

    await this.recoverStalledMessages(now);

    // Query for available messages using partition query
    // Note: query() doesn't support comparison operators, so we query by status partition
    // and filter by visibleAt manually
    const [ok, err, allMessages] = await tryFn(() =>
      this.queueResource.query({
        status: 'pending'
      }, {
        limit: this.config.pollBatchSize * 2 // Fetch extra to account for filtering
      })
    );

    if (!ok || !allMessages || allMessages.length === 0) {
      return null;
    }

    // Filter by visibleAt manually and limit to pollBatchSize
    const messages = allMessages.filter(msg => msg.visibleAt <= now).slice(0, this.config.pollBatchSize);

    if (messages.length === 0) {
      return null;
    }

    const available = this._prepareAvailableMessages(messages, now);
    if (available.length === 0) {
      return null;
    }

    if (!this.config.orderingGuarantee || !this.config.enableCoordinator) {
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
          this.logger.warn(
            { error: releaseErr?.message || releaseErr, lockName: lock.name },
            `Failed to release ordering lock: ${releaseErr?.message || releaseErr}`
          );
        }
      };
    } catch (error) {
      this.logger.warn(
        { error: error?.message || error, lockName: this._orderingLockName() },
        `Ordering lock acquisition failed: ${error?.message || error}`
      );
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
      this.logger.debug(
        { error: error.message, messageId, lockName },
        `acquireLock error: ${error.message}`
      );
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
      this.logger.debug(
        { error: error.message, lockName: lock.name },
        `Failed to release lock '${lock.name}': ${error.message}`
      );
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
        this.logger.debug(
          { messageId: msg.id, workerId: this.workerId },
          `Message ${msg.id} already processed (in cache)`
        );
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
      this.logger.debug(
        { messageId: msg.id, error: errGet?.message },
        `Message ${msg.id} not found or error: ${errGet?.message}`
      );
      return null;
    }

    // Check if still pending and visible
    if (msgWithETag.status !== 'pending' || msgWithETag.visibleAt > now) {
      // Not claimable - remove from cache so another worker can try later
      this.processedCache.delete(msg.id);
      this.logger.debug(
        { messageId: msg.id, status: msgWithETag.status, visibleAt: msgWithETag.visibleAt, now },
        `Message ${msg.id} not claimable: status=${msgWithETag.status}, visibleAt=${msgWithETag.visibleAt}, now=${now}`
      );
      return null;
    }

    msgWithETag.queuedAt = this._ensureQueuedAt(msgWithETag);

    if (enforceOrder && msg._queuedAt !== undefined && msgWithETag.queuedAt !== msg._queuedAt) {
      // Queue order changed while acquiring lock - release marker and let another pass retry
      this.processedCache.delete(msg.id);
      return null;
    }

    this.logger.debug(
      { messageId: msg.id, etag: msgWithETag._etag, workerId: this.workerId },
      `Attempting to claim ${msg.id} with ETag: ${msgWithETag._etag}`
    );

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
      this.logger.debug(
        { messageId: msg.id, error: err?.message || result.error, workerId: this.workerId },
        `Failed to claim ${msg.id}: ${err?.message || result.error}`
      );
      return null;
    }

    this.logger.debug(
      { messageId: msg.id, workerId: this.workerId },
      `Successfully claimed ${msg.id}`
    );

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
      } else {
        this.logger.warn(
          { status, error: err?.message },
          `Failed to count status '${status}': ${err?.message}`
        );
      }
    });

    const [totalOk, totalErr, totalCount] = await tryFn(() => this.queueResource.count());
    if (totalOk) {
      stats.total = totalCount || 0;
    } else {
      stats.total = derivedTotal;
      this.logger.warn(
        { error: totalErr?.message },
        `Failed to count total messages: ${totalErr?.message}`
      );
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

    this.logger.debug(
      { resourceName: this.deadLetterResourceName },
      `Dead letter queue ready: ${this.deadLetterResourceName}`
    );
  }

  async extendVisibility(queueId, extraMilliseconds, { lockToken } = {}) {
    if (!queueId || !extraMilliseconds || extraMilliseconds <= 0) {
      return false;
    }

    if (!lockToken) {
      this.logger.warn(
        { queueId },
        'extendVisibility requires a lockToken to renew visibility'
      );
      return false;
    }

    const [okGet, errGet, entry] = await tryFn(() => this.queueResource.get(queueId));
    if (!okGet || !entry) {
      this.logger.warn(
        { queueId, error: errGet?.message },
        `extendVisibility failed to load entry: ${errGet?.message}`
      );
      return false;
    }

    // OpenSpec Requirement 7: Prevent renewal after release
    // Check if lock has been released (terminal states or null lockToken)
    const terminalStates = ['completed', 'failed', 'dead'];
    if (terminalStates.includes(entry.status)) {
      this.logger.warn(
        { queueId, status: entry.status, lockToken },
        `Cannot renew lock: message ${queueId} is in terminal state '${entry.status}'`
      );
      this.emit('plg:s3-queue:lock-renewal-rejected', {
        queueId,
        reason: 'terminal_state',
        status: entry.status,
        lockToken
      });
      return false;
    }

    if (!entry.lockToken) {
      this.logger.warn(
        { queueId, status: entry.status },
        `Cannot renew lock: message ${queueId} has no active lock (lockToken is null)`
      );
      this.emit('plg:s3-queue:lock-renewal-rejected', {
        queueId,
        reason: 'lock_released',
        status: entry.status,
        lockToken
      });
      return false;
    }

    if (entry.lockToken !== lockToken) {
      this.logger.warn(
        { queueId, providedToken: lockToken, currentToken: entry.lockToken },
        `extendVisibility lock token mismatch for queueId: ${queueId}`
      );
      this.emit('plg:s3-queue:lock-renewal-rejected', {
        queueId,
        reason: 'token_mismatch',
        providedToken: lockToken,
        currentToken: entry.lockToken
      });
      return false;
    }

    // Additional check: if status is not 'processing', cannot renew
    if (entry.status !== 'processing') {
      this.logger.warn(
        { queueId, currentStatus: entry.status },
        `Cannot renew lock: message ${queueId} is not in 'processing' state (current: ${entry.status})`
      );
      this.emit('plg:s3-queue:lock-renewal-rejected', {
        queueId,
        reason: 'invalid_state',
        status: entry.status,
        lockToken
      });
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
      this.logger.warn(
        { queueId, error: errUpdate?.message || result?.error },
        `extendVisibility conditional update failed: ${errUpdate?.message || result?.error}`
      );
      return false;
    }

    this.logger.debug(
      { queueId, newVisibleAt, extraMilliseconds },
      `Lock renewed for message ${queueId}: new visibleAt=${newVisibleAt}`
    );

    this.emit('plg:s3-queue:lock-renewed', {
      queueId,
      lockToken,
      newVisibleAt,
      extraMilliseconds
    });

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
      // Query processing messages using partition query
      // Note: query() doesn't support comparison operators, so we query by status partition
      // and filter by visibleAt manually
      const [ok, err, allCandidates] = await tryFn(() =>
        this.queueResource.query({
          status: 'processing'
        }, {
          limit: this.config.recoveryBatchSize * 2 // Fetch extra to account for filtering
        })
      );

      if (!ok) {
        this.logger.warn(
          { error: err?.message },
          `Failed to query stalled messages: ${err?.message}`
        );
        return;
      }

      if (!allCandidates || allCandidates.length === 0) {
        return;
      }

      // Filter by visibleAt manually and limit to recoveryBatchSize
      const candidates = allCandidates.filter(msg => msg.visibleAt <= now).slice(0, this.config.recoveryBatchSize);

      if (candidates.length === 0) {
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
      this.logger.warn(
        { messageId: candidate.id, error: errGet?.message },
        `Failed to load stalled message: ${errGet?.message}`
      );
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
      this.logger.warn(
        { queueId: queueEntry.id, error: errUpdate?.message || result?.error },
        `Failed to recover message: ${errUpdate?.message || result?.error}`
      );
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

    if (!ok) {
      this.logger.warn(
        { messageId, error: err?.message },
        `Failed to persist processed marker: ${err?.message}`
      );
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
      if (err && err.code !== 'NoSuchKey' && err.code !== 'NotFound') {
        this.logger.warn(
          { messageId, error: err.message || err },
          `Failed to read processed marker: ${err.message || err}`
        );
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
    if (!ok && err && err.code !== 'NoSuchKey' && err.code !== 'NotFound') {
      this.logger.warn(
        { messageId, error: err.message || err },
        `Failed to delete processed marker: ${err.message || err}`
      );
    }
  }

  // ============================================
  // COORDINATOR MODE: WORKER REGISTRY & HEARTBEATS
  // ============================================

  /**
   * Publish heartbeat to indicate this worker is active
   * Uses PluginStorage with TTL for automatic cleanup of stale workers
   */

  /**
   * Get all active workers from the registry
   * Workers are automatically filtered by TTL (stale workers removed by PluginStorage)
   */

  /**
   * Elect coordinator using deterministic rule: lexicographically first worker ID
   *
   * OpenSpec Requirement 9: Deterministic Coordinator Election
   * - Single worker elected among active workers
   * - Lexicographic ordering of worker IDs
   * - Epoch-based leadership with configurable duration
   */

  /**
   * Check if this worker is the current coordinator
   */

  /**
   * Get current coordinator from epoch storage
   * If epoch expired, trigger re-election
   */

  /**
   * Ensure a coordinator is elected and epoch is valid
   * Uses distributed lock to prevent race conditions during election
   *
   * Respects existing coordinator's epoch - will not force re-election
   * during valid epoch period unless coordinator disappears.
   */

  /**
   * Renew coordinator epoch if this worker is coordinator and epoch is about to expire
   */

  // ============================================
  // COORDINATOR MODE: DISPATCH LOOP & TICKETS
  // ============================================

  /**
   * Start coordinator dispatch loop
   * This method runs only on the coordinator worker and:
   * 1. Acquires ordering lock
   * 2. Fetches and orders pending messages
   * 3. Publishes dispatch tickets
   * 4. Releases lock promptly to avoid deadlocks
   *
   * OpenSpec Requirement 11: Coordinated Dispatch Loop
   */
  async coordinatorDispatchLoop() {
    if (!this.config.enableCoordinator) return;
    if (!this.isCoordinator) return;

    // Recover stalled tickets from dead workers
    await this.recoverStalledTickets();

    const now = Date.now();

    // Acquire ordering lock (short TTL to prevent deadlocks)
    const releaseOrderingLock = await this._acquireOrderingLock();
    if (!releaseOrderingLock) {
      // Another operation holds the lock, skip this cycle
      return;
    }

    try {
      // Avoid flooding ticket queue: only fetch additional messages if capacity available
      const existingTickets = await this.getAvailableTickets();
      const availableCapacity = Math.max(this.config.ticketBatchSize - existingTickets.length, 0);

      if (availableCapacity === 0) {
        return;
      }

      // Fetch pending messages
      // NOTE: s3db.js query() doesn't support comparison operators, so we list and filter manually
      const [ok, err, allMessages] = await tryFn(() =>
        this.queueResource.query({ status: 'pending' }, { limit: availableCapacity * 2 })
      );

      if (!ok || !allMessages) {
        return;
      }

      // Filter by visibleAt manually
      const messages = allMessages.filter(msg => msg.visibleAt <= now).slice(0, availableCapacity);

      if (messages.length === 0) {
        return;
      }

      // Order messages according to configuration
      const orderedMessages = this._prepareAvailableMessages(messages, now);

      if (orderedMessages.length === 0) {
        return;
      }

      // Publish dispatch tickets (batch limited by ticketBatchSize)
      const ticketCount = await this.publishDispatchTickets(orderedMessages);

      if (ticketCount > 0) {
        this.logger.debug(
          { ticketCount, workerId: this.workerId },
          `Coordinator published ${ticketCount} dispatch tickets`
        );

        this.emit('plg:s3-queue:tickets-published', {
          coordinatorId: this.workerId,
          count: ticketCount,
          timestamp: now
        });
      }

    } finally {
      // Release ordering lock promptly to prevent deadlocks
      await releaseOrderingLock();
    }
  }

  /**
   * Publish dispatch tickets for ordered messages
   * Each ticket contains message metadata and ordering information
   *
   * @param {Array} orderedMessages - Ordered messages to create tickets for
   * @returns {Promise<number>} - Number of tickets published
   */
  async publishDispatchTickets(orderedMessages) {
    if (!orderedMessages || orderedMessages.length === 0) return 0;

    const storage = this.getStorage();
    const now = Date.now();
    const ticketTTL = Math.max(30, Math.ceil(this.config.visibilityTimeout / 1000) * 2); // 2x visibility timeout
    let published = 0;

    for (let i = 0; i < orderedMessages.length; i++) {
      const msg = orderedMessages[i];
      const ticketId = `ticket-${msg.id}-${now}-${i}`;
      const key = storage.getPluginKey(null, 'tickets', ticketId);

      const ticketData = {
        ticketId,
        messageId: msg.id,
        originalId: msg.originalId,
        queuedAt: msg._queuedAt || msg.queuedAt,
        orderIndex: i,
        publishedAt: now,
        publishedBy: this.workerId,
        status: 'available', // available, claimed, processed
        claimedBy: null,
        claimedAt: null,
        ticketTTL  // Preserve TTL for releaseTicket()
      };

      const [ok, err] = await tryFn(() =>
        storage.set(key, ticketData, {
          ttl: ticketTTL,
          behavior: 'body-only'
        })
      );

      if (ok) {
        published++;
      } else {
        this.logger.warn(
          { ticketId, error: err?.message },
          `Failed to publish ticket ${ticketId}: ${err?.message}`
        );
      }
    }

    return published;
  }

  /**
   * Get available dispatch tickets for this worker to claim
   * Returns tickets in order (by orderIndex)
   *
   * @returns {Promise<Array>} - Available tickets
   */
  async getAvailableTickets() {
    if (!this.config.enableCoordinator) return [];

    const storage = this.getStorage();
    // Use relative prefix (without plugin slug, listWithPrefix adds it)
    const prefix = 'tickets/';

    const [ok, err, tickets] = await tryFn(() => storage.listWithPrefix(prefix));

    if (!ok) {
      this.logger.warn(
        { error: err?.message },
        `Failed to list tickets: ${err?.message}`
      );
      return [];
    }

    if (!tickets || tickets.length === 0) {
      return [];
    }

    // Filter available tickets and sort by order index
    const available = tickets
      .filter(t => t && t.status === 'available' && !t.claimedBy)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    return available;
  }

  /**
   * Claim a message via dispatch ticket
   * This ensures ordered processing when coordinator mode is enabled
   *
   * @param {Object} ticket - Dispatch ticket
   * @returns {Promise<Object|null>} - Claimed message or null
   */
  async claimFromTicket(ticket) {
    if (!ticket || !ticket.messageId) return null;

    const storage = this.getStorage();
    const now = Date.now();

    // Try to claim the ticket atomically
    const ticketKey = storage.getPluginKey(null, 'tickets', ticket.ticketId);

    // Fetch ticket with current state
    const [okGet, errGet, currentTicket] = await tryFn(() => storage.get(ticketKey));

    if (!okGet || !currentTicket) {
      // Ticket expired or deleted
      return null;
    }

    if (currentTicket.status !== 'available' || currentTicket.claimedBy) {
      // Already claimed by another worker
      return null;
    }

    // Attempt to claim ticket
    const [okClaim, errClaim] = await tryFn(() =>
      storage.set(ticketKey, {
        ...currentTicket,
        status: 'claimed',
        claimedBy: this.workerId,
        claimedAt: now
      }, {
        ttl: currentTicket.ticketTTL || currentTicket._ttl || 60,
        behavior: 'body-only'
      })
    );

    if (!okClaim) {
      // Failed to claim (race condition)
      this.logger.debug(
        { ticketId: ticket.ticketId, error: errClaim?.message },
        `Failed to claim ticket ${ticket.ticketId}: ${errClaim?.message}`
      );
      return null;
    }

    // Now claim the actual message using standard claim logic
    const [okMsg, errMsg, msg] = await tryFn(() =>
      this.queueResource.get(ticket.messageId)
    );

    if (!okMsg || !msg) {
      // Message not found, mark ticket as processed
      await this.markTicketProcessed(ticket.ticketId);
      return null;
    }

    // Use existing claim logic (with ETag atomicity)
    const claimedMessage = await this.attemptClaim(msg, { enforceOrder: true });

    if (claimedMessage) {
      // Successfully claimed, mark ticket as processed
      await this.markTicketProcessed(ticket.ticketId);
      return claimedMessage;
    } else {
      // Failed to claim message, release ticket
      await this.releaseTicket(ticket.ticketId);
      return null;
    }
  }

  /**
   * Mark a dispatch ticket as processed
   */
  async markTicketProcessed(ticketId) {
    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'tickets', ticketId);

    const [ok, err] = await tryFn(() =>
      storage.delete(key)
    );

    if (!ok && err && err.code !== 'NoSuchKey' && err.code !== 'NotFound') {
      this.logger.warn(
        { ticketId, error: err?.message },
        `Failed to delete ticket: ${err?.message}`
      );
    }
  }

  /**
   * Release a dispatch ticket back to available state
   */
  async releaseTicket(ticketId) {
    const storage = this.getStorage();
    const key = storage.getPluginKey(null, 'tickets', ticketId);

    const [okGet, , ticket] = await tryFn(() => storage.get(key));

    if (!okGet || !ticket) {
      return;
    }

    const [okRelease, errRelease] = await tryFn(() =>
      storage.set(key, {
        ...ticket,
        status: 'available',
        claimedBy: null,
        claimedAt: null
      }, {
        ttl: ticket.ticketTTL || 60, // Use persisted TTL from publishDispatchTickets()
        behavior: 'body-only'
      })
    );

    if (!okRelease) {
      this.logger.warn(
        { ticketId, error: errRelease?.message },
        `Failed to release ticket: ${errRelease?.message}`
      );
    }
  }

  /**
   * Recover stalled tickets from dead workers
   * OpenSpec Requirement 11: Ticket Recovery
   */
  async recoverStalledTickets() {
    if (!this.config.enableCoordinator) return;
    if (!this.isCoordinator) return;

    const storage = this.getStorage();
    // Use relative prefix (without plugin slug, listWithPrefix adds it)
    const prefix = 'tickets/';

    const [okTickets, , tickets] = await tryFn(() => storage.listWithPrefix(prefix));

    if (!okTickets || !tickets || tickets.length === 0) {
      return;
    }

    // Get active workers
    const activeWorkers = await this.getActiveWorkers();
    const activeWorkerIds = new Set(activeWorkers.map(w => w.workerId));

    const now = Date.now();
    const stalledTimeout = this.config.heartbeatTTL * 1000; // Same as heartbeat TTL
    let recovered = 0;

    for (const ticket of tickets) {
      // Validate ticket has required fields (listWithPrefix returns data objects now)
      if (!ticket || !ticket.ticketId || ticket.status !== 'claimed' || !ticket.claimedBy) {
        continue;
      }

      // Check if worker is still active
      if (activeWorkerIds.has(ticket.claimedBy)) {
        // Worker is active, check if ticket is stalled (claimed too long ago)
        const claimAge = now - (ticket.claimedAt || 0);
        if (claimAge < stalledTimeout) {
          continue; // Still valid
        }
      }

      // Worker is dead or ticket is stalled, release it
      await this.releaseTicket(ticket.ticketId);
      recovered++;

      this.logger.debug(
        { ticketId: ticket.ticketId, claimedBy: ticket.claimedBy },
        `Recovered stalled ticket ${ticket.ticketId} from worker ${ticket.claimedBy}`
      );
    }

    if (recovered > 0) {
      this.emit('plg:s3-queue:tickets-recovered', {
        coordinatorId: this.workerId,
        count: recovered,
        timestamp: now
      });
    }
  }
}
