import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import path from 'path';
import type { ThreadingConfig } from '../database/types.js';
import type { Logger } from '../concerns/logger.js';

type TaskBridge = {
  execute<TPayload = unknown, TResult = unknown>(
    type: string,
    payload: TPayload
  ): { id: string; result: Promise<BackgroundTaskResult<TResult>>; cancel: (reason?: string) => void; subscribe: (listener: (event: any) => void) => () => void };
  submit<TPayload = unknown, TResult = unknown>(
    request: { type: string; payload: TPayload }
  ): { id: string; result: Promise<BackgroundTaskResult<TResult>>; cancel: (reason?: string) => void; subscribe: (listener: (event: any) => void) => () => void };
  destroy: () => Promise<void>;
};

type BackgroundTaskResult<T = unknown> =
  | { status: 'resolved'; taskId: string; value: T }
  | { status: 'rejected'; taskId: string; error: { name: string; message: string; stack?: string; code?: string } }
  | { status: 'cancelled'; taskId: string; reason?: string };

export type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan' | 'dotProduct';

export interface CompressionTaskOptions {
  level?: number;
  threshold?: number;
  encoding?: 'base64' | 'base85';
}

export class ThreadPool {
  private _bridge: TaskBridge | null = null;
  private _mode: 'worker' | 'inline' | 'disabled';
  private _config: ThreadingConfig;
  private _logger: Logger | null;
  private _initPromise: Promise<void> | null = null;

  constructor(config: ThreadingConfig, logger?: Logger) {
    this._config = config;
    this._logger = logger ?? null;
    this._mode = this._resolveMode(config.enabled);
  }

  private _resolveMode(enabled?: boolean | 'auto'): 'worker' | 'inline' | 'disabled' {
    const cores = cpus().length;

    if (enabled === false || enabled === undefined) return 'disabled';

    if (enabled === true) {
      return cores <= 1 ? 'inline' : 'worker';
    }

    // 'auto': worker if 3+ cores, inline if 2, disabled if 1
    if (cores > 2) return 'worker';
    if (cores > 1) return 'inline';
    return 'disabled';
  }

  private _resolvePoolSize(poolSize?: number | 'auto'): number {
    if (typeof poolSize === 'number') return Math.max(1, Math.floor(poolSize));

    // 'auto' or undefined: max(1, cpus - 1)
    return Math.max(1, cpus().length - 1);
  }

  get mode(): 'worker' | 'inline' | 'disabled' {
    return this._mode;
  }

  get enabled(): boolean {
    return this._mode !== 'disabled';
  }

  private async _ensureInitialized(): Promise<TaskBridge> {
    if (this._bridge) return this._bridge;

    if (!this._initPromise) {
      this._initPromise = this._initialize();
    }
    await this._initPromise;

    if (!this._bridge) {
      throw new Error('ThreadPool is disabled or failed to initialize');
    }
    return this._bridge;
  }

  private async _initialize(): Promise<void> {
    if (this._mode === 'disabled') return;

    try {
      const tuiuiu = await import('tuiuiu.js/utils');
      const { createTaskBridgePool, createInlineBackgroundExecutor, createTaskBridge } = tuiuiu;

      let workerThreadsAvailable = false;
      try {
        await import('node:worker_threads');
        workerThreadsAvailable = true;
      } catch {
        // worker_threads not available
      }

      const handlersPath = this._resolveHandlersPath();
      const canUseWorkers = workerThreadsAvailable
        && this._mode === 'worker'
        && !handlersPath.endsWith('.ts');

      if (canUseWorkers) {
        const poolSize = this._resolvePoolSize(this._config.poolSize);
        const scheduler = this._config.scheduler ?? 'least-pending';

        this._bridge = createTaskBridgePool({
          modulePath: handlersPath,
          poolSize,
          scheduler,
          workerName: 's3db-thread-pool',
        }) as TaskBridge;

        this._logger?.debug({ poolSize, scheduler, mode: 'worker' }, 'thread pool initialized with workers');
      } else {
        // Fallback to inline mode
        const { backgroundTaskHandlers } = await import('./worker-handlers.js');
        this._bridge = createTaskBridge(
          createInlineBackgroundExecutor(backgroundTaskHandlers as any)
        ) as TaskBridge;
        this._mode = 'inline';

        this._logger?.debug({ mode: 'inline' }, 'thread pool initialized in inline mode');
      }
    } catch (err) {
      this._logger?.warn({ err }, 'failed to initialize thread pool, falling back to inline');
      try {
        const tuiuiu = await import('tuiuiu.js/utils');
        const { backgroundTaskHandlers } = await import('./worker-handlers.js');
        this._bridge = tuiuiu.createTaskBridge(
          tuiuiu.createInlineBackgroundExecutor(backgroundTaskHandlers as any)
        ) as TaskBridge;
        this._mode = 'inline';
      } catch {
        this._mode = 'disabled';
      }
    }
  }

  private _resolveHandlersPath(): string {
    const thisFile = fileURLToPath(import.meta.url);
    const dir = path.dirname(thisFile);

    // In production (compiled), worker-handlers.js exists alongside this file.
    // In dev/test (tsx/vitest), the source is .ts and import.meta.url points to .ts.
    // Try .js first (production), fall back to .ts (dev).
    const jsPath = path.resolve(dir, 'worker-handlers.js');
    const tsPath = path.resolve(dir, 'worker-handlers.ts');

    try {
      const esmRequire = createRequire(import.meta.url);
      const fs = esmRequire('fs') as typeof import('fs');
      if (fs.existsSync(jsPath) && !thisFile.endsWith('.ts')) {
        return jsPath;
      }
    } catch {
      // fs not available, try ts
    }

    return thisFile.endsWith('.ts') ? tsPath : jsPath;
  }

  private async _execute<TPayload, TResult>(type: string, payload: TPayload): Promise<TResult> {
    const bridge = await this._ensureInitialized();
    const handle = bridge.execute<TPayload, TResult>(type, payload);
    const result = await handle.result;

    if (result.status === 'resolved') {
      return result.value;
    }

    if (result.status === 'rejected') {
      const err = new Error(result.error.message);
      err.name = result.error.name;
      if (result.error.stack) err.stack = result.error.stack;
      throw err;
    }

    throw new Error(`Task cancelled: ${result.reason ?? 'unknown'}`);
  }

  async compressText(value: string, options?: CompressionTaskOptions): Promise<string> {
    return this._execute('compress:text', {
      value,
      level: options?.level ?? 6,
      threshold: options?.threshold ?? 100,
      encoding: options?.encoding ?? 'base64',
    });
  }

  async decompressText(encoded: string): Promise<string> {
    return this._execute('decompress:text', { encoded });
  }

  async encrypt(content: string, passphrase: string): Promise<string> {
    return this._execute('crypto:encrypt', { content, passphrase });
  }

  async decrypt(encrypted: string, passphrase: string): Promise<string> {
    return this._execute('crypto:decrypt', { encrypted, passphrase });
  }

  async sha256(message: string): Promise<string> {
    return this._execute('crypto:sha256', { message });
  }

  async hashPassword(
    password: string,
    options?: {
      rounds?: number;
      algorithm?: 'bcrypt' | 'argon2id';
      pepper?: string;
      argon2?: { memoryCost?: number; timeCost?: number; parallelism?: number };
    }
  ): Promise<string> {
    return this._execute('password:hash', {
      password,
      rounds: options?.rounds ?? 12,
      algorithm: options?.algorithm ?? 'bcrypt',
      pepper: options?.pepper,
      argon2: options?.argon2,
    });
  }

  async verifyPassword(plaintext: string, hash: string, pepper?: string): Promise<boolean> {
    return this._execute('password:verify', { plaintext, hash, pepper });
  }

  async batchVectorDistance(
    query: number[],
    vectors: number[][],
    metric: DistanceMetric
  ): Promise<number[]> {
    return this._execute('vector:batchDistance', { query, vectors, metric });
  }

  async destroy(): Promise<void> {
    if (this._bridge) {
      await this._bridge.destroy();
      this._bridge = null;
    }
    this._initPromise = null;
    this._mode = 'disabled';
  }

  static create(config?: ThreadingConfig, logger?: Logger): ThreadPool | null {
    if (!config) return null;

    const pool = new ThreadPool(config, logger);
    if (pool.mode === 'disabled') return null;

    return pool;
  }
}
