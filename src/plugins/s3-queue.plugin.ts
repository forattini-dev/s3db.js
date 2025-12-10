import { CoordinatorPlugin, CoordinatorConfig } from "./concerns/coordinator-plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { resolveResourceName } from "./concerns/resource-names.js";
import { QueueError } from "./queue.errors.js";
import { getCronManager } from "../concerns/cron-manager.js";
import { createLogger, type LogLevel } from '../concerns/logger.js';

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Database {
  createResource(config: ResourceConfig): Promise<Resource>;
  resources: Record<string, Resource>;
}

interface Resource {
  name: string;
  get(id: string): Promise<QueueEntry>;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  query(filter: Record<string, unknown>, options?: QueryOptions): Promise<QueueEntry[]>;
  count(filter?: Record<string, unknown>): Promise<number>;
  updateConditional(id: string, data: Record<string, unknown>, options: { ifMatch: string }): Promise<{ success: boolean; data?: QueueEntry; etag?: string; error?: string }>;
  enqueue?: (data: Record<string, unknown>, options?: EnqueueOptions) => Promise<Record<string, unknown>>;
  queueStats?: () => Promise<QueueStats>;
  startProcessing?: (handler: MessageHandler, options?: ProcessingOptions) => Promise<void>;
  stopProcessing?: () => Promise<void>;
  extendQueueVisibility?: (queueId: string, extraMilliseconds: number, options?: { lockToken?: string }) => Promise<boolean>;
  renewQueueLock?: (queueId: string, lockToken: string, extraMilliseconds: number) => Promise<boolean>;
  clearQueueCache?: () => void;
}

interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  behavior?: string;
  timestamps?: boolean;
  asyncPartitions?: boolean;
  partitions?: Record<string, PartitionConfig>;
}

interface PartitionConfig {
  fields: Record<string, string>;
}

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface QueueEntry {
  id: string;
  originalId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  visibleAt: number;
  claimedBy?: string | null;
  claimedAt?: number | null;
  lockToken?: string | null;
  attempts: number;
  maxAttempts: number;
  queuedAt: number;
  error?: string | null;
  result?: unknown;
  createdAt: string;
  completedAt?: number | null;
  _etag?: string;
  _queuedAt?: number;
}

interface EnqueueOptions {
  maxAttempts?: number;
}

interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
}

interface ProcessingOptions {
  concurrency?: number;
}

interface MessageContext {
  queueId: string;
  attempts: number;
  workerId: string;
  lockToken: string;
  visibleUntil: number;
  renewLock: (extraMilliseconds?: number) => Promise<boolean>;
}

type MessageHandler = (record: Record<string, unknown>, context: MessageContext) => Promise<unknown>;

interface ClaimedMessage {
  queueId: string;
  record: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  originalId: string;
  lockToken: string;
  visibleUntil: number;
  etag?: string;
  queuedAt: number;
}

interface PluginStorage {
  get(key: string): Promise<unknown>;
  set(key: string, data: unknown, options?: StorageSetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  listWithPrefix(prefix: string): Promise<TicketData[]>;
  acquireLock(name: string, options: LockOptions): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
  getPluginKey(namespace: string | null, ...parts: string[]): string;
}

interface StorageSetOptions {
  ttl?: number;
  behavior?: string;
}

interface Lock {
  name: string;
  workerId: string;
  acquired: number;
}

interface LockOptions {
  ttl: number;
  timeout: number;
  workerId: string;
}

interface TicketData {
  ticketId: string;
  messageId: string;
  originalId?: string;
  queuedAt?: number;
  orderIndex: number;
  publishedAt: number;
  publishedBy: string;
  status: 'available' | 'claimed' | 'processed';
  claimedBy: string | null;
  claimedAt: number | null;
  ticketTTL?: number;
  _ttl?: number;
}

interface FailureStrategy {
  mode: 'retry' | 'dead-letter' | 'hybrid';
  maxRetries: number;
  deadLetterQueue: string | null;
}

interface Worker {
  id: string;
  lastHeartbeat: number;
  workerId: string;
}

export interface S3QueuePluginOptions extends CoordinatorConfig {
  resource: string;
  resourceNames?: { queue?: string; deadLetter?: string };
  visibilityTimeout?: number;
  pollInterval?: number;
  maxAttempts?: number;
  concurrency?: number;
  deadLetterResource?: string | null;
  autoStart?: boolean;
  onMessage?: MessageHandler;
  onError?: (error: Error, record: Record<string, unknown>) => void | Promise<void>;
  onComplete?: (record: Record<string, unknown>, result: unknown) => void | Promise<void>;
  pollBatchSize?: number;
  recoveryInterval?: number;
  recoveryBatchSize?: number;
  processedCacheTTL?: number;
  maxPollInterval?: number;
  queueResource?: string;
  orderingMode?: 'fifo' | 'lifo';
  orderingGuarantee?: boolean;
  orderingLockTTL?: number;
  failureStrategy?: string | { mode?: string; maxRetries?: number; deadLetterQueue?: string };
  lockTTL?: number;
  heartbeatTTL?: number;
  epochDuration?: number;
  ticketBatchSize?: number;
  dispatchInterval?: number;
}

interface S3QueueConfig {
  resource: string;
  visibilityTimeout: number;
  pollInterval: number;
  maxAttempts: number;
  concurrency: number;
  deadLetterResource: string | null;
  autoStart: boolean;
  onMessage?: MessageHandler;
  onError?: (error: Error, record: Record<string, unknown>) => void | Promise<void>;
  onComplete?: (record: Record<string, unknown>, result: unknown) => void | Promise<void>;
  logLevel?: string;
  orderingGuarantee: boolean;
  orderingLockTTL: number;
  orderingMode: 'fifo' | 'lifo';
  failureStrategy: FailureStrategy;
  lockTTL: number;
  ticketBatchSize: number;
  dispatchInterval: number;
  pollBatchSize: number;
  recoveryInterval: number;
  recoveryBatchSize: number;
  processedCacheTTL: number;
  maxPollInterval: number;
  queueResourceName: string;
  enableCoordinator: boolean;
  heartbeatTTL: number;
}

export class S3QueuePlugin extends CoordinatorPlugin<S3QueuePluginOptions> {
  declare namespace: string;
  declare logLevel: string;
  declare workerId: string;
  declare isCoordinator: boolean;
  declare currentLeaderId: string | null;

  config: S3QueueConfig;

  _queueResourceDescriptor: { defaultName: string; override?: string };
  queueResourceName: string;
  _deadLetterDescriptor: { defaultName: string; override?: string } | null = null;
  deadLetterResourceName: string | null = null;
  queueResourceAlias: string;
  deadLetterResourceAlias: string | null;

  queueResource: Resource | null = null;
  targetResource: Resource | null = null;
  deadLetterResourceObj: Resource | null = null;
  workers: Promise<void>[] = [];
  isRunning = false;

  processedCache: Map<string, number> = new Map();
  cacheCleanupJobName: string | null = null;
  messageLocks: Map<string, Lock> = new Map();
  _lastRecovery = 0;
  _recoveryInFlight = false;
  _bestEffortNotified = false;

  dispatchHandle: ReturnType<typeof setInterval> | null = null;

  constructor(options: S3QueuePluginOptions) {
    super({
      ...options,
      coordinatorWorkInterval: options.dispatchInterval || 100
    } as S3QueuePluginOptions);

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = (this.logLevel || 'info') as LogLevel;
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
      enableCoordinator = true,
      heartbeatInterval = 10000,
      heartbeatTTL = 30,
      epochDuration = 300000,
      ticketBatchSize = 10,
      dispatchInterval = 100,
      coldStartDuration = 0,
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

    const initialDeadLetter = deadLetterResource ?? (failureStrategy as { deadLetterQueue?: string })?.deadLetterQueue ?? null;
    const normalizedFailureStrategy = this._normalizeFailureStrategy({
      failureStrategy,
      deadLetterResource: initialDeadLetter,
      maxAttempts
    });
    const normalizedOrderingMode = this._normalizeOrderingMode(orderingMode);

    this._queueResourceDescriptor = {
      defaultName: `plg_s3queue_${resource}_queue`,
      override: resourceNames.queue || queueResource
    };
    this.queueResourceName = this._resolveQueueResourceName();

    if (normalizedFailureStrategy.deadLetterQueue || initialDeadLetter) {
      this._deadLetterDescriptor = {
        defaultName: `plg_s3queue_${resource}_dead`,
        override: resourceNames.deadLetter || normalizedFailureStrategy.deadLetterQueue || initialDeadLetter || undefined
      };
    }

    this.deadLetterResourceName = this._resolveDeadLetterResourceName();

    this.config = {
      ...rest,
      resource,
      visibilityTimeout,
      pollInterval,
      maxAttempts: normalizedFailureStrategy.maxRetries ?? maxAttempts,
      concurrency,
      deadLetterResource: this.deadLetterResourceName,
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
      ticketBatchSize: Math.max(1, ticketBatchSize),
      dispatchInterval: Math.max(50, dispatchInterval),
      pollBatchSize: pollBatchSize ?? Math.max(concurrency * 4, 16),
      recoveryInterval,
      recoveryBatchSize: recoveryBatchSize ?? Math.max(concurrency * 2, 10),
      processedCacheTTL,
      maxPollInterval: maxPollInterval ?? pollInterval,
      queueResourceName: this.queueResourceName,
      enableCoordinator,
      heartbeatTTL
    };

    if (this.config.failureStrategy.deadLetterQueue) {
      this.config.failureStrategy.deadLetterQueue = this.deadLetterResourceName;
    }

    this.queueResourceAlias = queueResource || `${resource}_queue`;
    this.deadLetterResourceAlias = deadLetterResource || null;

    this.on('plg:coordinator:elected', (event: unknown) => {
      this.emit('plg:s3-queue:coordinator-elected', event);
    });
    this.on('plg:coordinator:epoch-renewed', (event: unknown) => {
      this.emit('plg:s3-queue:coordinator-epoch-renewed', event);
    });
    this.on('plg:coordinator:cold-start-phase', (event: { phase: string }) => {
      const phase = event.phase === 'preparation' ? 'tickets' : event.phase;
      this.emit('plg:s3-queue:cold-start-phase', { ...event, phase });
    });
    this.on('plg:coordinator:cold-start-complete', (event: unknown) => {
      this.emit('plg:s3-queue:cold-start-complete', event);
    });
  }

  private _resolveQueueResourceName(): string {
    return resolveResourceName('s3queue', this._queueResourceDescriptor, {
      namespace: this.namespace
    });
  }

  private _resolveDeadLetterResourceName(): string | null {
    if (!this._deadLetterDescriptor) return null;
    const { override, defaultName } = this._deadLetterDescriptor;
    if (override) {
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

  override onNamespaceChanged(): void {
    if (!this._queueResourceDescriptor) return;
    this.queueResourceName = this._resolveQueueResourceName();
    this.config.queueResourceName = this.queueResourceName;
    this.deadLetterResourceName = this._resolveDeadLetterResourceName();
    this.config.deadLetterResource = this.deadLetterResourceName;
    if (this.config.failureStrategy.deadLetterQueue) {
      this.config.failureStrategy.deadLetterQueue = this.deadLetterResourceName;
    }
  }

  override async onInstall(): Promise<void> {
    if (!this.database) return;

    this.targetResource = (this.database.resources[this.config.resource] as Resource | undefined) ?? null;
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

    const queueName = this.queueResourceName;
    const [ok, err] = await tryFn(() =>
      this.database!.createResource({
        name: queueName,
        attributes: {
          id: 'string|required',
          originalId: 'string|required',
          status: 'string|required',
          visibleAt: 'number|required',
          claimedBy: 'string|optional',
          claimedAt: 'number|optional',
          lockToken: 'string|optional',
          attempts: 'number|default:0',
          maxAttempts: 'number|default:3',
          queuedAt: 'number|required',
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
      this.queueResource = (this.database.resources[queueName] as Resource | undefined) ?? null;
    } else {
      this.queueResource = (this.database.resources[queueName] as Resource | undefined) ?? null;
      if (!this.queueResource) {
        throw new QueueError(`Failed to create queue resource: ${(err as Error)?.message}`, {
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
    this.queueResourceName = this.queueResource!.name;

    if (this.queueResourceAlias) {
      const existing = this.database.resources[this.queueResourceAlias];
      if (!existing || existing === (this.queueResource as unknown)) {
        (this.database.resources as Record<string, unknown>)[this.queueResourceAlias] = this.queueResource;
      }
    }

    this.addHelperMethods();

    if (this.config.deadLetterResource) {
      await this.createDeadLetterResource();
    }

    this.logger.debug(
      { resource: this.config.resource, queueResource: this.queueResourceName },
      `Setup completed for resource '${this.config.resource}'`
    );
  }

  override async onStart(): Promise<void> {
    if (this.config.autoStart && this.config.onMessage) {
      await this.startProcessing();
    }
  }

  override async onStop(): Promise<void> {
    await this.stopProcessing();
  }

  addHelperMethods(): void {
    const plugin = this;
    const resource = this.targetResource!;

    resource.enqueue = async function(data: Record<string, unknown>, options: EnqueueOptions = {}): Promise<Record<string, unknown>> {
      const recordData = {
        id: (data.id as string) || idGenerator(),
        ...data
      };

      const record = await resource.insert(recordData);

      const now = Date.now();
      const maxAttemptsForMessage = options.maxAttempts ?? plugin._resolveMaxAttempts();

      const queueEntry = {
        id: idGenerator(),
        originalId: record.id as string,
        status: 'pending',
        visibleAt: now,
        attempts: 0,
        maxAttempts: maxAttemptsForMessage,
        queuedAt: now,
        createdAt: new Date(now).toISOString()
      };

      await plugin.queueResource!.insert(queueEntry);

      plugin.emit('plg:s3-queue:message-enqueued', { id: record.id, queueId: queueEntry.id });

      return record;
    };

    resource.queueStats = async function(): Promise<QueueStats> {
      return await plugin.getStats();
    };

    resource.startProcessing = async function(handler: MessageHandler, options: ProcessingOptions = {}): Promise<void> {
      return await plugin.startProcessing(handler, options);
    };

    resource.stopProcessing = async function(): Promise<void> {
      return await plugin.stopProcessing();
    };

    resource.extendQueueVisibility = async function(queueId: string, extraMilliseconds: number, options: { lockToken?: string } = {}): Promise<boolean> {
      return await plugin.extendVisibility(queueId, extraMilliseconds, options);
    };

    resource.renewQueueLock = async function(queueId: string, lockToken: string, extraMilliseconds: number): Promise<boolean> {
      return await plugin.renewLock(queueId, lockToken, extraMilliseconds);
    };

    resource.clearQueueCache = function(): void {
      plugin.clearProcessedCache();
    };
  }

  async _publishTickets(): Promise<number> {
    if (!this.isCoordinator) return 0;

    const storage = this.getStorage() as unknown as PluginStorage;

    const [okQuery, errQuery, pendingMessages] = await tryFn(async () => {
      return await this.queueResource!.query({
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

  override async onBecomeCoordinator(): Promise<void> {
    this.logger.debug(
      { workerId: this.workerId, resource: this.config.resource },
      'Global coordinator elected this worker as leader - publishing initial tickets'
    );

    const count = await this._publishTickets();

    if (count > 0) {
      this.logger.debug(
        { ticketCount: count, workerId: this.workerId },
        `Published ${count} initial ticket(s)`
      );

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

  override async onStopBeingCoordinator(): Promise<void> {
    this.logger.debug(
      { workerId: this.workerId, resource: this.config.resource },
      'Global coordinator demoted this worker from leader'
    );

    this.emit('plg:s3-queue:coordinator-demoted', {
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  override async coordinatorWork(): Promise<void> {
    await this.coordinatorDispatchLoop();
  }

  async startProcessing(handler: MessageHandler | null = null, options: ProcessingOptions = {}): Promise<void> {
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

    const cronManager = getCronManager();
    const jobName = `queue-cache-cleanup-${this.workerId}`;
    await cronManager.scheduleInterval(
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
      jobName
    );
    this.cacheCleanupJobName = jobName;

    this._lastRecovery = 0;

    await this.startCoordination();

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

  async stopProcessing(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.cacheCleanupJobName) {
      const cronManager = getCronManager();
      cronManager.stop(this.cacheCleanupJobName);
      this.cacheCleanupJobName = null;
    }

    if (this.dispatchHandle) {
      clearInterval(this.dispatchHandle);
      this.dispatchHandle = null;

      this.logger.debug({ workerId: this.workerId }, 'Stopped coordinator dispatch loop');
    }

    await this.stopCoordination();

    await Promise.all(this.workers);
    this.workers = [];

    this.processedCache.clear();

    this.logger.debug({ workerId: this.workerId }, 'Stopped all workers');

    this.emit('plg:s3-queue:workers-stopped', { workerId: this.workerId });
  }

  createWorker(handler: MessageHandler, workerIndex: number): Promise<void> {
    return (async () => {
      let idleStreak = 0;
      while (this.isRunning) {
        try {
          const message = await this.claimMessage();

          if (message) {
            idleStreak = 0;
            await this.processMessage(message, handler);
          } else {
            idleStreak = Math.min(idleStreak + 1, 10);
            const delay = this._computeIdleDelay(idleStreak);
            await this._sleep(delay);
          }
        } catch (error) {
          this.logger.warn(
            { workerIndex, error: (error as Error).message, workerId: this.workerId },
            `Worker ${workerIndex} error: ${(error as Error).message}`
          );
          await this._sleep(1000);
        }
      }
    })();
  }

  async claimMessage(): Promise<ClaimedMessage | null> {
    const now = Date.now();

    if (this.config.enableCoordinator) {
      const tickets = await this.getAvailableTickets();
      if (tickets && tickets.length > 0) {
        for (const ticket of tickets) {
          const message = await this.claimFromTicket(ticket);
          if (message) {
            return message;
          }
        }
      }

      let activeCoordinatorId = this.currentLeaderId;
      if (!activeCoordinatorId) {
        activeCoordinatorId = await this.getLeader();
      }
      if (activeCoordinatorId && this.config.orderingGuarantee) {
        await this._sleep(Math.min(this.config.dispatchInterval, 200));

        const retryTickets = await this.getAvailableTickets();
        for (const ticket of retryTickets) {
          const message = await this.claimFromTicket(ticket);
          if (message) {
            return message;
          }
        }

        return null;
      }
    }

    await this.recoverStalledMessages(now);

    const [ok, err, allMessages] = await tryFn(() =>
      this.queueResource!.query({
        status: 'pending'
      }, {
        limit: this.config.pollBatchSize * 2
      })
    );

    if (!ok || !allMessages || allMessages.length === 0) {
      return null;
    }

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

  private _prepareAvailableMessages(messages: QueueEntry[], now: number): QueueEntry[] {
    const prepared: QueueEntry[] = [];
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

  private _ensureQueuedAt(message: QueueEntry): number {
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

  private _sortMessages(messages: QueueEntry[]): QueueEntry[] {
    const mode = this.config.orderingMode;
    const sorted = [...messages];
    const comparator = mode === 'lifo'
      ? (a: QueueEntry, b: QueueEntry) => ((b._queuedAt || 0) - (a._queuedAt || 0)) || a.id.localeCompare(b.id)
      : (a: QueueEntry, b: QueueEntry) => ((a._queuedAt || 0) - (b._queuedAt || 0)) || a.id.localeCompare(b.id);
    sorted.sort(comparator);
    return sorted;
  }

  private async _attemptMessagesInOrder(messages: QueueEntry[]): Promise<ClaimedMessage | null> {
    for (const msg of messages) {
      const claimed = await this.attemptClaim(msg);
      if (claimed) return claimed;
    }
    return null;
  }

  private _generateLockToken(): string {
    return `lt-${idGenerator()}`;
  }

  private _notifyBestEffortOrdering(): void {
    if (this._bestEffortNotified) return;
    this._bestEffortNotified = true;
    this.emit('plg:s3-queue:ordering-best-effort', {
      queue: this.queueResourceName,
      orderingMode: this.config.orderingMode,
      orderingGuarantee: this.config.orderingGuarantee
    });
  }

  private _orderingLockName(): string {
    return `order-${this.queueResourceName}`;
  }

  private async _acquireOrderingLock(): Promise<(() => Promise<void>) | null> {
    const storage = this.getStorage() as unknown as PluginStorage;
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
            { error: (releaseErr as Error)?.message || releaseErr, lockName: lock.name },
            `Failed to release ordering lock: ${(releaseErr as Error)?.message || releaseErr}`
          );
        }
      };
    } catch (error) {
      this.logger.warn(
        { error: (error as Error)?.message || error, lockName: this._orderingLockName() },
        `Ordering lock acquisition failed: ${(error as Error)?.message || error}`
      );
      return null;
    }
  }

  private _lockNameForMessage(messageId: string): string {
    return `msg-${messageId}`;
  }

  async acquireLock(messageId: string): Promise<Lock | null> {
    const storage = this.getStorage() as unknown as PluginStorage;
    const lockName = this._lockNameForMessage(messageId);

    try {
      const lock = await storage.acquireLock(lockName, {
        ttl: this.config.lockTTL,
        timeout: 0,
        workerId: this.workerId
      });

      if (lock) {
        this.messageLocks.set(lock.name, lock);
      }

      return lock;
    } catch (error) {
      this.logger.debug(
        { error: (error as Error).message, messageId, lockName },
        `acquireLock error: ${(error as Error).message}`
      );
      return null;
    }
  }

  async releaseLock(lockOrMessageId: Lock | string): Promise<void> {
    const storage = this.getStorage() as unknown as PluginStorage;
    let lock: Lock | null = null;

    if (lockOrMessageId && typeof lockOrMessageId === 'object') {
      lock = lockOrMessageId;
    } else {
      const lockName = this._lockNameForMessage(lockOrMessageId as string);
      lock = this.messageLocks.get(lockName) || null;
    }

    if (!lock) {
      return;
    }

    try {
      await storage.releaseLock(lock);
    } catch (error) {
      this.logger.debug(
        { error: (error as Error).message, lockName: lock.name },
        `Failed to release lock '${lock.name}': ${(error as Error).message}`
      );
    } finally {
      if (lock?.name) {
        this.messageLocks.delete(lock.name);
      }
    }
  }

  async cleanupStaleLocks(): Promise<void> {
    // TTL automatically expires locks
  }

  async attemptClaim(msg: QueueEntry, options: { enforceOrder?: boolean } = {}): Promise<ClaimedMessage | null> {
    const now = Date.now();
    const { enforceOrder = false } = options;

    const lock = await this.acquireLock(msg.id);

    if (!lock) {
      return null;
    }

    try {
      const alreadyProcessed = await this._isRecentlyProcessed(msg.id);
      if (alreadyProcessed) {
        this.logger.debug(
          { messageId: msg.id, workerId: this.workerId },
          `Message ${msg.id} already processed (in cache)`
        );
        return null;
      }

      await this._markMessageProcessed(msg.id);
    } finally {
      await this.releaseLock(lock);
    }

    const [okGet, errGet, msgWithETag] = await tryFn(() =>
      this.queueResource!.get(msg.id)
    );

    if (!okGet || !msgWithETag) {
      await this._clearProcessedMarker(msg.id);
      this.logger.debug(
        { messageId: msg.id, error: (errGet as Error)?.message },
        `Message ${msg.id} not found or error: ${(errGet as Error)?.message}`
      );
      return null;
    }

    if (msgWithETag.status !== 'pending' || msgWithETag.visibleAt > now) {
      this.processedCache.delete(msg.id);
      this.logger.debug(
        { messageId: msg.id, status: msgWithETag.status, visibleAt: msgWithETag.visibleAt, now },
        `Message ${msg.id} not claimable: status=${msgWithETag.status}, visibleAt=${msgWithETag.visibleAt}, now=${now}`
      );
      return null;
    }

    msgWithETag.queuedAt = this._ensureQueuedAt(msgWithETag);

    if (enforceOrder && msg._queuedAt !== undefined && msgWithETag.queuedAt !== msg._queuedAt) {
      this.processedCache.delete(msg.id);
      return null;
    }

    this.logger.debug(
      { messageId: msg.id, etag: msgWithETag._etag, workerId: this.workerId },
      `Attempting to claim ${msg.id} with ETag: ${msgWithETag._etag}`
    );

    const lockToken = this._generateLockToken();
    const nextVisibleAt = now + this.config.visibilityTimeout;

    const [ok, err, result] = await tryFn(() =>
      this.queueResource!.updateConditional(msgWithETag.id, {
        status: 'processing',
        claimedBy: this.workerId,
        claimedAt: now,
        lockToken,
        visibleAt: nextVisibleAt,
        attempts: msgWithETag.attempts + 1
      }, {
        ifMatch: msgWithETag._etag!
      })
    );

    if (!ok || !result?.success) {
      this.processedCache.delete(msg.id);
      this.logger.debug(
        { messageId: msg.id, error: (err as Error)?.message || result?.error, workerId: this.workerId },
        `Failed to claim ${msg.id}: ${(err as Error)?.message || result?.error}`
      );
      return null;
    }

    this.logger.debug(
      { messageId: msg.id, workerId: this.workerId },
      `Successfully claimed ${msg.id}`
    );

    const [okRecord, errRecord, record] = await tryFn(() =>
      (this.targetResource as unknown as { get(id: string): Promise<Record<string, unknown>> }).get(msgWithETag.originalId)
    );

    if (!okRecord) {
      await this.failMessage({
        queueId: msgWithETag.id,
        lockToken,
        attempts: msgWithETag.attempts + 1,
        maxAttempts: msgWithETag.maxAttempts,
        record: null as unknown as Record<string, unknown>,
        originalId: msgWithETag.originalId,
        visibleUntil: nextVisibleAt,
        queuedAt: msgWithETag.queuedAt
      }, 'Original record not found');
      return null;
    }

    const claimedData = result.data || msgWithETag;

    return {
      queueId: msgWithETag.id,
      record: record as Record<string, unknown>,
      attempts: msgWithETag.attempts + 1,
      maxAttempts: msgWithETag.maxAttempts,
      originalId: (record as Record<string, unknown>).id as string,
      lockToken,
      visibleUntil: nextVisibleAt,
      etag: result.etag || claimedData._etag,
      queuedAt: msgWithETag.queuedAt
    };
  }

  async processMessage(message: ClaimedMessage, handler: MessageHandler): Promise<void> {
    const startTime = Date.now();

    const context: MessageContext = {
      queueId: message.queueId,
      attempts: message.attempts,
      workerId: this.workerId,
      lockToken: message.lockToken,
      visibleUntil: message.visibleUntil,
      renewLock: async (extraMilliseconds?: number) => {
        return await this.renewLock(message.queueId, message.lockToken, extraMilliseconds);
      }
    };

    try {
      const result = await handler(message.record, context);

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
      const finalStatus = await this._handleProcessingFailure(message, error as Error);

      this._emitOutcome(finalStatus, message, {
        error: (error as Error)?.message
      });

      if (this.config.onError) {
        await this.config.onError(error as Error, message.record);
      }
    }
  }

  async completeMessage(message: ClaimedMessage, result: unknown): Promise<void> {
    await this._updateQueueEntryWithLock(message, {
      status: 'completed',
      completedAt: Date.now(),
      result,
      claimedBy: this.workerId,
      claimedAt: Date.now(),
      lockToken: null,
      error: null
    });
  }

  async failMessage(message: ClaimedMessage, error: string): Promise<void> {
    await this._updateQueueEntryWithLock(message, {
      status: 'failed',
      error,
      claimedBy: null,
      claimedAt: Date.now(),
      lockToken: null
    }, { clearProcessedMarker: true });
  }

  async retryMessage(message: ClaimedMessage, attempts: number, error: string): Promise<void> {
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

  async moveToDeadLetter(message: ClaimedMessage, error: string): Promise<void> {
    if (this.config.deadLetterResource && this.deadLetterResourceObj) {
      const msg = await this.queueResource!.get(message.queueId);

      const dataPayload = message.record ?? { id: message.originalId, _missing: true };

      await this.deadLetterResourceObj.insert({
        id: idGenerator(),
        originalId: message.originalId ?? (dataPayload as Record<string, unknown>).id,
        queueId: message.queueId,
        data: dataPayload,
        error,
        attempts: msg?.attempts ?? message.attempts,
        createdAt: new Date().toISOString()
      });
    }

    await this._updateQueueEntryWithLock(message, {
      status: 'dead',
      error,
      claimedBy: null,
      claimedAt: Date.now(),
      lockToken: null
    }, { clearProcessedMarker: true });
  }

  async getStats(): Promise<QueueStats> {
    const statusKeys: Array<'pending' | 'processing' | 'completed' | 'failed' | 'dead'> = ['pending', 'processing', 'completed', 'failed', 'dead'];
    const stats: QueueStats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0
    };

    const counts = await Promise.all(
      statusKeys.map(status => tryFn(() => this.queueResource!.count({ status })))
    );

    let derivedTotal = 0;

    counts.forEach(([ok, err, count], index) => {
      const status = statusKeys[index]!;
      if (ok) {
        stats[status] = (count as number) || 0;
        derivedTotal += (count as number) || 0;
      } else {
        this.logger.warn(
          { status, error: (err as Error)?.message },
          `Failed to count status '${status}': ${(err as Error)?.message}`
        );
      }
    });

    const [totalOk, totalErr, totalCount] = await tryFn(() => this.queueResource!.count());
    if (totalOk) {
      stats.total = (totalCount as number) || 0;
    } else {
      stats.total = derivedTotal;
      this.logger.warn(
        { error: (totalErr as Error)?.message },
        `Failed to count total messages: ${(totalErr as Error)?.message}`
      );
    }

    return stats;
  }

  async createDeadLetterResource(): Promise<void> {
    if (!this.config.deadLetterResource || !this.database) return;

    const resourceName = this.config.deadLetterResource;
    const [ok, err] = await tryFn(() =>
      this.database!.createResource({
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
      this.deadLetterResourceObj = (this.database.resources[resourceName] as Resource | undefined) ?? null;
    } else {
      this.deadLetterResourceObj = (this.database.resources[resourceName] as Resource | undefined) ?? null;
      if (!this.deadLetterResourceObj) {
        throw err;
      }
    }

    this.deadLetterResourceName = this.deadLetterResourceObj!.name;
    if (this.config.failureStrategy.deadLetterQueue) {
      this.config.failureStrategy.deadLetterQueue = this.deadLetterResourceName;
    }

    if (this.deadLetterResourceAlias) {
      const existing = this.database.resources[this.deadLetterResourceAlias];
      if (!existing || existing === (this.deadLetterResourceObj as unknown)) {
        (this.database.resources as Record<string, unknown>)[this.deadLetterResourceAlias] = this.deadLetterResourceObj;
      }
    }

    this.logger.debug(
      { resourceName: this.deadLetterResourceName },
      `Dead letter queue ready: ${this.deadLetterResourceName}`
    );
  }

  async extendVisibility(queueId: string, extraMilliseconds: number, { lockToken }: { lockToken?: string } = {}): Promise<boolean> {
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

    const [okGet, errGet, entry] = await tryFn(() => this.queueResource!.get(queueId));
    if (!okGet || !entry) {
      this.logger.warn(
        { queueId, error: (errGet as Error)?.message },
        `extendVisibility failed to load entry: ${(errGet as Error)?.message}`
      );
      return false;
    }

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
      this.queueResource!.updateConditional(queueId, {
        visibleAt: newVisibleAt,
        claimedAt: entry.claimedAt || Date.now()
      }, {
        ifMatch: entry._etag!
      })
    );

    if (!okUpdate || !result?.success) {
      this.logger.warn(
        { queueId, error: (errUpdate as Error)?.message || result?.error },
        `extendVisibility conditional update failed: ${(errUpdate as Error)?.message || result?.error}`
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

  async renewLock(queueId: string, lockToken: string, extraMilliseconds?: number): Promise<boolean> {
    if (extraMilliseconds === undefined || extraMilliseconds === null) {
      extraMilliseconds = this.config.visibilityTimeout;
    }
    return await this.extendVisibility(queueId, extraMilliseconds, { lockToken });
  }

  async recoverStalledMessages(now: number): Promise<void> {
    if (this.config.recoveryInterval <= 0) return;
    if (this._recoveryInFlight) return;
    if (this._lastRecovery && now - this._lastRecovery < this.config.recoveryInterval) {
      return;
    }

    this._recoveryInFlight = true;
    this._lastRecovery = now;

    try {
      const [ok, err, allCandidates] = await tryFn(() =>
        this.queueResource!.query({
          status: 'processing'
        }, {
          limit: this.config.recoveryBatchSize * 2
        })
      );

      if (!ok) {
        this.logger.warn(
          { error: (err as Error)?.message },
          `Failed to query stalled messages: ${(err as Error)?.message}`
        );
        return;
      }

      if (!allCandidates || allCandidates.length === 0) {
        return;
      }

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

  private async _recoverSingleMessage(candidate: QueueEntry, now: number): Promise<void> {
    const [okGet, errGet, queueEntry] = await tryFn(() => this.queueResource!.get(candidate.id));
    if (!okGet || !queueEntry) {
      this.logger.warn(
        { messageId: candidate.id, error: (errGet as Error)?.message },
        `Failed to load stalled message: ${(errGet as Error)?.message}`
      );
      return;
    }

    if (queueEntry.status !== 'processing' || queueEntry.visibleAt > now) {
      return;
    }

    if (queueEntry.maxAttempts !== undefined && queueEntry.attempts >= queueEntry.maxAttempts) {
      let record: Record<string, unknown> | null = null;
      const [okRecord, , original] = await tryFn(() => (this.targetResource as unknown as { get(id: string): Promise<Record<string, unknown>> }).get(queueEntry.originalId));
      if (okRecord && original) {
        record = original;
      } else {
        record = { id: queueEntry.originalId, _missing: true };
      }

      const recoveredMessage: ClaimedMessage = {
        queueId: queueEntry.id,
        originalId: queueEntry.originalId,
        record: record!,
        attempts: queueEntry.attempts,
        maxAttempts: queueEntry.maxAttempts,
        lockToken: queueEntry.lockToken || '',
        visibleUntil: queueEntry.visibleAt,
        queuedAt: queueEntry.queuedAt
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
      this.queueResource!.updateConditional(queueEntry.id, {
        status: 'pending',
        visibleAt: now,
        claimedBy: null,
        claimedAt: null,
        lockToken: null,
        error: 'Recovered after visibility timeout'
      }, {
        ifMatch: queueEntry._etag!
      })
    );

    if (!okUpdate || !result?.success) {
      this.logger.warn(
        { queueId: queueEntry.id, error: (errUpdate as Error)?.message || result?.error },
        `Failed to recover message: ${(errUpdate as Error)?.message || result?.error}`
      );
      return;
    }

    await this._clearProcessedMarker(queueEntry.id);
    this.emit('plg:s3-queue:message-recovered', {
      queueId: queueEntry.id,
      originalId: queueEntry.originalId
    });
  }

  private _emitOutcome(finalStatus: string, message: ClaimedMessage, extra: Record<string, unknown> = {}): void {
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

  private async _handleProcessingFailure(message: ClaimedMessage, error: Error): Promise<string> {
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

  private async _updateQueueEntryWithLock(
    message: ClaimedMessage,
    attributes: Record<string, unknown>,
    { clearProcessedMarker = false, requireLock = true } = {}
  ): Promise<{ success: boolean; data?: QueueEntry; etag?: string; error?: string }> {
    const { queueId, lockToken } = message;

    const [okGet, errGet, entry] = await tryFn(() => this.queueResource!.get(queueId));
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
      this.queueResource!.updateConditional(queueId, mergedAttributes, {
        ifMatch: entry._etag!
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

  private _normalizeOrderingMode(orderingMode: string): 'fifo' | 'lifo' {
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
    return candidate as 'fifo' | 'lifo';
  }

  private _normalizeFailureStrategy({
    failureStrategy,
    deadLetterResource,
    maxAttempts
  }: {
    failureStrategy?: string | { mode?: string; maxRetries?: number; deadLetterQueue?: string };
    deadLetterResource: string | null;
    maxAttempts: number;
  }): FailureStrategy {
    const defaultStrategy: FailureStrategy = {
      mode: deadLetterResource ? 'hybrid' : 'retry',
      maxRetries: Math.max(0, maxAttempts ?? 3),
      deadLetterQueue: deadLetterResource || null
    };

    if (!failureStrategy) {
      return defaultStrategy;
    }

    let strategyObj: { mode?: string; maxRetries?: number; deadLetterQueue?: string };
    if (typeof failureStrategy === 'string') {
      strategyObj = { mode: failureStrategy };
    } else {
      strategyObj = failureStrategy;
    }

    const mode = (strategyObj.mode || defaultStrategy.mode || 'retry').toLowerCase();
    const maxRetries = strategyObj.maxRetries ?? defaultStrategy.maxRetries;
    const deadLetterQueue = strategyObj.deadLetterQueue ?? deadLetterResource ?? defaultStrategy.deadLetterQueue;

    if (mode === 'retry') {
      return {
        mode: 'retry',
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
        mode: 'dead-letter',
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
        mode: 'hybrid',
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

  private _resolveMaxAttempts(): number {
    const strategy = this.config?.failureStrategy;
    if (!strategy) {
      return this.config.maxAttempts ?? 3;
    }
    if (strategy.mode === 'dead-letter') {
      return 0;
    }
    return strategy.maxRetries ?? this.config.maxAttempts ?? 3;
  }

  private _computeIdleDelay(idleStreak: number): number {
    const base = this.config.pollInterval;
    const maxInterval = Math.max(base, this.config.maxPollInterval || base);
    if (maxInterval <= base) {
      return base;
    }
    const factor = Math.pow(2, Math.max(0, idleStreak - 1));
    const delay = base * factor;
    return Math.min(delay, maxInterval);
  }

  protected override async _sleep(ms: number): Promise<void> {
    if (!ms || ms <= 0) return;
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  clearProcessedCache(): void {
    this.processedCache.clear();
  }

  private async _markMessageProcessed(messageId: string): Promise<void> {
    const ttl = Math.max(1000, this.config.processedCacheTTL);
    const expiresAt = Date.now() + ttl;
    this.processedCache.set(messageId, expiresAt);

    const storage = this.getStorage() as unknown as PluginStorage;
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
        { messageId, error: (err as Error)?.message },
        `Failed to persist processed marker: ${(err as Error)?.message}`
      );
    }
  }

  private async _isRecentlyProcessed(messageId: string): Promise<boolean> {
    const now = Date.now();
    const localExpiresAt = this.processedCache.get(messageId);
    if (localExpiresAt && localExpiresAt > now) {
      return true;
    }
    if (localExpiresAt && localExpiresAt <= now) {
      this.processedCache.delete(messageId);
    }

    const storage = this.getStorage() as unknown as PluginStorage;
    const key = storage.getPluginKey(null, 'cache', 'processed', messageId);
    const [ok, err, data] = await tryFn(() => storage.get(key));

    if (!ok) {
      if (err && (err as { code?: string }).code !== 'NoSuchKey' && (err as { code?: string }).code !== 'NotFound') {
        this.logger.warn(
          { messageId, error: (err as Error).message || err },
          `Failed to read processed marker: ${(err as Error).message || err}`
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

  private async _clearProcessedMarker(messageId: string): Promise<void> {
    this.processedCache.delete(messageId);

    const storage = this.getStorage() as unknown as PluginStorage;
    const key = storage.getPluginKey(null, 'cache', 'processed', messageId);

    const [ok, err] = await tryFn(() => storage.delete(key));
    if (!ok && err && (err as { code?: string }).code !== 'NoSuchKey' && (err as { code?: string }).code !== 'NotFound') {
      this.logger.warn(
        { messageId, error: (err as Error).message || err },
        `Failed to delete processed marker: ${(err as Error).message || err}`
      );
    }
  }

  async coordinatorDispatchLoop(): Promise<void> {
    if (!this.config.enableCoordinator) return;
    if (!this.isCoordinator) return;

    await this.recoverStalledTickets();

    const now = Date.now();

    const releaseOrderingLock = await this._acquireOrderingLock();
    if (!releaseOrderingLock) {
      return;
    }

    try {
      const existingTickets = await this.getAvailableTickets();
      const availableCapacity = Math.max(this.config.ticketBatchSize - existingTickets.length, 0);

      if (availableCapacity === 0) {
        return;
      }

      const [ok, err, allMessages] = await tryFn(() =>
        this.queueResource!.query({ status: 'pending' }, { limit: availableCapacity * 2 })
      );

      if (!ok || !allMessages) {
        return;
      }

      const messages = allMessages.filter(msg => msg.visibleAt <= now).slice(0, availableCapacity);

      if (messages.length === 0) {
        return;
      }

      const orderedMessages = this._prepareAvailableMessages(messages, now);

      if (orderedMessages.length === 0) {
        return;
      }

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
      await releaseOrderingLock();
    }
  }

  async publishDispatchTickets(orderedMessages: QueueEntry[]): Promise<number> {
    if (!orderedMessages || orderedMessages.length === 0) return 0;

    const storage = this.getStorage() as unknown as PluginStorage;
    const now = Date.now();
    const ticketTTL = Math.max(30, Math.ceil(this.config.visibilityTimeout / 1000) * 2);
    let published = 0;

    for (let i = 0; i < orderedMessages.length; i++) {
      const msg = orderedMessages[i]!;
      const ticketId = `ticket-${msg.id}-${now}-${i}`;
      const key = storage.getPluginKey(null, 'tickets', ticketId);

      const ticketData: TicketData = {
        ticketId,
        messageId: msg.id,
        originalId: msg.originalId,
        queuedAt: msg._queuedAt || msg.queuedAt,
        orderIndex: i,
        publishedAt: now,
        publishedBy: this.workerId,
        status: 'available',
        claimedBy: null,
        claimedAt: null,
        ticketTTL
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
          { ticketId, error: (err as Error)?.message },
          `Failed to publish ticket ${ticketId}: ${(err as Error)?.message}`
        );
      }
    }

    return published;
  }

  async getAvailableTickets(): Promise<TicketData[]> {
    if (!this.config.enableCoordinator) return [];

    const storage = this.getStorage() as unknown as PluginStorage;
    const prefix = 'tickets/';

    const [ok, err, tickets] = await tryFn(() => storage.listWithPrefix(prefix));

    if (!ok) {
      this.logger.warn(
        { error: (err as Error)?.message },
        `Failed to list tickets: ${(err as Error)?.message}`
      );
      return [];
    }

    if (!tickets || tickets.length === 0) {
      return [];
    }

    const available = tickets
      .filter(t => t && t.status === 'available' && !t.claimedBy)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    return available;
  }

  async claimFromTicket(ticket: TicketData): Promise<ClaimedMessage | null> {
    if (!ticket || !ticket.messageId) return null;

    const storage = this.getStorage() as unknown as PluginStorage;
    const now = Date.now();

    const ticketKey = storage.getPluginKey(null, 'tickets', ticket.ticketId);

    const [okGet, errGet, currentTicket] = await tryFn(() => storage.get(ticketKey));

    if (!okGet || !currentTicket) {
      return null;
    }

    const ticketData = currentTicket as TicketData;

    if (ticketData.status !== 'available' || ticketData.claimedBy) {
      return null;
    }

    const [okClaim, errClaim] = await tryFn(() =>
      storage.set(ticketKey, {
        ...ticketData,
        status: 'claimed',
        claimedBy: this.workerId,
        claimedAt: now
      }, {
        ttl: ticketData.ticketTTL || ticketData._ttl || 60,
        behavior: 'body-only'
      })
    );

    if (!okClaim) {
      this.logger.debug(
        { ticketId: ticket.ticketId, error: (errClaim as Error)?.message },
        `Failed to claim ticket ${ticket.ticketId}: ${(errClaim as Error)?.message}`
      );
      return null;
    }

    const [okMsg, errMsg, msg] = await tryFn(() =>
      this.queueResource!.get(ticket.messageId)
    );

    if (!okMsg || !msg) {
      await this.markTicketProcessed(ticket.ticketId);
      return null;
    }

    const claimedMessage = await this.attemptClaim(msg, { enforceOrder: true });

    if (claimedMessage) {
      await this.markTicketProcessed(ticket.ticketId);
      return claimedMessage;
    } else {
      await this.releaseTicket(ticket.ticketId);
      return null;
    }
  }

  async markTicketProcessed(ticketId: string): Promise<void> {
    const storage = this.getStorage() as unknown as PluginStorage;
    const key = storage.getPluginKey(null, 'tickets', ticketId);

    const [ok, err] = await tryFn(() =>
      storage.delete(key)
    );

    if (!ok && err && (err as { code?: string }).code !== 'NoSuchKey' && (err as { code?: string }).code !== 'NotFound') {
      this.logger.warn(
        { ticketId, error: (err as Error)?.message },
        `Failed to delete ticket: ${(err as Error)?.message}`
      );
    }
  }

  async releaseTicket(ticketId: string): Promise<void> {
    const storage = this.getStorage() as unknown as PluginStorage;
    const key = storage.getPluginKey(null, 'tickets', ticketId);

    const [okGet, , ticket] = await tryFn(() => storage.get(key));

    if (!okGet || !ticket) {
      return;
    }

    const ticketData = ticket as TicketData;

    const [okRelease, errRelease] = await tryFn(() =>
      storage.set(key, {
        ...ticketData,
        status: 'available',
        claimedBy: null,
        claimedAt: null
      }, {
        ttl: ticketData.ticketTTL || 60,
        behavior: 'body-only'
      })
    );

    if (!okRelease) {
      this.logger.warn(
        { ticketId, error: (errRelease as Error)?.message },
        `Failed to release ticket: ${(errRelease as Error)?.message}`
      );
    }
  }

  async recoverStalledTickets(): Promise<void> {
    if (!this.config.enableCoordinator) return;
    if (!this.isCoordinator) return;

    const storage = this.getStorage() as unknown as PluginStorage;
    const prefix = 'tickets/';

    const [okTickets, , tickets] = await tryFn(() => storage.listWithPrefix(prefix));

    if (!okTickets || !tickets || tickets.length === 0) {
      return;
    }

    const activeWorkers = (await this.getActiveWorkers()) as Worker[];
    const activeWorkerIds = new Set(activeWorkers.map((w) => w.workerId));

    const now = Date.now();
    const stalledTimeout = this.config.heartbeatTTL * 1000;
    let recovered = 0;

    for (const ticket of tickets) {
      if (!ticket || !ticket.ticketId || ticket.status !== 'claimed' || !ticket.claimedBy) {
        continue;
      }

      if (activeWorkerIds.has(ticket.claimedBy)) {
        const claimAge = now - (ticket.claimedAt || 0);
        if (claimAge < stalledTimeout) {
          continue;
        }
      }

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
