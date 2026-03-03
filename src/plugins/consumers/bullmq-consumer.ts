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

type WorkerConstructor = new (
  name: string,
  processor: (job: BullMqJob) => Promise<void>,
  options: Record<string, unknown>
) => BullMqWorker;

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

    const { Worker } = mod as unknown as { Worker: WorkerConstructor };

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

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}
