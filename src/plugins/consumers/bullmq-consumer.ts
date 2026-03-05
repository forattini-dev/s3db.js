import tryFn from "../../concerns/try-fn.js";
import requirePluginDependency from "../concerns/plugin-dependencies.js";

interface BullMqJob {
  id: string;
  name: string;
  data: unknown;
  opts: Record<string, unknown>;
  attemptsMade: number;
  timestamp: number;
}

interface ParsedMessage {
  $body: unknown;
  $raw: {
    id: string;
    name: string;
    data: unknown;
    opts: Record<string, unknown>;
    attemptsMade: number;
    timestamp: number;
  };
}

type MessageHandler = (parsed: ParsedMessage) => Promise<void>;
type ErrorHandler = (error: Error, message?: unknown) => void;

interface BullMqConsumerOptions {
  queue: string;
  connection?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  concurrency?: number;
  lockDuration?: number;
  stalledInterval?: number;
  maxStalledCount?: number;
  limiter?: { max: number; duration: number };
  removeOnComplete?: boolean | { count?: number; age?: number };
  removeOnFail?: boolean | { count?: number; age?: number };
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  driver?: string;
  workerOptions?: Record<string, unknown>;
}

interface BullMqWorker {
  close(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface BullMqQueue {
  add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<{ id: string }>;
  close(): Promise<void>;
}

type WorkerConstructor = new (
  name: string,
  processor: (job: BullMqJob) => Promise<void>,
  options: Record<string, unknown>
) => BullMqWorker;

type QueueConstructor = new (
  name: string,
  options: Record<string, unknown>
) => BullMqQueue;

export class BullMqConsumer {
  driver: string;
  queue: string;
  concurrency: number;
  lockDuration: number;
  stalledInterval: number;
  maxStalledCount: number;
  limiter?: { max: number; duration: number };
  removeOnComplete: boolean | { count?: number; age?: number };
  removeOnFail: boolean | { count?: number; age?: number };
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  worker: BullMqWorker | null = null;
  private _queue: BullMqQueue | null = null;
  private _QueueConstructor: QueueConstructor | null = null;
  private _connection: { host: string; port: number; password?: string; db: number };
  private _workerOptions: Record<string, unknown>;

  constructor({
    queue,
    connection = {},
    concurrency = 1,
    lockDuration = 30000,
    stalledInterval = 30000,
    maxStalledCount = 1,
    limiter,
    removeOnComplete = true,
    removeOnFail = false,
    onMessage,
    onError,
    driver = 'bullmq',
    workerOptions = {}
  }: BullMqConsumerOptions) {
    this.driver = driver;
    this.queue = queue;
    this.concurrency = concurrency;
    this.lockDuration = lockDuration;
    this.stalledInterval = stalledInterval;
    this.maxStalledCount = maxStalledCount;
    this.limiter = limiter;
    this.removeOnComplete = removeOnComplete;
    this.removeOnFail = removeOnFail;
    this.onMessage = onMessage;
    this.onError = onError;
    this._connection = {
      host: connection.host || 'localhost',
      port: connection.port || 6379,
      password: connection.password,
      db: connection.db ?? 0
    };
    this._workerOptions = workerOptions;
  }

  async start(): Promise<void> {
    await requirePluginDependency('bullmq-consumer');

    // @ts-ignore - bullmq is an optional peer dependency
    const [ok, err, mod] = await tryFn(() => import('bullmq'));
    if (!ok) {
      throw new Error(`BullMqConsumer requires bullmq: ${(err as Error).message}`);
    }

    const { Worker, Queue } = mod as unknown as { Worker: WorkerConstructor; Queue: QueueConstructor };
    this._QueueConstructor = Queue;

    const processor = async (job: BullMqJob): Promise<void> => {
      await this.onMessage({
        $body: job.data,
        $raw: {
          id: job.id,
          name: job.name,
          data: job.data,
          opts: job.opts,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp
        }
      });
    };

    const options: Record<string, unknown> = {
      connection: this._connection,
      concurrency: this.concurrency,
      lockDuration: this.lockDuration,
      stalledInterval: this.stalledInterval,
      maxStalledCount: this.maxStalledCount,
      removeOnComplete: this.removeOnComplete,
      removeOnFail: this.removeOnFail,
      ...this._workerOptions
    };

    if (this.limiter) {
      options.limiter = this.limiter;
    }

    this.worker = new Worker(this.queue, processor, options);

    this.worker.on('failed', (job: unknown, error: unknown) => {
      if (this.onError) {
        this.onError(
          error instanceof Error ? error : new Error(String(error)),
          job
        );
      }
    });

    this.worker.on('error', (error: unknown) => {
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async publish(data: unknown, options: { name?: string; jobOptions?: Record<string, unknown> } = {}): Promise<string> {
    if (!this._QueueConstructor) {
      throw new Error('BullMqConsumer not started. Call start() before publishing.');
    }

    if (!this._queue) {
      this._queue = new this._QueueConstructor(this.queue, { connection: this._connection });
    }

    const jobName = options.name || 'default';
    const result = await this._queue.add(jobName, data, options.jobOptions);
    return result.id;
  }

  async stop(): Promise<void> {
    if (this._queue) {
      await this._queue.close();
      this._queue = null;
    }
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}
