import { createHash } from 'crypto';
import { mkdir, writeFile, readFile, unlink, stat, readdir, rename, copyFile, appendFile } from 'fs/promises';
import { existsSync, Dirent, Stats } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { platform } from 'os';
import zlib from 'zlib';
import { chunk } from 'lodash-es';

import { tryFn } from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { MetadataLimitError, ResourceError, ValidationError } from '../errors.js';
import { getCronManager, type CronManager } from '../concerns/cron-manager.js';
import { createLogger } from '../concerns/logger.js';
import type { LogLevel } from '../types/common.types.js';
import type {
  Logger,
  FileSystemStorageConfig,
  FileSystemStorageStats,
  StorageObjectData,
  StoragePutParams,
  StorageCopyParams,
  StorageListParams,
  S3Object,
  PutObjectResponse,
  CopyObjectResponse,
  DeleteObjectResponse,
  DeleteObjectsResponse,
  ListObjectsResponse
} from './types.js';

interface InternalStats {
  gets: number;
  puts: number;
  deletes: number;
  errors: number;
  compressionSaved: number;
  totalCompressed: number;
  totalUncompressed: number;
}

interface CompressionResult {
  buffer: Buffer;
  compressed: boolean;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: string;
}

interface FileEntry {
  key: string;
  path: string;
  size: number;
  mtime: Date;
}

export class FileSystemStorage {
  private basePath: string;
  private bucket: string;
  private enforceLimits: boolean;
  private metadataLimit: number;
  private maxObjectSize: number;
  private logLevel: string;

  private enableCompression: boolean;
  private compressionThreshold: number;
  private compressionLevel: number;

  private enableTTL: boolean;
  private defaultTTL: number;
  private cleanupInterval: number;

  private enableLocking: boolean;
  private lockTimeout: number;

  private enableBackup: boolean;
  private backupSuffix: string;

  private enableJournal: boolean;
  private journalFile: string;

  private enableStats: boolean;

  private isWindows: boolean;
  private locks: Map<string, number>;
  private stats: InternalStats;
  private logger: Logger;
  private cronManager: CronManager;
  private cleanupJobName: string | null;

  constructor(config: FileSystemStorageConfig = {}) {
    this.basePath = config.basePath || './s3db-data';
    this.bucket = config.bucket || 's3db';
    this.enforceLimits = Boolean(config.enforceLimits);
    this.metadataLimit = config.metadataLimit ?? 2048;
    this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024;
    this.logLevel = config.logLevel || 'info';

    const compressionConfig = config.compression || {};
    this.enableCompression = Boolean(compressionConfig.enabled);
    this.compressionThreshold = compressionConfig.threshold ?? 1024;
    this.compressionLevel = compressionConfig.level ?? 6;

    const ttlConfig = config.ttl || {};
    this.enableTTL = Boolean(ttlConfig.enabled);
    this.defaultTTL = ttlConfig.defaultTTL ?? 3600000;
    this.cleanupInterval = ttlConfig.cleanupInterval ?? 300000;

    const lockingConfig = config.locking || {};
    this.enableLocking = Boolean(lockingConfig.enabled);
    this.lockTimeout = lockingConfig.timeout ?? 5000;

    const backupConfig = config.backup || {};
    this.enableBackup = Boolean(backupConfig.enabled);
    this.backupSuffix = backupConfig.suffix ?? '.bak';

    const journalConfig = config.journal || {};
    this.enableJournal = Boolean(journalConfig.enabled);
    this.journalFile = journalConfig.file ?? 'operations.journal';

    const statsConfig = config.stats || {};
    this.enableStats = Boolean(statsConfig.enabled);

    this.isWindows = platform() === 'win32';
    this.basePath = path.resolve(this.basePath);

    this.locks = new Map();
    this.stats = {
      gets: 0,
      puts: 0,
      deletes: 0,
      errors: 0,
      compressionSaved: 0,
      totalCompressed: 0,
      totalUncompressed: 0
    };

    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = createLogger({ name: 'FileSystemStorage', level: this.logLevel as LogLevel });
    }

    this.cronManager = getCronManager();
    this.cleanupJobName = null;

    if (this.enableTTL && this.cleanupInterval > 0) {
      this._initCleanup();
    }

    const features: string[] = [];
    if (this.enableCompression) features.push(`compression:${this.compressionThreshold}b`);
    if (this.enableTTL) features.push(`ttl:${this.defaultTTL}ms`);
    if (this.enableLocking) features.push('locking');
    if (this.enableBackup) features.push('backup');
    if (this.enableJournal) features.push('journal');
    if (this.enableStats) features.push('stats');

    this.logger.debug({ basePath: this.basePath, features }, `Initialized (basePath: ${this.basePath}${features.length ? ', features: ' + features.join(', ') : ''})`);
  }

  private _keyToPath(key: string): string {
    const normalizedKey = key.replace(/\//g, path.sep);
    return path.join(this.basePath, normalizedKey);
  }

  private _pathToKey(filePath: string): string {
    const relativePath = path.relative(this.basePath, filePath);
    return relativePath.split(path.sep).join('/');
  }

  private _getObjectPath(key: string): string {
    return this._keyToPath(key);
  }

  private _getMetadataPath(key: string): string {
    return this._keyToPath(key) + '.meta.json';
  }

  private async _ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    const [ok, err] = await tryFn(() => mkdir(dir, { recursive: true }));

    if (!ok && (err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw this._mapFilesystemError(err as Error, { path: dir, operation: 'mkdir' });
    }
  }

  private _generateETag(body: Buffer): string {
    const buffer = this._toBuffer(body);
    return createHash('md5').update(buffer).digest('hex');
  }

  private _toBuffer(body: unknown): Buffer {
    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (body === undefined || body === null) {
      return Buffer.alloc(0);
    }

    return Buffer.from(body as string);
  }

  private _formatEtag(etag: string): string {
    return `"${etag}"`;
  }

  private _normalizeEtagHeader(headerValue: string | undefined | null): string[] {
    if (headerValue === undefined || headerValue === null) {
      return [];
    }

    return String(headerValue)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
  }

  private _encodeContinuationToken(key: string): string {
    return Buffer.from(String(key), 'utf8').toString('base64');
  }

  private _decodeContinuationToken(token: string): string {
    try {
      const normalized = String(token).trim();
      const decoded = Buffer.from(normalized, 'base64').toString('utf8');
      const reencoded = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
      const normalizedNoPad = normalized.replace(/=+$/, '');

      if (!decoded || reencoded !== normalizedNoPad) {
        throw new Error('Invalid continuation token format');
      }

      return decoded;
    } catch (error) {
      throw new ValidationError('Invalid continuation token', {
        field: 'ContinuationToken',
        retriable: false,
        suggestion: 'Use the NextContinuationToken returned by a previous ListObjectsV2 response.',
        original: error
      });
    }
  }

  private _extractCommonPrefix(prefix: string, delimiter: string, key: string): string | null {
    if (!delimiter) return null;

    const hasPrefix = Boolean(prefix);
    if (hasPrefix && !key.startsWith(prefix)) {
      return null;
    }

    const remainder = hasPrefix ? key.slice(prefix.length) : key;
    const index = remainder.indexOf(delimiter);

    if (index === -1) {
      return null;
    }

    const baseLength = hasPrefix ? prefix.length : 0;
    return key.slice(0, baseLength + index + delimiter.length);
  }

  private _calculateMetadataSize(metadata?: Record<string, string>): number {
    if (!metadata) return 0;

    let size = 0;
    for (const [key, value] of Object.entries(metadata)) {
      size += Buffer.byteLength(key, 'utf8');
      size += Buffer.byteLength(String(value), 'utf8');
    }
    return size;
  }

  private _validateLimits(body: unknown, metadata?: Record<string, string>): void {
    if (!this.enforceLimits) return;

    const metadataSize = this._calculateMetadataSize(metadata);
    if (metadataSize > this.metadataLimit) {
      throw new MetadataLimitError('Metadata limit exceeded in filesystem storage', {
        bucket: this.bucket,
        totalSize: metadataSize,
        effectiveLimit: this.metadataLimit,
        operation: 'put',
        retriable: false,
        suggestion: 'Reduce metadata size or disable enforceLimits in FileSystemClient configuration.'
      });
    }

    const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength((body as string) || '', 'utf8');
    if (bodySize > this.maxObjectSize) {
      throw new ResourceError('Object size exceeds filesystem limit', {
        bucket: this.bucket,
        operation: 'put',
        size: bodySize,
        maxObjectSize: this.maxObjectSize,
        statusCode: 413,
        retriable: false,
        suggestion: 'Store smaller objects or increase maxObjectSize when instantiating FileSystemClient.'
      });
    }
  }

  private async _writeAtomic(filePath: string, data: Buffer | string): Promise<void> {
    await this._ensureDirectory(filePath);

    const tempPath = `${filePath}.tmp.${Date.now()}.${idGenerator(6)}`;

    try {
      await writeFile(tempPath, data);
      await rename(tempPath, filePath);
    } catch (error) {
      try {
        await unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private async _readMetadata(key: string): Promise<StorageObjectData> {
    const metaPath = this._getMetadataPath(key);
    const [ok, err, json] = await tryFn<string>(() => readFile(metaPath, 'utf-8'));

    if (!ok) {
      throw this._mapFilesystemError(err as Error, { key, path: metaPath, operation: 'readMetadata' });
    }

    return JSON.parse(json as string);
  }

  private async _writeMetadata(key: string, metadata: StorageObjectData): Promise<void> {
    const metaPath = this._getMetadataPath(key);
    const json = JSON.stringify(metadata, null, 2);
    await this._writeAtomic(metaPath, json);
  }

  private _initCleanup(): void {
    this.cleanupJobName = `filesystem-storage-cleanup-${Date.now()}`;
    this.cronManager.scheduleInterval(
      this.cleanupInterval,
      () => {
        this._runCleanup().catch(err => {
          this.logger.warn({ error: (err as Error).message }, 'Cleanup error');
        });
      },
      this.cleanupJobName
    );
  }

  private async _runCleanup(): Promise<void> {
    if (!this.enableTTL || this.defaultTTL <= 0) return;

    let cleaned = 0;
    const now = Date.now();

    for await (const entry of this._walkDirectory(this.basePath)) {
      try {
        const [ok, , metaData] = await tryFn<StorageObjectData>(() => this._readMetadata(entry.key));
        if (!ok) continue;

        const expiresAt = (metaData as StorageObjectData).expiresAt;
        if (expiresAt && expiresAt < now) {
          await this.delete(entry.key);
          cleaned++;
        }
      } catch (err) {
        // Ignore errors during cleanup
      }
    }

    if (cleaned > 0) {
      this.logger.debug({ cleaned }, `Cleanup: removed ${cleaned} expired objects`);
    }
  }

  private async _acquireLock(key: string): Promise<void> {
    if (!this.enableLocking) return;

    const startTime = Date.now();

    while (this.locks.has(key)) {
      if (Date.now() - startTime > this.lockTimeout) {
        throw new ResourceError(`Lock timeout for key: ${key}`, {
          bucket: this.bucket,
          key,
          code: 'LockTimeout',
          statusCode: 408,
          retriable: true,
          suggestion: 'Increase lockTimeout or investigate concurrent writes holding the lock.'
        });
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.locks.set(key, Date.now());
  }

  private _releaseLock(key: string): void {
    if (!this.enableLocking) return;
    this.locks.delete(key);
  }

  private async _journalOperation(operation: string, key: string, metadata: Record<string, unknown> = {}): Promise<void> {
    if (!this.enableJournal) return;

    const entry = {
      timestamp: new Date().toISOString(),
      operation,
      key,
      metadata
    };

    const journalPath = path.join(this.basePath, this.journalFile);
    const line = JSON.stringify(entry) + '\n';

    await tryFn(() => appendFile(journalPath, line, 'utf8'));
  }

  private async _createBackup(filePath: string): Promise<void> {
    if (!this.enableBackup) return;
    if (!existsSync(filePath)) return;

    const backupPath = filePath + this.backupSuffix;
    await tryFn(() => copyFile(filePath, backupPath));
  }

  private _compressBody(body: unknown): CompressionResult {
    if (!this.enableCompression) {
      return { buffer: this._toBuffer(body), compressed: false };
    }

    const buffer = this._toBuffer(body);
    const originalSize = buffer.length;

    if (originalSize < this.compressionThreshold) {
      return { buffer, compressed: false, originalSize };
    }

    const compressedBuffer = zlib.gzipSync(buffer, { level: this.compressionLevel });
    const compressedSize = compressedBuffer.length;

    if (this.enableStats) {
      this.stats.totalUncompressed += originalSize;
      this.stats.totalCompressed += compressedSize;
      this.stats.compressionSaved += (originalSize - compressedSize);
    }

    return {
      buffer: compressedBuffer,
      compressed: true,
      originalSize,
      compressedSize,
      compressionRatio: (compressedSize / originalSize).toFixed(3)
    };
  }

  private _decompressBody(buffer: Buffer, isCompressed?: boolean): Buffer {
    if (!isCompressed || !this.enableCompression) {
      return buffer;
    }

    try {
      return zlib.gunzipSync(buffer);
    } catch (error) {
      this.logger.warn({ error: (error as Error).message }, 'Decompression failed, returning raw buffer');
      return buffer;
    }
  }

  getStats(): FileSystemStorageStats | null {
    if (!this.enableStats) {
      return null;
    }

    const avgCompressionRatio = this.stats.totalUncompressed > 0
      ? (this.stats.totalCompressed / this.stats.totalUncompressed).toFixed(3)
      : 1.0;

    return {
      ...this.stats,
      avgCompressionRatio,
      features: {
        compression: this.enableCompression,
        ttl: this.enableTTL,
        locking: this.enableLocking,
        backup: this.enableBackup,
        journal: this.enableJournal,
        stats: this.enableStats
      }
    };
  }

  private _mapFilesystemError(error: Error, context: { key?: string; path?: string; operation?: string } = {}): Error {
    const { key, path: filePath, operation } = context;
    const errnoError = error as NodeJS.ErrnoException;

    switch (errnoError.code) {
      case 'ENOENT':
        const err = new ResourceError(`Object not found: ${key || filePath}`, {
          bucket: this.bucket,
          key,
          path: filePath,
          code: 'NoSuchKey',
          statusCode: 404,
          retriable: false,
          suggestion: 'Ensure the key exists before attempting to read it.',
          original: error
        });
        err.name = 'NoSuchKey';
        return err;

      case 'EACCES':
      case 'EPERM':
        return new ResourceError(`Permission denied: ${key || filePath}`, {
          bucket: this.bucket,
          key,
          path: filePath,
          code: 'AccessDenied',
          statusCode: 403,
          retriable: false,
          suggestion: 'Check filesystem permissions for the basePath directory.',
          original: error
        });

      case 'ENOSPC':
        return new ResourceError('No space left on device', {
          bucket: this.bucket,
          key,
          path: filePath,
          code: 'ServiceUnavailable',
          statusCode: 503,
          retriable: true,
          suggestion: 'Free up disk space and retry the operation.',
          original: error
        });

      case 'EISDIR':
      case 'ENOTDIR':
        return new ResourceError(`Invalid object state: ${errnoError.message}`, {
          bucket: this.bucket,
          key,
          path: filePath,
          code: 'InvalidObjectState',
          statusCode: 400,
          retriable: false,
          suggestion: 'The key conflicts with a directory. Use a different key.',
          original: error
        });

      case 'ENAMETOOLONG':
        return new ResourceError('Key too long for filesystem', {
          bucket: this.bucket,
          key,
          path: filePath,
          code: 'KeyTooLongError',
          statusCode: 400,
          retriable: false,
          suggestion: 'Shorten the key or partition names to fit within OS path limits.',
          original: error
        });

      case 'EMFILE':
      case 'ENFILE':
        return new ResourceError('Too many open files', {
          bucket: this.bucket,
          key,
          path: filePath,
          code: 'ServiceUnavailable',
          statusCode: 503,
          retriable: true,
          suggestion: 'Reduce concurrent operations or increase system file descriptor limit.',
          original: error
        });

      default:
        return new ResourceError(`Filesystem error: ${errnoError.message}`, {
          bucket: this.bucket,
          key,
          path: filePath,
          code: errnoError.code || 'InternalError',
          statusCode: 500,
          retriable: false,
          suggestion: 'Check filesystem state and retry.',
          original: error
        });
    }
  }

  async put(key: string, params: StoragePutParams & { ttl?: number }): Promise<PutObjectResponse> {
    const { body, metadata, contentType, contentEncoding, contentLength, ifMatch, ifNoneMatch, ttl } = params;

    await this._acquireLock(key);

    try {
      this._validateLimits(body, metadata);

      const objectPath = this._getObjectPath(key);
      const metaPath = this._getMetadataPath(key);

      const exists = existsSync(objectPath);

      if (ifMatch !== undefined) {
        if (!exists) {
          throw new ResourceError(`Precondition failed: object does not exist for key "${key}"`, {
            bucket: this.bucket,
            key,
            code: 'PreconditionFailed',
            statusCode: 412,
            retriable: false,
            suggestion: 'Fetch the latest object and retry with the current ETag in options.ifMatch.'
          });
        }

        const currentMeta = await this._readMetadata(key);
        const expectedEtags = this._normalizeEtagHeader(ifMatch);
        const matches = expectedEtags.includes(currentMeta.etag);

        if (!matches) {
          throw new ResourceError(`Precondition failed: ETag mismatch for key "${key}"`, {
            bucket: this.bucket,
            key,
            code: 'PreconditionFailed',
            statusCode: 412,
            retriable: false,
            suggestion: 'Fetch the latest object and retry with the current ETag in options.ifMatch.'
          });
        }
      }

      if (ifNoneMatch !== undefined) {
        if (ifNoneMatch === '*' && exists) {
          throw new ResourceError(`Precondition failed: object already exists for key "${key}"`, {
            bucket: this.bucket,
            key,
            code: 'PreconditionFailed',
            statusCode: 412,
            retriable: false,
            suggestion: 'Use ifNoneMatch: "*" only when the object should not exist or remove the conditional header.'
          });
        }

        if (exists && ifNoneMatch !== '*') {
          const currentMeta = await this._readMetadata(key);
          const normalized = this._normalizeEtagHeader(ifNoneMatch);
          if (normalized.includes(currentMeta.etag)) {
            throw new ResourceError(`Precondition failed: ETag matches for key "${key}"`, {
              bucket: this.bucket,
              key,
              code: 'PreconditionFailed',
              statusCode: 412,
              retriable: false,
              suggestion: 'Remove ifNoneMatch header if you want to overwrite the object.'
            });
          }
        }
      }

      await this._createBackup(objectPath);

      const compressionResult = this._compressBody(body);
      const buffer = compressionResult.buffer;
      const etag = this._generateETag(buffer);
      const lastModified = new Date().toISOString();
      const size = buffer.length;

      const effectiveTTL = ttl ?? (this.enableTTL ? this.defaultTTL : null);
      const expiresAt = effectiveTTL ? Date.now() + effectiveTTL : null;

      const [okBody, errBody] = await tryFn(() => this._writeAtomic(objectPath, buffer));
      if (!okBody) {
        if (this.enableStats) this.stats.errors++;
        throw this._mapFilesystemError(errBody as Error, { key, path: objectPath, operation: 'put' });
      }

      const metaData: StorageObjectData = {
        metadata: metadata ? { ...metadata } : {},
        contentType: contentType || 'application/octet-stream',
        etag,
        lastModified,
        size,
        contentEncoding,
        contentLength: typeof contentLength === 'number' ? contentLength : size,
        compressed: compressionResult.compressed || false,
        originalSize: compressionResult.originalSize,
        compressionRatio: compressionResult.compressionRatio,
        expiresAt,
        body: buffer
      };

      const [okMeta, errMeta] = await tryFn(() => this._writeMetadata(key, metaData));
      if (!okMeta) {
        await tryFn(() => unlink(objectPath));
        if (this.enableStats) this.stats.errors++;
        throw this._mapFilesystemError(errMeta as Error, { key, path: metaPath, operation: 'put' });
      }

      await this._journalOperation('put', key, {
        size,
        compressed: compressionResult.compressed,
        expiresAt
      });

      if (this.enableStats) {
        this.stats.puts++;
      }

      const info = [
        `${size} bytes`,
        `etag: ${etag}`
      ];
      if (compressionResult.compressed) {
        info.push(`compressed: ${compressionResult.originalSize}→${size} (${compressionResult.compressionRatio}x)`);
      }
      if (expiresAt) {
        info.push(`ttl: ${effectiveTTL}ms`);
      }
      this.logger.debug({ key, size, etag, compressed: compressionResult.compressed, ttl: effectiveTTL }, `PUT ${key} (${info.join(', ')})`);

      return {
        ETag: this._formatEtag(etag),
        VersionId: null,
        ServerSideEncryption: null,
        Location: `/${this.bucket}/${key}`
      };
    } finally {
      this._releaseLock(key);
    }
  }

  async get(key: string): Promise<S3Object> {
    const objectPath = this._getObjectPath(key);
    const metaPath = this._getMetadataPath(key);

    const [okMeta, errMeta, metaData] = await tryFn<StorageObjectData>(() => this._readMetadata(key));
    if (!okMeta) {
      throw this._mapFilesystemError(errMeta as Error, { key, path: metaPath, operation: 'get' });
    }

    const metadata = metaData as StorageObjectData;

    if (this.enableTTL && metadata.expiresAt && metadata.expiresAt < Date.now()) {
      await this.delete(key);
      throw this._mapFilesystemError(
        { code: 'ENOENT', message: 'Object has expired' } as NodeJS.ErrnoException,
        { key, path: objectPath, operation: 'get' }
      );
    }

    const [okBody, errBody, bodyBuffer] = await tryFn<Buffer>(() => readFile(objectPath));
    if (!okBody) {
      if (this.enableStats) this.stats.errors++;
      throw this._mapFilesystemError(errBody as Error, { key, path: objectPath, operation: 'get' });
    }

    const finalBuffer = this._decompressBody(bodyBuffer as Buffer, metadata.compressed);

    if (this.enableStats) {
      this.stats.gets++;
    }

    const info = [`${metadata.size} bytes`];
    if (metadata.compressed) {
      info.push(`decompressed: ${metadata.size}→${finalBuffer.length}`);
    }
    this.logger.debug({ key, size: metadata.size, compressed: metadata.compressed }, `GET ${key} (${info.join(', ')})`);

    const bodyStream = Readable.from(finalBuffer) as S3Object['Body'];

    bodyStream!.transformToString = async (encoding: string = 'utf-8') => {
      const chunks: Buffer[] = [];
      for await (const chunk of bodyStream!) {
        chunks.push(chunk as Buffer);
      }
      return Buffer.concat(chunks).toString(encoding as BufferEncoding);
    };

    bodyStream!.transformToByteArray = async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of bodyStream!) {
        chunks.push(chunk as Buffer);
      }
      return new Uint8Array(Buffer.concat(chunks));
    };

    bodyStream!.transformToWebStream = () => {
      return Readable.toWeb(bodyStream as Readable) as ReadableStream;
    };

    return {
      Body: bodyStream,
      Metadata: { ...metadata.metadata },
      ContentType: metadata.contentType,
      ContentLength: finalBuffer.length,
      ETag: this._formatEtag(metadata.etag),
      LastModified: new Date(metadata.lastModified),
      ContentEncoding: metadata.contentEncoding
    };
  }

  async head(key: string): Promise<Omit<S3Object, 'Body'>> {
    const metaPath = this._getMetadataPath(key);

    const [ok, err, metaData] = await tryFn<StorageObjectData>(() => this._readMetadata(key));
    if (!ok) {
      throw this._mapFilesystemError(err as Error, { key, path: metaPath, operation: 'head' });
    }

    const metadata = metaData as StorageObjectData;

    this.logger.debug({ key }, `HEAD ${key}`);

    return {
      Metadata: { ...metadata.metadata },
      ContentType: metadata.contentType,
      ContentLength: metadata.size,
      ETag: this._formatEtag(metadata.etag),
      LastModified: new Date(metadata.lastModified),
      ContentEncoding: metadata.contentEncoding
    };
  }

  async copy(from: string, to: string, params: StorageCopyParams): Promise<CopyObjectResponse> {
    const { metadata, metadataDirective, contentType } = params;
    const sourceObjectPath = this._getObjectPath(from);
    const sourceMetaPath = this._getMetadataPath(from);

    if (!existsSync(sourceObjectPath)) {
      throw new ResourceError(`Source object not found: ${from}`, {
        bucket: this.bucket,
        key: from,
        code: 'NoSuchKey',
        statusCode: 404,
        retriable: false,
        suggestion: 'Copy requires an existing source object. Verify the source key before retrying.'
      });
    }

    const sourceMeta = await this._readMetadata(from);

    let finalMetadata = { ...sourceMeta.metadata };
    if (metadataDirective === 'REPLACE' && metadata) {
      finalMetadata = metadata;
    } else if (metadata) {
      finalMetadata = { ...finalMetadata, ...metadata };
    }

    const destObjectPath = this._getObjectPath(to);
    await this._ensureDirectory(destObjectPath);
    const [okCopy, errCopy] = await tryFn(() => copyFile(sourceObjectPath, destObjectPath));
    if (!okCopy) {
      throw this._mapFilesystemError(errCopy as Error, { key: to, path: destObjectPath, operation: 'copy' });
    }

    const destMeta: StorageObjectData = {
      metadata: finalMetadata,
      contentType: contentType || sourceMeta.contentType,
      etag: sourceMeta.etag,
      lastModified: new Date().toISOString(),
      size: sourceMeta.size,
      contentEncoding: sourceMeta.contentEncoding,
      contentLength: sourceMeta.contentLength,
      body: sourceMeta.body
    };

    await this._writeMetadata(to, destMeta);

    this.logger.debug({ from, to }, `COPY ${from} → ${to}`);

    return {
      CopyObjectResult: {
        ETag: this._formatEtag(destMeta.etag),
        LastModified: destMeta.lastModified
      },
      BucketKeyEnabled: false,
      VersionId: null,
      ServerSideEncryption: null
    };
  }

  async delete(key: string): Promise<DeleteObjectResponse> {
    const objectPath = this._getObjectPath(key);
    const metaPath = this._getMetadataPath(key);

    await tryFn(() => unlink(objectPath));
    await tryFn(() => unlink(metaPath));

    if (this.enableBackup) {
      const backupPath = objectPath + this.backupSuffix;
      await tryFn(() => unlink(backupPath));
    }

    await this._journalOperation('delete', key);

    if (this.enableStats) {
      this.stats.deletes++;
    }

    this.logger.debug({ key }, `DELETE ${key}`);

    return {
      DeleteMarker: false,
      VersionId: null
    };
  }

  async deleteMultiple(keys: string[]): Promise<DeleteObjectsResponse> {
    const deleted: Array<{ Key: string }> = [];
    const errors: Array<{ Key: string; Code: string; Message: string }> = [];

    for (const key of keys) {
      try {
        await this.delete(key);
        deleted.push({ Key: key });
      } catch (error) {
        const err = error as Error;
        errors.push({
          Key: key,
          Code: err.name || 'InternalError',
          Message: err.message
        });
      }
    }

    this.logger.debug({ deletedCount: deleted.length, errorCount: errors.length }, `DELETE BATCH (${deleted.length} deleted, ${errors.length} errors)`);

    return { Deleted: deleted, Errors: errors };
  }

  private async *_walkDirectory(dirPath: string, prefix: string = ''): AsyncGenerator<FileEntry> {
    let entries: Dirent[];

    try {
      entries = await readdir(dirPath, { withFileTypes: true }) as unknown as Dirent[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const files: Array<{ entry: typeof entries[0]; fullPath: string }> = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        yield* this._walkDirectory(fullPath, prefix);
      } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
        files.push({ entry, fullPath });
      }
    }

    const fileBatches = chunk(files, 50);

    for (const batch of fileBatches) {
      const promises = batch.map(async ({ entry, fullPath }) => {
        const key = this._pathToKey(fullPath);

        if (!prefix || key.startsWith(prefix)) {
          const [ok, , stats] = await tryFn<Stats>(() => stat(fullPath));
          if (ok) {
            return {
              key,
              path: fullPath,
              size: (stats as Stats).size,
              mtime: (stats as Stats).mtime
            };
          }
        }
        return null;
      });

      const results = await Promise.all(promises);

      for (const res of results) {
        if (res) yield res;
      }
    }
  }

  async list(params: StorageListParams): Promise<ListObjectsResponse> {
    const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
    const prefixFilter = prefix || '';
    this.logger.debug({ prefix, delimiter, maxKeys, continuationToken, startAfter }, '[FileSystemStorage.list] Initial params');

    const startPath = prefixFilter ? this._keyToPath(prefixFilter) : this.basePath;
    this.logger.debug({ startPath, prefixFilter }, '[FileSystemStorage.list] Derived startPath');
    let searchPath: string;
    try {
      const startStats = await stat(startPath);
      searchPath = startStats.isDirectory() ? startPath : path.dirname(startPath);
      this.logger.debug({ startPath, searchPath, isDirectory: startStats.isDirectory() }, '[FileSystemStorage.list] stat success');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug({ startPath, error: (err as Error).message }, '[FileSystemStorage.list] startPath does not exist, searching parent');
        searchPath = path.dirname(startPath);
      } else {
        this.logger.error({ error: (err as Error).message }, '[FileSystemStorage.list] Error stating startPath');
        throw err;
      }
    }
    this.logger.debug({ searchPath }, '[FileSystemStorage.list] Final searchPath');

    const allKeys: FileEntry[] = [];

    for await (const entry of this._walkDirectory(searchPath, prefixFilter)) {
      allKeys.push(entry);
    }
    this.logger.debug({ count: allKeys.length, keys: allKeys.map(k => k.key) }, '[FileSystemStorage.list] Keys from _walkDirectory');

    allKeys.sort((a, b) => a.key.localeCompare(b.key));

    let startAfterKey: string | null = null;
    if (continuationToken) {
      startAfterKey = this._decodeContinuationToken(continuationToken);
    } else if (startAfter) {
      startAfterKey = startAfter;
    }

    let filteredKeys = startAfterKey
      ? allKeys.filter(entry => entry.key > startAfterKey!)
      : allKeys;

    const contents: Array<{ Key: string; Size: number; LastModified: Date; ETag: string; StorageClass: string }> = [];
    const commonPrefixes = new Set<string>();
    let processed = 0;
    let lastKeyInPage: string | null = null;

    for (const entry of filteredKeys) {
      if (processed >= maxKeys) {
        break;
      }

      const prefixEntry = delimiter ? this._extractCommonPrefix(prefixFilter, delimiter, entry.key) : null;
      if (prefixEntry) {
        if (!commonPrefixes.has(prefixEntry)) {
          commonPrefixes.add(prefixEntry);
        }
        continue;
      }

      const [ok, , metaData] = await tryFn<StorageObjectData>(() => this._readMetadata(entry.key));
      const etag = ok ? (metaData as StorageObjectData).etag : this._generateETag(Buffer.alloc(0));

      contents.push({
        Key: entry.key,
        Size: entry.size,
        LastModified: new Date(entry.mtime),
        ETag: this._formatEtag(etag),
        StorageClass: 'STANDARD'
      });
      processed++;
      lastKeyInPage = entry.key;
    }

    const hasMoreKeys = filteredKeys.length > contents.length;
    const nextContinuationToken = hasMoreKeys && lastKeyInPage
      ? this._encodeContinuationToken(lastKeyInPage)
      : null;

    this.logger.debug({ prefix, objectCount: contents.length, prefixCount: commonPrefixes.size, truncated: Boolean(nextContinuationToken) }, `LIST prefix="${prefix}" (${contents.length} objects, ${commonPrefixes.size} prefixes, truncated=${Boolean(nextContinuationToken)})`);

    return {
      Contents: contents,
      CommonPrefixes: Array.from(commonPrefixes).map(commonPrefix => ({ Prefix: commonPrefix })),
      IsTruncated: Boolean(nextContinuationToken),
      ContinuationToken: continuationToken || undefined,
      NextContinuationToken: nextContinuationToken,
      KeyCount: contents.length,
      MaxKeys: maxKeys,
      Prefix: prefix || undefined,
      Delimiter: delimiter || undefined,
      StartAfter: startAfter || undefined
    };
  }

  exists(key: string): boolean {
    const objectPath = this._getObjectPath(key);
    return existsSync(objectPath);
  }

  async clear(): Promise<void> {
    if (!this.basePath.includes('s3db') && !this.basePath.includes('data')) {
      throw new ValidationError('Cannot clear basePath - does not look like a data directory', {
        basePath: this.basePath,
        retriable: false,
        suggestion: 'Only directories with "s3db" or "data" in the path can be cleared for safety.'
      });
    }

    const { rm } = await import('fs/promises');
    await tryFn(() => rm(this.basePath, { recursive: true, force: true }));
    await this._ensureDirectory(this.basePath);

    this.logger.debug({ basePath: this.basePath }, `Cleared all objects from ${this.basePath}`);
  }

  destroy(): void {
    if (this.cleanupJobName) {
      this.cronManager.stop(this.cleanupJobName);
      this.cleanupJobName = null;
    }

    this.logger.debug('Destroyed (cleanup stopped)');
  }
}

export default FileSystemStorage;
