import { CoordinatorPlugin, CoordinatorConfig } from "./concerns/coordinator-plugin.class.js";
interface Resource {
    name: string;
    get(id: string): Promise<QueueEntry>;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    query(filter: Record<string, unknown>, options?: QueryOptions): Promise<QueueEntry[]>;
    count(filter?: Record<string, unknown>): Promise<number>;
    updateConditional(id: string, data: Record<string, unknown>, options: {
        ifMatch: string;
    }): Promise<{
        success: boolean;
        data?: QueueEntry;
        etag?: string;
        error?: string;
    }>;
    enqueue?: (data: Record<string, unknown>, options?: EnqueueOptions) => Promise<Record<string, unknown>>;
    queueStats?: () => Promise<QueueStats>;
    startProcessing?: (handler: MessageHandler, options?: ProcessingOptions) => Promise<void>;
    stopProcessing?: () => Promise<void>;
    extendQueueVisibility?: (queueId: string, extraMilliseconds: number, options?: {
        lockToken?: string;
    }) => Promise<boolean>;
    renewQueueLock?: (queueId: string, lockToken: string, extraMilliseconds: number) => Promise<boolean>;
    clearQueueCache?: () => void;
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
interface Lock {
    name: string;
    workerId: string;
    acquired: number;
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
export interface S3QueuePluginOptions extends CoordinatorConfig {
    resource: string;
    resourceNames?: {
        queue?: string;
        deadLetter?: string;
    };
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
    failureStrategy?: string | {
        mode?: string;
        maxRetries?: number;
        deadLetterQueue?: string;
    };
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
export declare class S3QueuePlugin extends CoordinatorPlugin<S3QueuePluginOptions> {
    namespace: string;
    logLevel: string;
    workerId: string;
    isCoordinator: boolean;
    currentLeaderId: string | null;
    config: S3QueueConfig;
    _queueResourceDescriptor: {
        defaultName: string;
        override?: string;
    };
    queueResourceName: string;
    _deadLetterDescriptor: {
        defaultName: string;
        override?: string;
    } | null;
    deadLetterResourceName: string | null;
    queueResourceAlias: string;
    deadLetterResourceAlias: string | null;
    queueResource: Resource | null;
    targetResource: Resource | null;
    deadLetterResourceObj: Resource | null;
    workers: Promise<void>[];
    isRunning: boolean;
    processedCache: Map<string, number>;
    cacheCleanupJobName: string | null;
    messageLocks: Map<string, Lock>;
    _lastRecovery: number;
    _recoveryInFlight: boolean;
    _bestEffortNotified: boolean;
    dispatchHandle: ReturnType<typeof setInterval> | null;
    constructor(options: S3QueuePluginOptions);
    private _resolveQueueResourceName;
    private _resolveDeadLetterResourceName;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    addHelperMethods(): void;
    _publishTickets(): Promise<number>;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    startProcessing(handler?: MessageHandler | null, options?: ProcessingOptions): Promise<void>;
    stopProcessing(): Promise<void>;
    createWorker(handler: MessageHandler, workerIndex: number): Promise<void>;
    claimMessage(): Promise<ClaimedMessage | null>;
    private _prepareAvailableMessages;
    private _ensureQueuedAt;
    private _sortMessages;
    private _attemptMessagesInOrder;
    private _generateLockToken;
    private _notifyBestEffortOrdering;
    private _orderingLockName;
    private _acquireOrderingLock;
    private _lockNameForMessage;
    acquireLock(messageId: string): Promise<Lock | null>;
    releaseLock(lockOrMessageId: Lock | string): Promise<void>;
    cleanupStaleLocks(): Promise<void>;
    attemptClaim(msg: QueueEntry, options?: {
        enforceOrder?: boolean;
    }): Promise<ClaimedMessage | null>;
    processMessage(message: ClaimedMessage, handler: MessageHandler): Promise<void>;
    completeMessage(message: ClaimedMessage, result: unknown): Promise<void>;
    failMessage(message: ClaimedMessage, error: string): Promise<void>;
    retryMessage(message: ClaimedMessage, attempts: number, error: string): Promise<void>;
    moveToDeadLetter(message: ClaimedMessage, error: string): Promise<void>;
    getStats(): Promise<QueueStats>;
    createDeadLetterResource(): Promise<void>;
    extendVisibility(queueId: string, extraMilliseconds: number, { lockToken }?: {
        lockToken?: string;
    }): Promise<boolean>;
    renewLock(queueId: string, lockToken: string, extraMilliseconds?: number): Promise<boolean>;
    recoverStalledMessages(now: number): Promise<void>;
    private _recoverSingleMessage;
    private _emitOutcome;
    private _handleProcessingFailure;
    private _updateQueueEntryWithLock;
    private _normalizeOrderingMode;
    private _normalizeFailureStrategy;
    private _resolveMaxAttempts;
    private _computeIdleDelay;
    protected _sleep(ms: number): Promise<void>;
    clearProcessedCache(): void;
    private _markMessageProcessed;
    private _isRecentlyProcessed;
    private _clearProcessedMarker;
    coordinatorDispatchLoop(): Promise<void>;
    publishDispatchTickets(orderedMessages: QueueEntry[]): Promise<number>;
    getAvailableTickets(): Promise<TicketData[]>;
    claimFromTicket(ticket: TicketData): Promise<ClaimedMessage | null>;
    markTicketProcessed(ticketId: string): Promise<void>;
    releaseTicket(ticketId: string): Promise<void>;
    recoverStalledTickets(): Promise<void>;
}
export {};
//# sourceMappingURL=s3-queue.plugin.d.ts.map