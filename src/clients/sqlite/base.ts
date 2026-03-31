import path from 'path';
import { mkdirSync } from 'fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import EventEmitter from 'events';

import { tryFn } from '../../concerns/try-fn.js';
import { idGenerator } from '../../concerns/id.js';
import { getNodeSqliteAvailabilityError, getNodeSqliteDatabaseSync } from '../sqlite-runtime.js';
import { createLogger } from '../../concerns/logger.js';
import { DatabaseError } from '../../errors.js';
import { TasksRunner } from '../../tasks/tasks-runner.class.js';
import type { LogLevel } from '../../types/common.types.js';
import type { DatabaseSync as NodeSqliteDatabaseSync } from 'node:sqlite';
import type {
  Logger,
  SqliteClientConfig,
  TaskManager,
  MonitoringConfig,
  QueueStats
} from '../types.js';
import type {
  DbRow,
  DbObjectHeaderRow,
  DbObjectStateRow,
  DbBucketStatsRow,
  SqlitePreparedStatement
} from './types.js';

export class SqliteClientBase extends EventEmitter {
  id: string;
  logLevel: string;
  readonly supportsPartitionIndex = true;
  protected logger: Logger;
  protected taskExecutorMonitoring: MonitoringConfig | null;
  protected taskManager: TaskManager;
  protected db: NodeSqliteDatabaseSync;
  protected dbPath: string;
  bucket: string;
  protected keyPrefix: string;
  protected region: string;
  protected _keyPrefixForStrip: string;
  connectionString: string;
  config: {
    bucket: string;
    keyPrefix: string;
    region: string;
    endpoint: string;
    forcePathStyle: true;
    basePath: string;
  };
  protected enforceLimits: boolean;
  protected metadataLimit: number;
  protected maxObjectSize: number;
  protected maxMemoryMB?: number;
  protected maxMemoryBytes: number | null;
  protected basePath: string;
  protected _closed = false;
  protected _writeTransactionDepth = 0;
  protected _activeWriteToken: symbol | null = null;
  protected _pendingWriteLock: Promise<void> = Promise.resolve();
  protected readonly _writeContext = new AsyncLocalStorage<symbol>();
  protected readonly statementCache = new Map<string, SqlitePreparedStatement>();
  protected _sqliteVecEnabled = false;
  protected _sqliteVecLoaded = false;
  protected readonly _vecTables = new Set<string>();

  constructor(config: SqliteClientConfig = {}) {
    super();

    this.id = config.id || idGenerator(77);
    this.logLevel = config.logLevel || 'info';
    this.enforceLimits = Boolean(config.enforceLimits);
    this.metadataLimit = config.metadataLimit ?? 2048;
    this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024;
    this.maxMemoryMB = typeof config.maxMemoryMB === 'number' && config.maxMemoryMB > 0
      ? config.maxMemoryMB
      : undefined;
    this.maxMemoryBytes = this.maxMemoryMB
      ? Math.floor(this.maxMemoryMB * 1024 * 1024)
      : null;

    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = createLogger({ name: 'SqliteClient', level: this.logLevel as LogLevel });
    }
    this.taskExecutorMonitoring = config.taskExecutorMonitoring
      ? { ...config.taskExecutorMonitoring }
      : null;

    if (config.taskExecutor) {
      this.taskManager = config.taskExecutor;
    } else {
      this.taskManager = new TasksRunner({
        concurrency: config.concurrency || 5,
        retries: config.retries ?? 3,
        retryDelay: config.retryDelay || 1000,
        timeout: config.timeout || 30000,
        retryableErrors: config.retryableErrors || [],
        monitoring: this.taskExecutorMonitoring || undefined
      }) as any;
    }

    this.bucket = config.bucket || 's3db';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'sqlite';
    this._keyPrefixForStrip = this.keyPrefix ? path.posix.join(this.keyPrefix, '') : '';

    const rawBasePath = config.basePath || path.join(process.cwd(), 's3db.sqlite');
    this.dbPath = rawBasePath === ':memory:'
      ? ':memory:'
      : path.resolve(rawBasePath);
    this.basePath = this.dbPath;

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.basePath);
      mkdirSync(dir, { recursive: true });
    }

    this.connectionString = this.dbPath === ':memory:'
      ? 'sqlite:///:memory:'
      : `sqlite:///${encodeURI(this.basePath).replace(/^\//, '')}`;

    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      endpoint: this.connectionString,
      forcePathStyle: true,
      basePath: this.basePath
    };

    let DatabaseSyncClass: new (path: string) => NodeSqliteDatabaseSync;
    try {
      DatabaseSyncClass = getNodeSqliteDatabaseSync();
    } catch {
      const availabilityError = getNodeSqliteAvailabilityError();
      throw new DatabaseError('SqliteClient requires the node:sqlite builtin module, which is not available in this runtime.', {
        operation: 'SqliteClient.constructor',
        retriable: false,
        suggestion: 'Run on a Node.js runtime that provides node:sqlite, or use FileSystemClient/MemoryClient instead.',
        original: availabilityError || undefined
      });
    }

    this.db = new DatabaseSyncClass(this.basePath) as NodeSqliteDatabaseSync;

    tryFn(() => this.db.exec('PRAGMA page_size = 8192;'));

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS objects (
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        metadata TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_encoding TEXT,
        content_length INTEGER NOT NULL,
        etag TEXT NOT NULL,
        last_modified TEXT NOT NULL,
        body BLOB NOT NULL,
        PRIMARY KEY (bucket, key)
      );

      CREATE TABLE IF NOT EXISTS bucket_stats (
        bucket TEXT PRIMARY KEY,
        total_content_length INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS partition_index (
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        resource_name TEXT NOT NULL,
        partition_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        metadata TEXT NOT NULL,
        content_type TEXT NOT NULL,
        etag TEXT NOT NULL,
        last_modified TEXT NOT NULL,
        PRIMARY KEY (bucket, key)
      );

      CREATE INDEX IF NOT EXISTS idx_partition_index_lookup
      ON partition_index (bucket, resource_name, partition_name, record_id);
    `);

    this._rebuildBucketStats();
    this._ensureBucketStatsRow();

    tryFn(() => this.db.exec('PRAGMA journal_mode = WAL;'));
    tryFn(() => this.db.exec(`
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 268435456;
      PRAGMA busy_timeout = 5000;
    `));

    this.logger.debug(
      {
        id: this.id,
        bucket: this.bucket,
        keyPrefix: this.keyPrefix,
        region: this.region,
        basePath: this.basePath
      },
      `Initialized (id: ${this.id}, dbPath: ${this.basePath})`
    );
  }

  async destroy(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this.statementCache.clear();
    this.db.close();
    if (this.logger) {
      this.logger.debug('Closed sqlite database');
    }
    this.removeAllListeners();
  }

  isInTransaction(): boolean {
    const currentToken = this._writeContext.getStore();
    return Boolean(currentToken && currentToken === this._activeWriteToken && this._writeTransactionDepth > 0);
  }

  async runInTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
    return this._runWriteTask(async () => {
      return this._withWriteTransactionAsync(fn);
    });
  }

  protected _prepareCached(sql: string): SqlitePreparedStatement {
    const cached = this.statementCache.get(sql);
    if (cached) {
      return cached;
    }

    const statement = this.db.prepare(sql) as SqlitePreparedStatement;
    this.statementCache.set(sql, statement);
    return statement;
  }

  protected _getKeyRange(prefix: string): { start: string; end: string } {
    return {
      start: prefix,
      end: `${prefix}\uffff`
    };
  }

  protected async _runWriteTask<T>(fn: () => Promise<T> | T): Promise<T> {
    const currentToken = this._writeContext.getStore();

    if (currentToken && currentToken === this._activeWriteToken) {
      return await fn();
    }

    const token = Symbol('sqlite-write');
    let releaseLock!: () => void;
    const previousLock = this._pendingWriteLock;
    this._pendingWriteLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    this._activeWriteToken = token;

    try {
      return await this._writeContext.run(token, async () => {
        return await fn();
      });
    } finally {
      this._activeWriteToken = null;
      releaseLock();
    }
  }

  protected async _withWriteTransactionAsync<T>(fn: () => Promise<T> | T): Promise<T> {
    const isOuterTransaction = this._writeTransactionDepth === 0;

    if (isOuterTransaction) {
      this.db.exec('BEGIN IMMEDIATE');
    }

    this._writeTransactionDepth += 1;

    try {
      const result = await fn();
      this._writeTransactionDepth -= 1;

      if (isOuterTransaction) {
        this.db.exec('COMMIT');
      }

      return result;
    } catch (error) {
      this._writeTransactionDepth = Math.max(0, this._writeTransactionDepth - 1);

      if (isOuterTransaction) {
        tryFn(() => this.db.exec('ROLLBACK'));
      }

      throw error;
    }
  }

  protected _withWriteTransaction<T>(fn: () => T): T {
    const isOuterTransaction = this._writeTransactionDepth === 0;

    if (isOuterTransaction) {
      this.db.exec('BEGIN IMMEDIATE');
    }

    this._writeTransactionDepth += 1;

    try {
      const result = fn();
      this._writeTransactionDepth -= 1;

      if (isOuterTransaction) {
        this.db.exec('COMMIT');
      }

      return result;
    } catch (error) {
      this._writeTransactionDepth = Math.max(0, this._writeTransactionDepth - 1);

      if (isOuterTransaction) {
        tryFn(() => this.db.exec('ROLLBACK'));
      }

      throw error;
    }
  }

  protected _getRow(key: string): DbRow | null {
    const statement = this._prepareCached(`
      SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
      FROM objects
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbRow | undefined;
    return row || null;
  }

  protected _getObjectHeaderRow(key: string): DbObjectHeaderRow | null {
    const statement = this._prepareCached(`
      SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified
      FROM objects
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbObjectHeaderRow | undefined;
    return row || null;
  }

  protected _getObjectState(key: string): DbObjectStateRow | null {
    const statement = this._prepareCached(`
      SELECT content_length, etag
      FROM objects
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbObjectStateRow | undefined;
    return row || null;
  }

  protected _hasKey(key: string): boolean {
    const statement = this._prepareCached(`
      SELECT 1
      FROM objects
      WHERE bucket = ? AND key = ?
      LIMIT 1
    `);
    return Boolean(statement.get(this.bucket, key));
  }

  protected _rebuildBucketStats(): void {
    this.db.exec(`
      INSERT INTO bucket_stats (bucket, total_content_length)
      SELECT bucket, COALESCE(SUM(content_length), 0)
      FROM objects
      GROUP BY bucket
      ON CONFLICT(bucket) DO UPDATE SET
        total_content_length = excluded.total_content_length
    `);
  }

  protected _ensureBucketStatsRow(): void {
    const statement = this._prepareCached(`
      INSERT OR IGNORE INTO bucket_stats (bucket, total_content_length)
      VALUES (?, 0)
    `);
    statement.run(this.bucket);
  }

  getQueueStats(): QueueStats | null {
    if (this.taskManager && typeof this.taskManager.getStats === 'function') {
      return this.taskManager.getStats() as QueueStats;
    }
    return null;
  }
}
