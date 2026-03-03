import fs from 'fs';
import { readFile, writeFile, unlink, readdir, stat, mkdir } from 'fs/promises';
import path from 'path';
import zlib from 'node:zlib';
import { Cache, type CacheConfig } from './cache.class.js';
import tryFn from '../../concerns/try-fn.js';
import { CacheError } from '../cache.errors.js';
import { getCronManager, type CronManager } from '../../concerns/cron-manager.js';

export type FilesystemEvictionPolicy = 'lru' | 'fifo';

export interface FilesystemCacheConfig extends CacheConfig {
  directory: string;
  prefix?: string;
  ttl?: number;
  enableCompression?: boolean;
  compressionThreshold?: number;
  createDirectory?: boolean;
  fileExtension?: string;
  enableMetadata?: boolean;
  maxFileSize?: number;
  maxBytes?: number;
  evictionPolicy?: FilesystemEvictionPolicy;
  enableStats?: boolean;
  enableCleanup?: boolean;
  cleanupInterval?: number;
  encoding?: BufferEncoding;
  fileMode?: number;
  enableBackup?: boolean;
  backupSuffix?: string;
  enableLocking?: boolean;
  lockTimeout?: number;
  enableJournal?: boolean;
  journalFile?: string;
}

export interface FilesystemCacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  clears: number;
  errors: number;
  currentBytes: number;
  maxBytes: number;
  evictedDueToSize: number;
}

interface FileMetadata {
  key: string;
  timestamp: number;
  ttl: number;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: string | number;
  lastAccess?: number;
  insertOrder?: number;
}

interface SizeIndexEntry {
  bytes: number;
  lastAccess: number;
  insertOrder: number;
}

interface Logger {
  warn(message: string, ...args: unknown[]): void;
}

export class FilesystemCache extends Cache {
  declare config: FilesystemCacheConfig;
  directory: string;
  prefix: string;
  ttl: number;
  enableCompression: boolean;
  compressionThreshold: number;
  createDirectory: boolean;
  fileExtension: string;
  enableMetadata: boolean;
  maxFileSize: number;
  maxBytes: number;
  evictionPolicy: FilesystemEvictionPolicy;
  currentBytes: number;
  evictedDueToSize: number;
  enableStats: boolean;
  enableCleanup: boolean;
  cleanupInterval: number;
  encoding: BufferEncoding;
  fileMode: number;
  enableBackup: boolean;
  backupSuffix: string;
  enableLocking: boolean;
  lockTimeout: number;
  enableJournal: boolean;
  journalFile: string;
  stats: FilesystemCacheStats;
  locks: Map<string, number>;
  cronManager: CronManager;
  cleanupJobName: string | null;
  logger: Logger;
  protected _initPromise: Promise<void>;
  protected _initError?: Error;
  private _accessCounter: number;
  protected _sizeIndex: Map<string, SizeIndexEntry>;

  constructor({
    directory,
    prefix = 'cache',
    ttl = 3600000,
    enableCompression = true,
    compressionThreshold = 1024,
    createDirectory = true,
    fileExtension = '.cache',
    enableMetadata = true,
    maxFileSize = 10485760,
    maxBytes = 0,
    evictionPolicy = 'lru',
    enableStats = false,
    enableCleanup = true,
    cleanupInterval = 300000,
    encoding = 'utf8',
    fileMode = 0o644,
    enableBackup = false,
    backupSuffix = '.bak',
    enableLocking = false,
    lockTimeout = 5000,
    enableJournal = false,
    journalFile = 'cache.journal',
    ...config
  }: FilesystemCacheConfig) {
    super(config);

    if (!directory) {
      throw new CacheError('FilesystemCache requires a directory', {
        driver: 'filesystem',
        operation: 'constructor',
        statusCode: 400,
        retriable: false,
        suggestion: 'Pass { directory: "./cache" } or configure a valid cache directory before enabling FilesystemCache.'
      });
    }

    this.directory = path.resolve(directory);
    this.prefix = prefix;
    this.ttl = ttl;
    this.enableCompression = enableCompression;
    this.compressionThreshold = compressionThreshold;
    this.createDirectory = createDirectory;
    this.fileExtension = fileExtension;
    this.enableMetadata = enableMetadata;
    this.maxFileSize = maxFileSize;
    this.maxBytes = maxBytes;
    this.evictionPolicy = evictionPolicy;
    this.currentBytes = 0;
    this.evictedDueToSize = 0;
    this._accessCounter = 0;
    this._sizeIndex = new Map();
    this.enableStats = enableStats;
    this.enableCleanup = enableCleanup;
    this.cleanupInterval = cleanupInterval;
    this.encoding = encoding;
    this.fileMode = fileMode;
    this.enableBackup = enableBackup;
    this.backupSuffix = backupSuffix;
    this.enableLocking = enableLocking;
    this.lockTimeout = lockTimeout;
    this.enableJournal = enableJournal;
    this.journalFile = path.join(this.directory, journalFile);

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      clears: 0,
      errors: 0,
      currentBytes: 0,
      maxBytes: this.maxBytes,
      evictedDueToSize: 0
    };

    this.locks = new Map();
    this.cronManager = getCronManager();
    this.cleanupJobName = null;
    this.logger = { warn: () => {} };

    this._initPromise = this._init().catch(err => {
      this._initError = err;
    });
  }

  private async _init(): Promise<void> {
    if (this.createDirectory) {
      await this._ensureDirectory(this.directory);
    } else {
      const [exists] = await tryFn(async () => {
        const stats = await stat(this.directory);
        return stats.isDirectory();
      });

      if (!exists) {
        throw new CacheError(`Cache directory "${this.directory}" does not exist and createDirectory is disabled`, {
          driver: 'filesystem',
          operation: 'init',
          statusCode: 500,
          retriable: false,
          suggestion: 'Create the cache directory manually or enable createDirectory in the FilesystemCache configuration.',
          directory: this.directory
        });
      }
    }

    if (this.maxBytes > 0) {
      await this._rebuildSizeIndex();
    }

    if (this.enableCleanup && this.cleanupInterval > 0) {
      this.cleanupJobName = `filesystem-cache-cleanup-${Date.now()}`;
      this.cronManager.scheduleInterval(
        this.cleanupInterval,
        () => {
          this._cleanup().catch(err => {
            this.logger.warn('FilesystemCache cleanup error:', err.message);
          });
        },
        this.cleanupJobName
      );
    }
  }

  protected async _ensureDirectory(dir: string): Promise<void> {
    if (!this.createDirectory) {
      const [exists] = await tryFn(async () => {
        const stats = await stat(dir);
        return stats.isDirectory();
      });

      if (!exists) {
        throw new CacheError(`Cache directory "${dir}" is missing (createDirectory disabled)`, {
          driver: 'filesystem',
          operation: 'ensureDirectory',
          statusCode: 500,
          retriable: false,
          suggestion: 'Create the directory before writing cache entries or enable createDirectory.',
          directory: dir
        });
      }
      return;
    }

    const [ok, err] = await tryFn(async () => {
      await mkdir(dir, { recursive: true });
    });

    if (!ok && err && (err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new CacheError(`Failed to create cache directory: ${err.message}`, {
        driver: 'filesystem',
        operation: 'ensureDirectory',
        statusCode: 500,
        retriable: false,
        suggestion: 'Check filesystem permissions and ensure the process can create directories.',
        directory: dir,
        original: err
      });
    }
  }

  protected _getFilePath(key: string): string {
    const sanitizedKey = key.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${this.prefix}_${sanitizedKey}${this.fileExtension}`;
    return path.join(this.directory, filename);
  }

  protected _getMetadataPath(filePath: string): string {
    return filePath + '.meta';
  }

  protected override async _set(key: string, data: unknown): Promise<void> {
    const filePath = this._getFilePath(key);

    try {
      let serialized = JSON.stringify(data);
      const originalSize = Buffer.byteLength(serialized, this.encoding);

      if (originalSize > this.maxFileSize) {
        throw new CacheError('Cache data exceeds maximum file size', {
          driver: 'filesystem',
          operation: 'set',
          statusCode: 413,
          retriable: false,
          suggestion: 'Increase maxFileSize or reduce the cached payload size.',
          key,
          size: originalSize,
          maxFileSize: this.maxFileSize
        });
      }

      let compressed = false;
      let finalData = serialized;

      if (this.enableCompression && originalSize >= this.compressionThreshold) {
        const compressedBuffer = zlib.gzipSync(Buffer.from(serialized, this.encoding));
        finalData = compressedBuffer.toString('base64');
        compressed = true;
      }

      const estimatedFileBytes = Buffer.byteLength(finalData, compressed ? 'utf8' : this.encoding);
      const metadataEstimate = this.enableMetadata ? 200 : 0;
      const totalIncomingBytes = estimatedFileBytes + metadataEstimate;

      if (this.maxBytes > 0) {
        const existingEntry = this._sizeIndex.get(key);
        if (existingEntry) {
          this.currentBytes = Math.max(0, this.currentBytes - existingEntry.bytes);
          this._sizeIndex.delete(key);
        }

        const fits = await this._enforceSizeLimit(totalIncomingBytes);
        if (!fits) {
          return;
        }
      }

      const dir = path.dirname(filePath);
      await this._ensureDirectory(dir);

      if (this.enableBackup && await this._fileExists(filePath)) {
        const backupPath = filePath + this.backupSuffix;
        await this._copyFile(filePath, backupPath);
      }

      if (this.enableLocking) {
        await this._acquireLock(filePath);
      }

      try {
        await writeFile(filePath, finalData, {
          encoding: compressed ? 'utf8' : this.encoding,
          mode: this.fileMode
        });

        const now = Date.now();
        const insertOrder = ++this._accessCounter;

        if (this.enableMetadata) {
          const metadata: FileMetadata = {
            key,
            timestamp: now,
            ttl: this.ttl,
            compressed,
            originalSize,
            compressedSize: compressed ? Buffer.byteLength(finalData, 'utf8') : originalSize,
            compressionRatio: compressed ? (Buffer.byteLength(finalData, 'utf8') / originalSize).toFixed(2) : 1.0,
            lastAccess: now,
            insertOrder
          };

          await writeFile(this._getMetadataPath(filePath), JSON.stringify(metadata), {
            encoding: this.encoding,
            mode: this.fileMode
          });
        }

        if (this.maxBytes > 0) {
          let actualBytes = 0;
          const [fOk, , fStat] = await tryFn(() => stat(filePath));
          if (fOk && fStat) actualBytes += fStat.size;

          if (this.enableMetadata) {
            const metaPath = this._getMetadataPath(filePath);
            const [mOk, , mStat] = await tryFn(() => stat(metaPath));
            if (mOk && mStat) actualBytes += mStat.size;
          }

          this._sizeIndex.set(key, { bytes: actualBytes, lastAccess: now, insertOrder });
          this.currentBytes += actualBytes;
        }

        if (this.enableStats) {
          this.stats.sets++;
        }

        if (this.enableJournal) {
          await this._journalOperation('set', key, { size: originalSize, compressed });
        }

      } finally {
        if (this.enableLocking) {
          this._releaseLock(filePath);
        }
      }

    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError(`Failed to set cache key '${key}': ${(error as Error).message}`, {
        driver: 'filesystem',
        operation: 'set',
        statusCode: 500,
        retriable: false,
        suggestion: 'Verify filesystem permissions and available disk space.',
        key,
        original: error
      });
    }
  }

  protected override async _get(key: string): Promise<unknown> {
    const filePath = this._getFilePath(key);

    try {
      if (!await this._fileExists(filePath)) {
        if (this.enableStats) {
          this.stats.misses++;
        }
        return null;
      }

      let isExpired = false;

      if (this.enableMetadata) {
        const metadataPath = this._getMetadataPath(filePath);
        if (await this._fileExists(metadataPath)) {
          const [ok, , metadata] = await tryFn(async () => {
            const metaContent = await readFile(metadataPath, this.encoding);
            return JSON.parse(metaContent) as FileMetadata;
          });

          if (ok && metadata && metadata.ttl > 0) {
            const age = Date.now() - metadata.timestamp;
            isExpired = age > metadata.ttl;
          }
        }
      } else if (this.ttl > 0) {
        const stats = await stat(filePath);
        const age = Date.now() - stats.mtime.getTime();
        isExpired = age > this.ttl;
      }

      if (isExpired) {
        await this._del(key);
        if (this.enableStats) {
          this.stats.misses++;
        }
        return null;
      }

      if (this.enableLocking) {
        await this._acquireLock(filePath);
      }

      try {
        const content = await readFile(filePath, this.encoding);

        let isCompressed = false;
        if (this.enableMetadata) {
          const metadataPath = this._getMetadataPath(filePath);
          if (await this._fileExists(metadataPath)) {
            const [ok, , metadata] = await tryFn(async () => {
              const metaContent = await readFile(metadataPath, this.encoding);
              return JSON.parse(metaContent) as FileMetadata;
            });
            if (ok && metadata) {
              isCompressed = metadata.compressed;
            }
          }
        }

        let finalContent = content;
        if (isCompressed || (this.enableCompression && content.match(/^[A-Za-z0-9+/=]+$/))) {
          try {
            const compressedBuffer = Buffer.from(content, 'base64');
            finalContent = zlib.gunzipSync(compressedBuffer).toString(this.encoding);
          } catch {
            finalContent = content;
          }
        }

        const data = JSON.parse(finalContent);

        if (this.enableStats) {
          this.stats.hits++;
        }

        if (this.maxBytes > 0 && this.evictionPolicy === 'lru') {
          const now = Date.now();
          const entry = this._sizeIndex.get(key);
          if (entry) {
            entry.lastAccess = now;
          }

          if (this.enableMetadata) {
            const metaPath = this._getMetadataPath(filePath);
            tryFn(async () => {
              const metaContent = await readFile(metaPath, this.encoding);
              const meta = JSON.parse(metaContent) as FileMetadata;
              meta.lastAccess = now;
              await writeFile(metaPath, JSON.stringify(meta), { encoding: this.encoding, mode: this.fileMode });
            });
          }
        }

        return data;

      } finally {
        if (this.enableLocking) {
          this._releaseLock(filePath);
        }
      }

    } catch {
      if (this.enableStats) {
        this.stats.errors++;
      }
      await this._del(key);
      return null;
    }
  }

  protected override async _del(key: string): Promise<unknown> {
    const filePath = this._getFilePath(key);

    try {
      if (await this._fileExists(filePath)) {
        await unlink(filePath);
      }

      if (this.enableMetadata) {
        const metadataPath = this._getMetadataPath(filePath);
        if (await this._fileExists(metadataPath)) {
          await unlink(metadataPath);
        }
      }

      if (this.enableBackup) {
        const backupPath = filePath + this.backupSuffix;
        if (await this._fileExists(backupPath)) {
          await unlink(backupPath);
        }
      }

      if (this.maxBytes > 0) {
        const entry = this._sizeIndex.get(key);
        if (entry) {
          this.currentBytes = Math.max(0, this.currentBytes - entry.bytes);
          this._sizeIndex.delete(key);
        }
      }

      if (this.enableStats) {
        this.stats.deletes++;
      }

      if (this.enableJournal) {
        await this._journalOperation('delete', key);
      }

      return true;

    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError(`Failed to delete cache key '${key}': ${(error as Error).message}`, {
        driver: 'filesystem',
        operation: 'delete',
        statusCode: 500,
        retriable: false,
        suggestion: 'Ensure cache files are writable and not locked by another process.',
        key,
        original: error
      });
    }
  }

  protected override async _clear(prefix?: string): Promise<unknown> {
    try {
      if (!await this._fileExists(this.directory)) {
        if (this.enableStats) {
          this.stats.clears++;
        }
        return true;
      }

      const files = await readdir(this.directory);
      const cacheFiles = files.filter(file => {
        if (!file.startsWith(this.prefix)) return false;
        if (!file.endsWith(this.fileExtension)) return false;

        if (prefix) {
          const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
          return keyPart.startsWith(prefix);
        }

        return true;
      });

      for (const file of cacheFiles) {
        const filePath = path.join(this.directory, file);

        try {
          if (await this._fileExists(filePath)) {
            await unlink(filePath);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }

        if (this.enableMetadata) {
          try {
            const metadataPath = this._getMetadataPath(filePath);
            if (await this._fileExists(metadataPath)) {
              await unlink(metadataPath);
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
          }
        }

        if (this.enableBackup) {
          try {
            const backupPath = filePath + this.backupSuffix;
            if (await this._fileExists(backupPath)) {
              await unlink(backupPath);
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
          }
        }
      }

      if (this.maxBytes > 0) {
        if (!prefix) {
          this._sizeIndex.clear();
          this.currentBytes = 0;
        } else {
          for (const [key] of this._sizeIndex) {
            if (key.startsWith(prefix)) {
              const entry = this._sizeIndex.get(key);
              if (entry) {
                this.currentBytes = Math.max(0, this.currentBytes - entry.bytes);
              }
              this._sizeIndex.delete(key);
            }
          }
        }
      }

      if (this.enableStats) {
        this.stats.clears++;
      }

      if (this.enableJournal) {
        await this._journalOperation('clear', prefix || 'all', { count: cacheFiles.length });
      }

      return true;

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (this.enableStats) {
          this.stats.clears++;
        }
        return true;
      }

      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError(`Failed to clear cache: ${(error as Error).message}`, {
        driver: 'filesystem',
        operation: 'clear',
        statusCode: 500,
        retriable: false,
        suggestion: 'Verify the cache directory is accessible and not in use by another process.',
        original: error
      });
    }
  }

  async size(): Promise<number> {
    const keys = await this.keys();
    return keys.length;
  }

  async keys(): Promise<string[]> {
    try {
      const files = await readdir(this.directory);
      const cacheFiles = files.filter(file =>
        file.startsWith(this.prefix) &&
        file.endsWith(this.fileExtension)
      );

      const keys = cacheFiles.map(file => {
        const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
        return keyPart;
      });

      return keys;

    } catch (error) {
      this.logger.warn('FilesystemCache: Failed to list keys:', (error as Error).message);
      return [];
    }
  }

  protected async _fileExists(filePath: string): Promise<boolean> {
    const [ok] = await tryFn(async () => {
      await stat(filePath);
    });
    return ok;
  }

  protected async _copyFile(src: string, dest: string): Promise<void> {
    const [ok, err] = await tryFn(async () => {
      const content = await readFile(src);
      await writeFile(dest, content);
    });
    if (!ok && err) {
      this.logger.warn('FilesystemCache: Failed to create backup:', err.message);
    }
  }

  protected async _cleanup(): Promise<void> {
    if (!this.ttl || this.ttl <= 0) return;

    try {
      const files = await readdir(this.directory);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith(this.prefix) || !file.endsWith(this.fileExtension)) {
          continue;
        }

        const filePath = path.join(this.directory, file);

        let shouldDelete = false;

        if (this.enableMetadata) {
          const metadataPath = this._getMetadataPath(filePath);
          if (await this._fileExists(metadataPath)) {
            const [ok, , metadata] = await tryFn(async () => {
              const metaContent = await readFile(metadataPath, this.encoding);
              return JSON.parse(metaContent) as FileMetadata;
            });

            if (ok && metadata && metadata.ttl > 0) {
              const age = now - metadata.timestamp;
              shouldDelete = age > metadata.ttl;
            }
          }
        } else {
          const [ok, , stats] = await tryFn(async () => {
            return await stat(filePath);
          });

          if (ok && stats) {
            const age = now - stats.mtime.getTime();
            shouldDelete = age > this.ttl;
          }
        }

        if (shouldDelete) {
          const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
          await this._del(keyPart);
        }
      }

      if (this.maxBytes > 0) {
        await this._enforceSizeLimit(0);
      }

    } catch (error) {
      this.logger.warn('FilesystemCache cleanup error:', (error as Error).message);
    }
  }

  protected async _acquireLock(filePath: string): Promise<void> {
    if (!this.enableLocking) return;

    const lockKey = filePath;
    const startTime = Date.now();

    while (this.locks.has(lockKey)) {
      if (Date.now() - startTime > this.lockTimeout) {
        throw new CacheError(`Lock timeout for file: ${filePath}`, {
          driver: 'filesystem',
          operation: 'acquireLock',
          statusCode: 408,
          retriable: true,
          suggestion: 'Increase lockTimeout or investigate long-running cache writes holding the lock.',
          key: lockKey
        });
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.locks.set(lockKey, Date.now());
  }

  protected _releaseLock(filePath: string): void {
    if (!this.enableLocking) return;
    this.locks.delete(filePath);
  }

  protected async _journalOperation(operation: string, key: string, metadata: Record<string, unknown> = {}): Promise<void> {
    if (!this.enableJournal) return;

    const entry = {
      timestamp: new Date().toISOString(),
      operation,
      key,
      metadata
    };

    const [ok, err] = await tryFn(async () => {
      const line = JSON.stringify(entry) + '\n';
      await fs.promises.appendFile(this.journalFile, line, this.encoding);
    });

    if (!ok && err) {
      this.logger.warn('FilesystemCache journal error:', err.message);
    }
  }

  protected async _rebuildSizeIndex(): Promise<void> {
    this._sizeIndex.clear();
    this.currentBytes = 0;

    const allKeys = await this.keys();
    let order = 0;

    for (const key of allKeys) {
      const filePath = this._getFilePath(key);
      const [ok, , fileStat] = await tryFn(() => stat(filePath));
      if (!ok || !fileStat) continue;

      let totalBytes = fileStat.size;

      if (this.enableMetadata) {
        const metaPath = this._getMetadataPath(filePath);
        const [metaOk, , metaStat] = await tryFn(() => stat(metaPath));
        if (metaOk && metaStat) {
          totalBytes += metaStat.size;
        }
      }

      let lastAccess = fileStat.mtime.getTime();
      let insertOrder = ++order;

      if (this.enableMetadata) {
        const metaPath = this._getMetadataPath(filePath);
        const [metaOk, , metadata] = await tryFn(async () => {
          const content = await readFile(metaPath, this.encoding);
          return JSON.parse(content) as FileMetadata;
        });
        if (metaOk && metadata) {
          if (metadata.lastAccess) lastAccess = metadata.lastAccess;
          if (metadata.insertOrder) insertOrder = metadata.insertOrder;
        }
      }

      this._sizeIndex.set(key, { bytes: totalBytes, lastAccess, insertOrder });
      this.currentBytes += totalBytes;
    }

    this._accessCounter = order;
  }

  protected _selectEvictionCandidate(): string | null {
    let candidate: string | null = null;
    let bestValue = Infinity;

    for (const [key, entry] of this._sizeIndex) {
      const value = this.evictionPolicy === 'lru' ? entry.lastAccess : entry.insertOrder;
      if (value < bestValue) {
        bestValue = value;
        candidate = key;
      }
    }

    return candidate;
  }

  protected async _evictKey(key: string): Promise<void> {
    const entry = this._sizeIndex.get(key);
    await this._del(key);
    if (entry) {
      this._sizeIndex.delete(key);
      this.currentBytes = Math.max(0, this.currentBytes - entry.bytes);
    }
    this.evictedDueToSize++;
  }

  protected async _enforceSizeLimit(incomingBytes: number): Promise<boolean> {
    if (this.maxBytes <= 0) return true;

    if (incomingBytes > this.maxBytes) return false;

    while (this.currentBytes + incomingBytes > this.maxBytes && this._sizeIndex.size > 0) {
      const candidate = this._selectEvictionCandidate();
      if (!candidate) break;
      await this._evictKey(candidate);
    }

    return this.currentBytes + incomingBytes <= this.maxBytes;
  }

  destroy(): void {
    if (this.cleanupJobName) {
      this.cronManager.stop(this.cleanupJobName);
      this.cleanupJobName = null;
    }
  }

  getStats(): FilesystemCacheStats & Record<string, unknown> {
    return {
      ...this.stats,
      currentBytes: this.currentBytes,
      maxBytes: this.maxBytes,
      evictedDueToSize: this.evictedDueToSize,
      directory: this.directory,
      ttl: this.ttl,
      compression: this.enableCompression,
      metadata: this.enableMetadata,
      cleanup: this.enableCleanup,
      locking: this.enableLocking,
      journal: this.enableJournal
    };
  }
}

export default FilesystemCache;
