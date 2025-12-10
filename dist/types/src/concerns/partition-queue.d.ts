import { EventEmitter } from 'events';
export type PartitionOperationType = 'create' | 'update' | 'delete';
export type QueueItemStatus = 'pending' | 'retrying' | 'completed' | 'failed';
export interface PartitionOperation {
    type: PartitionOperationType;
    resource: PartitionResource;
    data: Record<string, unknown>;
}
export interface QueueItem {
    id: string;
    operation: PartitionOperation;
    retries: number;
    createdAt: Date;
    status: QueueItemStatus;
    lastError?: Error;
}
export interface PartitionResource {
    createPartitionReferences(data: Record<string, unknown>): Promise<void>;
    handlePartitionReferenceUpdates(original: Record<string, unknown>, updated: Record<string, unknown>): Promise<void>;
    deletePartitionReferences(data: Record<string, unknown>): Promise<void>;
}
export interface QueuePersistence {
    save(item: QueueItem): Promise<void>;
    remove(id: string): Promise<void>;
    moveToDLQ(item: QueueItem): Promise<void>;
    getPending(): Promise<QueueItem[]>;
    getDLQ?(): Promise<QueueItem[]>;
}
export interface PartitionQueueOptions {
    maxRetries?: number;
    retryDelay?: number;
    persistence?: QueuePersistence | null;
}
export interface QueueStats {
    pending: number;
    failures: number;
    processing: boolean;
    failureRate: number;
}
export declare class PartitionQueue extends EventEmitter {
    maxRetries: number;
    retryDelay: number;
    persistence: QueuePersistence | null;
    queue: QueueItem[];
    processing: boolean;
    failures: QueueItem[];
    constructor(options?: PartitionQueueOptions);
    enqueue(operation: PartitionOperation): Promise<string>;
    process(): Promise<void>;
    executeOperation(item: QueueItem): Promise<void>;
    recover(): Promise<void>;
    getStats(): QueueStats;
}
export declare class InMemoryPersistence implements QueuePersistence {
    private items;
    private dlq;
    constructor();
    save(item: QueueItem): Promise<void>;
    remove(id: string): Promise<void>;
    moveToDLQ(item: QueueItem): Promise<void>;
    getPending(): Promise<QueueItem[]>;
    getDLQ(): Promise<QueueItem[]>;
}
//# sourceMappingURL=partition-queue.d.ts.map