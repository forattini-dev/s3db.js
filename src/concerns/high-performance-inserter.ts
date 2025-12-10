import { tryFn } from './try-fn.js';

export interface InsertStats {
  inserted: number;
  failed: number;
  partitionsPending: number;
  avgInsertTime: number;
}

export interface FullStats extends InsertStats {
  bufferSize: number;
  isProcessing: boolean;
  throughput: number;
}

export interface InsertResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: Error;
}

export interface QueuedItem {
  data: Record<string, unknown>;
  timestamp: number;
  promise: Promise<unknown> | null;
}

export interface PartitionQueueItem {
  operation: string;
  data: Record<string, unknown>;
  partitions: Record<string, unknown>;
}

export interface HighPerformanceInserterOptions {
  batchSize?: number;
  concurrency?: number;
  flushInterval?: number;
  disablePartitions?: boolean;
  useStreamMode?: boolean;
}

export interface BulkInsertResult {
  success: number;
  failed: number;
  errors: Error[];
}

export interface StreamInserterOptions {
  concurrency?: number;
  skipPartitions?: boolean;
  skipHooks?: boolean;
  skipValidation?: boolean;
}

interface ResourceLike {
  config: {
    asyncPartitions?: boolean;
    partitions?: Record<string, unknown>;
  };
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  createPartitionReferences(data: Record<string, unknown>): Promise<void>;
  emit(event: string, data: Record<string, unknown>): void;
  generateId(): string;
  getResourceKey(id: string): string;
  schema: {
    mapper(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  client: {
    config: { bucket: string };
    client: {
      send(command: unknown): Promise<void>;
    };
  };
}

interface PromisePoolResult<R> {
  results: R[];
  errors: Error[];
}

interface PromisePoolClass {
  for<T>(items: T[]): {
    withConcurrency(concurrency: number): {
      process<R>(fn: (item: T) => Promise<R>): Promise<PromisePoolResult<R>>;
    };
  };
}

interface PromisePoolModule {
  PromisePool: PromisePoolClass;
}

let PromisePoolCache: PromisePoolModule | null = null;

async function loadPromisePool(): Promise<PromisePoolModule> {
  if (PromisePoolCache) return PromisePoolCache;

  try {
    const module = await import('@supercharge/promise-pool');
    PromisePoolCache = module as unknown as PromisePoolModule;
    return PromisePoolCache;
  } catch {
    throw new Error(
      'Failed to load @supercharge/promise-pool. Please install it: pnpm add @supercharge/promise-pool'
    );
  }
}

export class HighPerformanceInserter {
  resource: ResourceLike;
  batchSize: number;
  concurrency: number;
  flushInterval: number;
  disablePartitions: boolean;
  useStreamMode: boolean;
  insertBuffer: QueuedItem[];
  partitionBuffer: Map<string, unknown>;
  stats: InsertStats;
  flushTimer: ReturnType<typeof setTimeout> | null;
  isProcessing: boolean;
  partitionQueue: PartitionQueueItem[];
  partitionProcessor: ReturnType<typeof setImmediate> | null;

  constructor(resource: ResourceLike, options: HighPerformanceInserterOptions = {}) {
    this.resource = resource;

    this.batchSize = options.batchSize || 100;
    this.concurrency = options.concurrency || 50;
    this.flushInterval = options.flushInterval || 1000;
    this.disablePartitions = options.disablePartitions || false;
    this.useStreamMode = options.useStreamMode || false;

    this.insertBuffer = [];
    this.partitionBuffer = new Map();
    this.stats = {
      inserted: 0,
      failed: 0,
      partitionsPending: 0,
      avgInsertTime: 0
    };

    this.flushTimer = null;
    this.isProcessing = false;

    this.partitionQueue = [];
    this.partitionProcessor = null;
  }

  async add(data: Record<string, unknown>): Promise<{ queued: boolean; position: number }> {
    this.insertBuffer.push({
      data,
      timestamp: Date.now(),
      promise: null
    });

    if (this.insertBuffer.length >= this.batchSize) {
      setImmediate(() => this.flush());
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }

    return { queued: true, position: this.insertBuffer.length };
  }

  async bulkAdd(items: Record<string, unknown>[]): Promise<{ queued: number }> {
    for (const item of items) {
      await this.add(item);
    }
    return { queued: items.length };
  }

  async flush(): Promise<void> {
    if (this.isProcessing || this.insertBuffer.length === 0) return;

    this.isProcessing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.insertBuffer.splice(0, this.batchSize);
    const startTime = Date.now();

    const [ok] = await tryFn(async () => {
      const { PromisePool } = await loadPromisePool();

      const { results, errors } = await PromisePool
        .for(batch)
        .withConcurrency(this.concurrency)
        .process(async (item) => {
          return await this.performInsert(item);
        });

      const duration = Date.now() - startTime;
      this.stats.inserted += results.filter(r => r.success).length;
      this.stats.failed += errors.length;
      this.stats.avgInsertTime = duration / batch.length;

      if (!this.disablePartitions && this.partitionQueue.length > 0) {
        this.processPartitionsAsync();
      }
    });

    this.isProcessing = false;

    if (this.insertBuffer.length > 0) {
      setImmediate(() => this.flush());
    }
  }

  async performInsert(item: QueuedItem): Promise<InsertResult> {
    const { data } = item;

    const [ok, error, result] = await tryFn<InsertResult>(async () => {
      const originalAsyncPartitions = this.resource.config.asyncPartitions;
      const originalPartitions = this.resource.config.partitions;

      if (this.disablePartitions) {
        this.resource.config.partitions = {};
      }

      const [insertOk, insertErr, insertResult] = await tryFn<Record<string, unknown>>(() => this.resource.insert(data));

      if (!insertOk || !insertResult) {
        throw insertErr ?? new Error('Insert returned no result');
      }

      if (!this.disablePartitions && originalPartitions && Object.keys(originalPartitions).length > 0) {
        this.partitionQueue.push({
          operation: 'create',
          data: insertResult,
          partitions: originalPartitions
        });
        this.stats.partitionsPending++;
      }

      this.resource.config.partitions = originalPartitions;
      this.resource.config.asyncPartitions = originalAsyncPartitions;

      return { success: true as const, data: insertResult };
    });

    if (!ok || !result) {
      return { success: false, error: error as Error };
    }

    return result;
  }

  async processPartitionsAsync(): Promise<void> {
    if (this.partitionProcessor) return;

    this.partitionProcessor = setImmediate(async () => {
      const batch = this.partitionQueue.splice(0, 100);

      if (batch.length === 0) {
        this.partitionProcessor = null;
        return;
      }

      const { PromisePool } = await loadPromisePool();

      await PromisePool
        .for(batch)
        .withConcurrency(10)
        .process(async (item) => {
          const [ok, err] = await tryFn(() => this.resource.createPartitionReferences(item.data));

          if (ok) {
            this.stats.partitionsPending--;
          } else {
            this.resource.emit('partitionIndexError', {
              operation: 'bulk-insert',
              error: err
            });
          }
        });

      if (this.partitionQueue.length > 0) {
        this.processPartitionsAsync();
      } else {
        this.partitionProcessor = null;
      }
    });
  }

  async forceFlush(): Promise<void> {
    while (this.insertBuffer.length > 0 || this.isProcessing) {
      await this.flush();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  getStats(): FullStats {
    return {
      ...this.stats,
      bufferSize: this.insertBuffer.length,
      isProcessing: this.isProcessing,
      throughput: this.stats.avgInsertTime > 0
        ? Math.round(1000 / this.stats.avgInsertTime)
        : 0
    };
  }

  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.insertBuffer = [];
    this.partitionQueue = [];
  }
}

export class StreamInserter {
  resource: ResourceLike;
  concurrency: number;
  skipPartitions: boolean;
  skipHooks: boolean;
  skipValidation: boolean;

  constructor(resource: ResourceLike, options: StreamInserterOptions = {}) {
    this.resource = resource;
    this.concurrency = options.concurrency || 100;
    this.skipPartitions = options.skipPartitions !== false;
    this.skipHooks = options.skipHooks || false;
    this.skipValidation = options.skipValidation || false;
  }

  async fastInsert(data: Record<string, unknown>): Promise<{ id: string; inserted: boolean }> {
    const id = (data.id as string) || this.resource.generateId();
    const key = this.resource.getResourceKey(id);

    const metadata = this.skipValidation
      ? { id, ...data }
      : await this.resource.schema.mapper({ id, ...data });

    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    const command = new PutObjectCommand({
      Bucket: this.resource.client.config.bucket,
      Key: key,
      Metadata: metadata as Record<string, string>,
      Body: ''
    });

    await this.resource.client.client.send(command);

    return { id, inserted: true };
  }

  async bulkInsert(items: Record<string, unknown>[]): Promise<BulkInsertResult> {
    const { PromisePool } = await loadPromisePool();

    const { results, errors } = await PromisePool
      .for(items)
      .withConcurrency(this.concurrency)
      .process(async (item) => {
        return await this.fastInsert(item);
      });

    return {
      success: results.length,
      failed: errors.length,
      errors: errors.slice(0, 10)
    };
  }
}
