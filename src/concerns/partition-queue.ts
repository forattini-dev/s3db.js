import { EventEmitter } from 'events';
import { PartitionDriverError } from '../errors.js';
import tryFn from './try-fn.js';

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

export class PartitionQueue extends EventEmitter {
  maxRetries: number;
  retryDelay: number;
  persistence: QueuePersistence | null;
  queue: QueueItem[];
  processing: boolean;
  failures: QueueItem[];

  constructor(options: PartitionQueueOptions = {}) {
    super();
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.persistence = options.persistence || null;
    this.queue = [];
    this.processing = false;
    this.failures = [];
  }

  async enqueue(operation: PartitionOperation): Promise<string> {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random()}`,
      operation,
      retries: 0,
      createdAt: new Date(),
      status: 'pending'
    };

    this.queue.push(item);

    if (this.persistence) {
      await this.persistence.save(item);
    }

    if (!this.processing) {
      setImmediate(() => this.process());
    }

    return item.id;
  }

  async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      const [ok, error] = await tryFn(async () => {
        await this.executeOperation(item);
        item.status = 'completed';
        this.emit('success', item);

        if (this.persistence) {
          await this.persistence.remove(item.id);
        }
      });

      if (!ok) {
        item.retries++;
        item.lastError = error as Error;

        if (item.retries < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, item.retries - 1);
          item.status = 'retrying';

          setTimeout(() => {
            this.queue.push(item);
            if (!this.processing) this.process();
          }, delay);

          this.emit('retry', { item, error, delay });
        } else {
          item.status = 'failed';
          this.failures.push(item);
          this.emit('failure', { item, error });

          if (this.persistence) {
            await this.persistence.moveToDLQ(item);
          }
        }
      }
    }

    this.processing = false;
  }

  async executeOperation(item: QueueItem): Promise<void> {
    const { type, resource, data } = item.operation;

    switch (type) {
      case 'create':
        return await resource.createPartitionReferences(data);
      case 'update':
        return await resource.handlePartitionReferenceUpdates(
          (data as { original: Record<string, unknown>; updated: Record<string, unknown> }).original,
          (data as { original: Record<string, unknown>; updated: Record<string, unknown> }).updated
        );
      case 'delete':
        return await resource.deletePartitionReferences(data);
      default:
        throw new PartitionDriverError(`Unknown partition operation type: ${type}`, {
          driver: 'PartitionQueue',
          operation: type,
          availableOperations: ['create', 'update', 'delete'],
          suggestion: 'Use one of the supported partition operations: create, update, or delete'
        });
    }
  }

  async recover(): Promise<void> {
    if (!this.persistence) return;

    const items = await this.persistence.getPending();
    this.queue.push(...items);

    if (this.queue.length > 0) {
      this.emit('recovered', { count: this.queue.length });
      setImmediate(() => this.process());
    }
  }

  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      failures: this.failures.length,
      processing: this.processing,
      failureRate: this.failures.length / (this.queue.length + this.failures.length) || 0
    };
  }
}

export class InMemoryPersistence implements QueuePersistence {
  private items: Map<string, QueueItem>;
  private dlq: Map<string, QueueItem>;

  constructor() {
    this.items = new Map();
    this.dlq = new Map();
  }

  async save(item: QueueItem): Promise<void> {
    this.items.set(item.id, item);
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }

  async moveToDLQ(item: QueueItem): Promise<void> {
    this.items.delete(item.id);
    this.dlq.set(item.id, item);
  }

  async getPending(): Promise<QueueItem[]> {
    return Array.from(this.items.values());
  }

  async getDLQ(): Promise<QueueItem[]> {
    return Array.from(this.dlq.values());
  }
}
