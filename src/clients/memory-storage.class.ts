import { createHash } from 'crypto';
import { writeFile, readFile } from 'fs/promises';
import { Readable } from 'stream';

import { tryFn } from '../concerns/try-fn.js';
import { MetadataLimitError, ResourceError, ValidationError } from '../errors.js';
import { createLogger } from '../concerns/logger.js';
import type { LogLevel } from '../types/common.types.js';
import type {
  Logger,
  MemoryStorageConfig,
  MemoryStorageStats,
  StorageObjectData,
  StoragePutParams,
  StorageCopyParams,
  StorageListParams,
  StorageSnapshot,
  S3Object,
  PutObjectResponse,
  CopyObjectResponse,
  DeleteObjectResponse,
  DeleteObjectsResponse,
  ListObjectsResponse
} from './types.js';

interface InternalStats {
  evictions: number;
  evictedBytes: number;
  peakMemoryBytes: number;
}

export class MemoryStorage {
  private objects: Map<string, StorageObjectData>;
  private bucket: string;
  private enforceLimits: boolean;
  private metadataLimit: number;
  private maxObjectSize: number;
  private persistPath?: string;
  private autoPersist: boolean;
  private logLevel: string;
  private maxMemoryMB: number;
  private maxMemoryBytes: number;
  private currentMemoryBytes: number;
  private evictionEnabled: boolean;
  private _stats: InternalStats;
  private logger: Logger;

  constructor(config: MemoryStorageConfig = {}) {
    this.objects = new Map();

    this.bucket = config.bucket || 's3db';
    this.enforceLimits = Boolean(config.enforceLimits);
    this.metadataLimit = config.metadataLimit ?? 2048;
    this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024;
    this.persistPath = config.persistPath;
    this.autoPersist = Boolean(config.autoPersist);
    this.logLevel = config.logLevel || 'info';

    this.maxMemoryMB = config.maxMemoryMB ?? 512;
    this.maxMemoryBytes = this.maxMemoryMB * 1024 * 1024;
    this.currentMemoryBytes = 0;
    this.evictionEnabled = config.evictionEnabled !== false;

    this._stats = {
      evictions: 0,
      evictedBytes: 0,
      peakMemoryBytes: 0
    };

    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = createLogger({ name: 'MemoryStorage', level: this.logLevel as LogLevel });
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
      throw new MetadataLimitError('Metadata limit exceeded in memory storage', {
        bucket: this.bucket,
        totalSize: metadataSize,
        effectiveLimit: this.metadataLimit,
        operation: 'put',
        retriable: false,
        suggestion: 'Reduce metadata size or disable enforceLimits in MemoryClient configuration.'
      });
    }

    const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength((body as string) || '', 'utf8');
    if (bodySize > this.maxObjectSize) {
      throw new ResourceError('Object size exceeds in-memory limit', {
        bucket: this.bucket,
        operation: 'put',
        size: bodySize,
        maxObjectSize: this.maxObjectSize,
        statusCode: 413,
        retriable: false,
        suggestion: 'Store smaller objects or increase maxObjectSize when instantiating MemoryClient.'
      });
    }
  }

  async put(key: string, params: StoragePutParams): Promise<PutObjectResponse> {
    const { body, metadata, contentType, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;

    this._validateLimits(body, metadata);

    const existing = this.objects.get(key);
    if (ifMatch !== undefined) {
      const expectedEtags = this._normalizeEtagHeader(ifMatch);
      const currentEtag = existing ? existing.etag : null;
      const matches = expectedEtags.length > 0 && currentEtag ? expectedEtags.includes(currentEtag) : false;

      if (!existing || !matches) {
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
      const normalized = this._normalizeEtagHeader(ifNoneMatch);
      const targetValue = existing ? existing.etag : null;
      const shouldFail =
        (ifNoneMatch === '*' && Boolean(existing)) ||
        (normalized.length > 0 && existing && targetValue && normalized.includes(targetValue));

      if (shouldFail) {
        throw new ResourceError(`Precondition failed: object already exists for key "${key}"`, {
          bucket: this.bucket,
          key,
          code: 'PreconditionFailed',
          statusCode: 412,
          retriable: false,
          suggestion: 'Use ifNoneMatch: "*" only when the object should not exist or remove the conditional header.'
        });
      }
    }

    const buffer = this._toBuffer(body);
    const etag = this._generateETag(buffer);
    const lastModified = new Date().toISOString();
    const size = buffer.length;

    const existingSize = existing ? existing.size : 0;
    const memoryDelta = size - existingSize;

    this._evictIfNeeded(memoryDelta > 0 ? memoryDelta : 0);

    const objectData: StorageObjectData = {
      body: buffer,
      metadata: metadata ? { ...metadata } : {},
      contentType: contentType || 'application/octet-stream',
      etag,
      lastModified,
      size,
      contentEncoding,
      contentLength: typeof contentLength === 'number' ? contentLength : size
    };

    this.objects.set(key, objectData);

    this._trackMemory(memoryDelta);

    this.logger.debug({ key, size, etag }, `PUT ${key} (${size} bytes, etag: ${etag})`);

    if (this.autoPersist && this.persistPath) {
      await this.saveToDisk();
    }

    return {
      ETag: this._formatEtag(etag),
      VersionId: null,
      ServerSideEncryption: null,
      Location: `/${this.bucket}/${key}`
    };
  }

  async get(key: string): Promise<S3Object> {
    const obj = this.objects.get(key);

    if (!obj) {
      const error = new ResourceError(`Object not found: ${key}`, {
        bucket: this.bucket,
        key,
        code: 'NoSuchKey',
        statusCode: 404,
        retriable: false,
        suggestion: 'Ensure the key exists before attempting to read it.'
      });
      error.name = 'NoSuchKey';
      throw error;
    }

    this._touchKey(key);

    this.logger.debug({ key, size: obj.size }, `GET ${key} (${obj.size} bytes)`);

    const bodyStream = Readable.from(obj.body) as S3Object['Body'];

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
      Metadata: { ...obj.metadata },
      ContentType: obj.contentType,
      ContentLength: obj.size,
      ETag: this._formatEtag(obj.etag),
      LastModified: new Date(obj.lastModified),
      ContentEncoding: obj.contentEncoding
    };
  }

  async head(key: string): Promise<Omit<S3Object, 'Body'>> {
    const obj = this.objects.get(key);

    if (!obj) {
      const error = new ResourceError(`Object not found: ${key}`, {
        bucket: this.bucket,
        key,
        code: 'NoSuchKey',
        statusCode: 404,
        retriable: false,
        suggestion: 'Ensure the key exists before attempting to read it.'
      });
      error.name = 'NoSuchKey';
      throw error;
    }

    this._touchKey(key);

    this.logger.debug({ key }, `HEAD ${key}`);

    return {
      Metadata: { ...obj.metadata },
      ContentType: obj.contentType,
      ContentLength: obj.size,
      ETag: this._formatEtag(obj.etag),
      LastModified: new Date(obj.lastModified),
      ContentEncoding: obj.contentEncoding
    };
  }

  async copy(from: string, to: string, params: StorageCopyParams): Promise<CopyObjectResponse> {
    const { metadata, metadataDirective, contentType } = params;
    const source = this.objects.get(from);

    if (!source) {
      throw new ResourceError(`Source object not found: ${from}`, {
        bucket: this.bucket,
        key: from,
        code: 'NoSuchKey',
        statusCode: 404,
        retriable: false,
        suggestion: 'Copy requires an existing source object. Verify the source key before retrying.'
      });
    }

    let finalMetadata = { ...source.metadata };
    if (metadataDirective === 'REPLACE' && metadata) {
      finalMetadata = metadata;
    } else if (metadata) {
      finalMetadata = { ...finalMetadata, ...metadata };
    }

    await this.put(to, {
      body: source.body,
      metadata: finalMetadata,
      contentType: contentType || source.contentType,
      contentEncoding: source.contentEncoding
    });

    this.logger.debug({ from, to }, `COPY ${from} → ${to}`);

    const destination = this.objects.get(to)!;
    return {
      CopyObjectResult: {
        ETag: this._formatEtag(destination.etag),
        LastModified: new Date(destination.lastModified).toISOString()
      },
      BucketKeyEnabled: false,
      VersionId: null,
      ServerSideEncryption: null
    };
  }

  exists(key: string): boolean {
    return this.objects.has(key);
  }

  async delete(key: string): Promise<DeleteObjectResponse> {
    const obj = this.objects.get(key);
    const existed = Boolean(obj);

    if (obj) {
      this._trackMemory(-obj.size);
    }

    this.objects.delete(key);

    this.logger.debug({ key, existed }, `DELETE ${key} (existed: ${existed})`);

    if (this.autoPersist && this.persistPath) {
      await this.saveToDisk();
    }

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

  async list(params: StorageListParams): Promise<ListObjectsResponse> {
    const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
    const sortedKeys = Array.from(this.objects.keys()).sort();
    const prefixFilter = prefix || '';

    let filteredKeys = prefixFilter
      ? sortedKeys.filter(key => key.startsWith(prefixFilter))
      : sortedKeys;

    let startAfterKey: string | null = null;
    if (continuationToken) {
      startAfterKey = this._decodeContinuationToken(continuationToken);
    } else if (startAfter) {
      startAfterKey = startAfter;
    }

    if (startAfterKey) {
      filteredKeys = filteredKeys.filter(key => key > startAfterKey!);
    }

    const contents: Array<{ Key: string; Size: number; LastModified: Date; ETag: string; StorageClass: string }> = [];
    const commonPrefixes = new Set<string>();
    let processed = 0;
    let lastKeyInPage: string | null = null;

    for (const key of filteredKeys) {
      if (processed >= maxKeys) {
        break;
      }

      const prefixEntry = delimiter ? this._extractCommonPrefix(prefixFilter, delimiter, key) : null;
      if (prefixEntry) {
        if (!commonPrefixes.has(prefixEntry)) {
          commonPrefixes.add(prefixEntry);
        }
        continue;
      }

      const obj = this.objects.get(key)!;
      contents.push({
        Key: key,
        Size: obj.size,
        LastModified: new Date(obj.lastModified),
        ETag: this._formatEtag(obj.etag),
        StorageClass: 'STANDARD'
      });
      processed++;
      lastKeyInPage = key;
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

  snapshot(): StorageSnapshot {
    const snapshot: StorageSnapshot = {
      timestamp: new Date().toISOString(),
      bucket: this.bucket,
      objectCount: this.objects.size,
      objects: {}
    };

    for (const [key, obj] of this.objects.entries()) {
      snapshot.objects[key] = {
        body: obj.body.toString('base64'),
        metadata: obj.metadata,
        contentType: obj.contentType,
        etag: obj.etag,
        lastModified: obj.lastModified,
        size: obj.size,
        contentEncoding: obj.contentEncoding,
        contentLength: obj.contentLength
      };
    }

    return snapshot;
  }

  restore(snapshot: StorageSnapshot): void {
    if (!snapshot || !snapshot.objects) {
      throw new ValidationError('Invalid snapshot format', {
        field: 'snapshot',
        retriable: false,
        suggestion: 'Provide the snapshot returned by MemoryStorage.snapshot() before calling restore().'
      });
    }

    this.objects.clear();
    this.currentMemoryBytes = 0;

    let totalBytes = 0;
    for (const [key, obj] of Object.entries(snapshot.objects)) {
      const body = Buffer.from(obj.body, 'base64');
      totalBytes += body.length;

      this.objects.set(key, {
        body,
        metadata: obj.metadata,
        contentType: obj.contentType,
        etag: obj.etag,
        lastModified: obj.lastModified,
        size: obj.size,
        contentEncoding: obj.contentEncoding,
        contentLength: obj.contentLength
      });
    }

    this._trackMemory(totalBytes);

    this.logger.debug({ objectCount: this.objects.size }, `Restored snapshot with ${this.objects.size} objects`);
  }

  async saveToDisk(customPath?: string): Promise<string> {
    const path = customPath || this.persistPath;
    if (!path) {
      throw new ValidationError('No persist path configured', {
        field: 'persistPath',
        retriable: false,
        suggestion: 'Provide a persistPath when creating MemoryClient or pass a custom path to saveToDisk().'
      });
    }

    const snapshot = this.snapshot();
    const json = JSON.stringify(snapshot, null, 2);

    const [ok, err] = await tryFn(() => writeFile(path, json, 'utf-8'));

    if (!ok) {
      throw new ResourceError(`Failed to save to disk: ${(err as Error).message}`, {
        bucket: this.bucket,
        operation: 'saveToDisk',
        statusCode: 500,
        retriable: false,
        suggestion: 'Check filesystem permissions and available disk space, then retry.',
        original: err
      });
    }

    this.logger.debug({ objectCount: this.objects.size, path }, `Saved ${this.objects.size} objects to ${path}`);

    return path;
  }

  async loadFromDisk(customPath?: string): Promise<StorageSnapshot> {
    const path = customPath || this.persistPath;
    if (!path) {
      throw new ValidationError('No persist path configured', {
        field: 'persistPath',
        retriable: false,
        suggestion: 'Provide a persistPath when creating MemoryClient or pass a custom path to loadFromDisk().'
      });
    }

    const [ok, err, json] = await tryFn<string>(() => readFile(path, 'utf-8'));

    if (!ok) {
      throw new ResourceError(`Failed to load from disk: ${(err as Error).message}`, {
        bucket: this.bucket,
        operation: 'loadFromDisk',
        statusCode: 500,
        retriable: false,
        suggestion: 'Verify the file exists and is readable, then retry.',
        original: err
      });
    }

    const snapshot = JSON.parse(json as string) as StorageSnapshot;
    this.restore(snapshot);

    this.logger.debug({ objectCount: this.objects.size, path }, `Loaded ${this.objects.size} objects from ${path}`);

    return snapshot;
  }

  getStats(): MemoryStorageStats {
    return {
      objectCount: this.objects.size,
      totalSize: this.currentMemoryBytes,
      totalSizeFormatted: this._formatBytes(this.currentMemoryBytes),
      keys: this.getKeys(),
      bucket: this.bucket,
      maxMemoryMB: this.maxMemoryMB,
      memoryUsagePercent: this.maxMemoryBytes > 0
        ? Math.round((this.currentMemoryBytes / this.maxMemoryBytes) * 100)
        : 0,
      evictions: this._stats.evictions,
      evictedBytes: this._stats.evictedBytes,
      peakMemoryBytes: this._stats.peakMemoryBytes
    };
  }

  getKeys(): string[] {
    return Array.from(this.objects.keys()).sort();
  }

  private _formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  private _trackMemory(deltaBytes: number): void {
    this.currentMemoryBytes += deltaBytes;
    if (this.currentMemoryBytes > this._stats.peakMemoryBytes) {
      this._stats.peakMemoryBytes = this.currentMemoryBytes;
    }
  }

  private _touchKey(key: string): void {
    const obj = this.objects.get(key);
    if (obj) {
      this.objects.delete(key);
      this.objects.set(key, obj);
    }
  }

  private _evictIfNeeded(requiredBytes: number = 0): number {
    if (!this.evictionEnabled) return 0;

    const targetBytes = this.maxMemoryBytes;
    const neededSpace = this.currentMemoryBytes + requiredBytes;

    if (neededSpace <= targetBytes) return 0;

    let evictedBytes = 0;
    const keysToEvict: string[] = [];

    for (const [key, obj] of this.objects) {
      if (this.currentMemoryBytes - evictedBytes + requiredBytes <= targetBytes) {
        break;
      }
      keysToEvict.push(key);
      evictedBytes += obj.size;
    }

    for (const key of keysToEvict) {
      const obj = this.objects.get(key);
      if (obj) {
        this.objects.delete(key);
        this._stats.evictions++;
        this._stats.evictedBytes += obj.size;
      }
    }

    this.currentMemoryBytes -= evictedBytes;

    if (keysToEvict.length > 0) {
      this.logger.debug(
        { evicted: keysToEvict.length, bytes: evictedBytes },
        `LRU evicted ${keysToEvict.length} objects (${this._formatBytes(evictedBytes)})`
      );
    }

    return evictedBytes;
  }

  clear(): void {
    this.objects.clear();
    this.currentMemoryBytes = 0;
    this.logger.debug('Cleared all objects');
  }

  resetStats(): void {
    this._stats = {
      evictions: 0,
      evictedBytes: 0,
      peakMemoryBytes: this.currentMemoryBytes
    };
  }
}

export default MemoryStorage;
