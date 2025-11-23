/**
 * FileSystemStorage - Filesystem-based Storage Engine for FileSystem Client
 *
 * Stores S3 objects persistently on the local filesystem using hierarchical directory structure.
 * Uses sidecar .meta.json files for metadata storage (cross-platform compatible).
 *
 * Enhanced Features (from best filesystem plugins):
 * - Compression: gzip compression with configurable threshold
 * - TTL: Automatic expiration with cleanup intervals
 * - Stats: Performance tracking (gets, puts, deletes, compression ratio)
 * - Locking: In-memory file locks to prevent concurrent access issues
 * - Journal: Append-only operation log for auditing
 * - Backup: Automatic .bak files before overwrite
 */

import { createHash } from 'crypto';
import { mkdir, writeFile, readFile, unlink, stat, readdir, rename, copyFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { platform } from 'os';
import zlib from 'zlib';

import tryFn from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { MetadataLimitError, ResourceError, ValidationError } from '../errors.js';
import { getCronManager } from '../concerns/cron-manager.js';
import { createLogger } from '../concerns/logger.js';

export class FileSystemStorage {
  constructor(config = {}) {
    // Base Configuration
    this.basePath = config.basePath || './s3db-data';
    this.bucket = config.bucket || 's3db';
    this.enforceLimits = Boolean(config.enforceLimits);
    this.metadataLimit = config.metadataLimit ?? 2048; // 2KB like S3
    this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024; // 5GB
    this.logLevel = config.logLevel || 'info';

    // ✨ Compression Configuration (verticalizado - v16+)
    const compressionConfig = config.compression || {};
    this.enableCompression = Boolean(compressionConfig.enabled);
    this.compressionThreshold = compressionConfig.threshold ?? 1024;
    this.compressionLevel = compressionConfig.level ?? 6;

    // ✨ TTL Configuration (verticalizado - v16+)
    const ttlConfig = config.ttl || {};
    this.enableTTL = Boolean(ttlConfig.enabled);
    this.defaultTTL = ttlConfig.defaultTTL ?? 3600000; // 1 hour
    this.cleanupInterval = ttlConfig.cleanupInterval ?? 300000; // 5 minutes

    // ✨ File Locking Configuration (verticalizado - v16+)
    const lockingConfig = config.locking || {};
    this.enableLocking = Boolean(lockingConfig.enabled);
    this.lockTimeout = lockingConfig.timeout ?? 5000; // 5 seconds

    // ✨ Backup Configuration (verticalizado - v16+)
    const backupConfig = config.backup || {};
    this.enableBackup = Boolean(backupConfig.enabled);
    this.backupSuffix = backupConfig.suffix ?? '.bak';

    // ✨ Journal Configuration (verticalizado - v16+)
    const journalConfig = config.journal || {};
    this.enableJournal = Boolean(journalConfig.enabled);
    this.journalFile = journalConfig.file ?? 'operations.journal';

    // ✨ Stats Configuration (verticalizado - v16+)
    const statsConfig = config.stats || {};
    this.enableStats = Boolean(statsConfig.enabled);

    // Platform detection for path handling
    this.isWindows = platform() === 'win32';

    // Ensure basePath is absolute
    this.basePath = path.resolve(this.basePath);

    // Initialize internal state
    this.locks = new Map(); // File locks
    this.stats = {
      gets: 0,
      puts: 0,
      deletes: 0,
      errors: 0,
      compressionSaved: 0, // Bytes saved via compression
      totalCompressed: 0,
      totalUncompressed: 0
    };

    // 🪵 Logger initialization
    if (config.logger) {
      this.logger = config.logger;
    } else {
      const logLevel = this.logLevel;
      this.logger = createLogger({ name: 'FileSystemStorage', level: logLevel });
    }

    this.cronManager = getCronManager();
    this.cleanupJobName = null;

    // Start TTL cleanup if enabled
    if (this.enableTTL && this.cleanupInterval > 0) {
      this._initCleanup();
    }

    // 🪵 Debug: initialization
    const features = [];
    if (this.enableCompression) features.push(`compression:${this.compressionThreshold}b`);
    if (this.enableTTL) features.push(`ttl:${this.defaultTTL}ms`);
    if (this.enableLocking) features.push('locking');
    if (this.enableBackup) features.push('backup');
    if (this.enableJournal) features.push('journal');
    if (this.enableStats) features.push('stats');

    this.logger.debug({ basePath: this.basePath, features }, `Initialized (basePath: ${this.basePath}${features.length ? ', features: ' + features.join(', ') : ''})`);
  }

  /**
   * Convert S3 key to filesystem path
   */
  _keyToPath(key) {
    // Normalize path separators for platform
    const normalizedKey = key.replace(/\//g, path.sep);
    return path.join(this.basePath, normalizedKey);
  }

  /**
   * Convert filesystem path back to S3 key
   */
  _pathToKey(filePath) {
    const relativePath = path.relative(this.basePath, filePath);
    // Always use forward slashes for S3 keys (platform-independent)
    return relativePath.split(path.sep).join('/');
  }

  /**
   * Get data file path for key
   */
  _getObjectPath(key) {
    return this._keyToPath(key);
  }

  /**
   * Get metadata file path for key (.meta.json sidecar)
   */
  _getMetadataPath(key) {
    return this._keyToPath(key) + '.meta.json';
  }

  /**
   * Ensure parent directory exists
   */
  async _ensureDirectory(filePath) {
    const dir = path.dirname(filePath);
    const [ok, err] = await tryFn(() => mkdir(dir, { recursive: true }));

    if (!ok && err.code !== 'EEXIST') {
      throw this._mapFilesystemError(err, { path: dir, operation: 'mkdir' });
    }
  }

  /**
   * Generate ETag (MD5 hash) for object body
   */
  _generateETag(body) {
    const buffer = this._toBuffer(body);
    return createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Convert arbitrary body input to Buffer
   */
  _toBuffer(body) {
    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (body === undefined || body === null) {
      return Buffer.alloc(0);
    }

    return Buffer.from(body);
  }

  /**
   * Ensure ETag matches AWS quoting
   */
  _formatEtag(etag) {
    return `"${etag}"`;
  }

  /**
   * Normalize ETag header value into array of hashes (quotes removed)
   */
  _normalizeEtagHeader(headerValue) {
    if (headerValue === undefined || headerValue === null) {
      return [];
    }

    return String(headerValue)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
  }

  /**
   * Encode continuation token (base64) to mimic AWS opaque tokens
   */
  _encodeContinuationToken(key) {
    return Buffer.from(String(key), 'utf8').toString('base64');
  }

  /**
   * Decode continuation token, throwing ValidationError on malformed input
   */
  _decodeContinuationToken(token) {
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

  /**
   * Identify common prefix grouping when delimiter is provided
   */
  _extractCommonPrefix(prefix, delimiter, key) {
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

  /**
   * Calculate metadata size in bytes
   */
  _calculateMetadataSize(metadata) {
    if (!metadata) return 0;

    let size = 0;
    for (const [key, value] of Object.entries(metadata)) {
      // S3 counts key + value in UTF-8 bytes
      size += Buffer.byteLength(key, 'utf8');
      size += Buffer.byteLength(String(value), 'utf8');
    }
    return size;
  }

  /**
   * Validate limits if enforceLimits is enabled
   */
  _validateLimits(body, metadata) {
    if (!this.enforceLimits) return;

    // Check metadata size
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

    // Check object size
    const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '', 'utf8');
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

  /**
   * Write file atomically using rename strategy
   * (write to .tmp file, then rename to final path)
   */
  async _writeAtomic(filePath, data) {
    await this._ensureDirectory(filePath);

    const tempPath = `${filePath}.tmp.${Date.now()}.${idGenerator(6)}`;

    try {
      await writeFile(tempPath, data);
      await rename(tempPath, filePath);
    } catch (error) {
      // Cleanup temp file if rename failed
      try {
        await unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Read metadata from .meta.json file
   */
  async _readMetadata(key) {
    const metaPath = this._getMetadataPath(key);
    const [ok, err, json] = await tryFn(() => readFile(metaPath, 'utf-8'));

    if (!ok) {
      throw this._mapFilesystemError(err, { key, path: metaPath, operation: 'readMetadata' });
    }

    return JSON.parse(json);
  }

  /**
   * Write metadata to .meta.json file
   */
  async _writeMetadata(key, metadata) {
    const metaPath = this._getMetadataPath(key);
    const json = JSON.stringify(metadata, null, 2);
    await this._writeAtomic(metaPath, json);
  }

  /**
   * ✨ Initialize TTL cleanup interval (from FilesystemCache)
   */
  _initCleanup() {
    this.cleanupJobName = `filesystem-storage-cleanup-${Date.now()}`;
    this.cronManager.scheduleInterval(
      this.cleanupInterval,
      () => {
        this._runCleanup().catch(err => {
          // 🪵 Warn: cleanup error
          this.logger.warn({ error: err.message }, 'Cleanup error');
        });
      },
      this.cleanupJobName
    );
  }

  /**
   * ✨ Run TTL cleanup (delete expired files) (from FilesystemCache)
   */
  async _runCleanup() {
    if (!this.enableTTL || this.defaultTTL <= 0) return;

    let cleaned = 0;
    const now = Date.now();

    // Walk all files and check TTL
    for await (const entry of this._walkDirectory(this.basePath)) {
      try {
        const [ok, , metaData] = await tryFn(() => this._readMetadata(entry.key));
        if (!ok) continue;

        // Check if expired
        const expiresAt = metaData.expiresAt;
        if (expiresAt && expiresAt < now) {
          await this.delete(entry.key);
          cleaned++;
        }
      } catch (err) {
        // Ignore errors during cleanup
      }
    }

    // 🪵 Debug: cleanup completed
    if (cleaned > 0) {
      this.logger.debug({ cleaned }, `Cleanup: removed ${cleaned} expired objects`);
    }
  }

  /**
   * ✨ Acquire file lock (from FilesystemCache)
   */
  async _acquireLock(key) {
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
      // Wait 10ms before retrying
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.locks.set(key, Date.now());
  }

  /**
   * ✨ Release file lock (from FilesystemCache)
   */
  _releaseLock(key) {
    if (!this.enableLocking) return;
    this.locks.delete(key);
  }

  /**
   * ✨ Journal operation (append-only log) (from FilesystemCache)
   */
  async _journalOperation(operation, key, metadata = {}) {
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

  /**
   * ✨ Create backup file (from FilesystemCache)
   */
  async _createBackup(filePath) {
    if (!this.enableBackup) return;
    if (!existsSync(filePath)) return;

    const backupPath = filePath + this.backupSuffix;
    await tryFn(() => copyFile(filePath, backupPath));
  }

  /**
   * ✨ Compress body data (from FilesystemCache)
   */
  _compressBody(body) {
    if (!this.enableCompression) {
      return { buffer: this._toBuffer(body), compressed: false };
    }

    const buffer = this._toBuffer(body);
    const originalSize = buffer.length;

    // Only compress if above threshold
    if (originalSize < this.compressionThreshold) {
      return { buffer, compressed: false, originalSize };
    }

    const compressedBuffer = zlib.gzipSync(buffer, { level: this.compressionLevel });
    const compressedSize = compressedBuffer.length;

    // Track stats
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

  /**
   * ✨ Decompress body data (from FilesystemCache)
   */
  _decompressBody(buffer, isCompressed) {
    if (!isCompressed || !this.enableCompression) {
      return buffer;
    }

    try {
      return zlib.gunzipSync(buffer);
    } catch (error) {
      // If decompression fails, return original buffer
      // 🪵 Warn: decompression failed
      this.logger.warn({ error: error.message }, 'Decompression failed, returning raw buffer');
      return buffer;
    }
  }

  /**
   * ✨ Get stats (from FilesystemCache)
   */
  getStats() {
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

  /**
   * Map filesystem errors to S3-compatible errors
   */
  _mapFilesystemError(error, context = {}) {
    const { key, path: filePath, operation } = context;

    switch (error.code) {
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
        return new ResourceError(`Invalid object state: ${error.message}`, {
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
        return new ResourceError(`Filesystem error: ${error.message}`, {
          bucket: this.bucket,
          key,
          path: filePath,
          code: error.code || 'InternalError',
          statusCode: 500,
          retriable: false,
          suggestion: 'Check filesystem state and retry.',
          original: error
        });
    }
  }

  /**
   * Store an object (✨ enhanced with compression, TTL, locking, backup, journal)
   */
  async put(key, { body, metadata, contentType, contentEncoding, contentLength, ifMatch, ifNoneMatch, ttl }) {
    // ✨ Acquire lock if enabled
    await this._acquireLock(key);

    try {
      // Validate limits
      this._validateLimits(body, metadata);

      const objectPath = this._getObjectPath(key);
      const metaPath = this._getMetadataPath(key);

      // Check ifMatch/ifNoneMatch (conditional put)
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

      // ✨ Create backup if file exists
      await this._createBackup(objectPath);

      // ✨ Compress body if enabled
      const compressionResult = this._compressBody(body);
      const buffer = compressionResult.buffer;
      const etag = this._generateETag(buffer);
      const lastModified = new Date().toISOString();
      const size = buffer.length;

      // ✨ Calculate TTL expiration
      const effectiveTTL = ttl ?? (this.enableTTL ? this.defaultTTL : null);
      const expiresAt = effectiveTTL ? Date.now() + effectiveTTL : null;

      // Write body file atomically
      const [okBody, errBody] = await tryFn(() => this._writeAtomic(objectPath, buffer));
      if (!okBody) {
        if (this.enableStats) this.stats.errors++;
        throw this._mapFilesystemError(errBody, { key, path: objectPath, operation: 'put' });
      }

      // Write metadata file atomically
      const metaData = {
        metadata: metadata ? { ...metadata } : {},
        contentType: contentType || 'application/octet-stream',
        etag,
        lastModified,
        size,
        contentEncoding,
        contentLength: typeof contentLength === 'number' ? contentLength : size,
        // ✨ Enhanced metadata
        compressed: compressionResult.compressed || false,
        originalSize: compressionResult.originalSize,
        compressionRatio: compressionResult.compressionRatio,
        expiresAt
      };

      const [okMeta, errMeta] = await tryFn(() => this._writeMetadata(key, metaData));
      if (!okMeta) {
        // Cleanup body file if metadata write failed
        await tryFn(() => unlink(objectPath));
        if (this.enableStats) this.stats.errors++;
        throw this._mapFilesystemError(errMeta, { key, path: metaPath, operation: 'put' });
      }

      // ✨ Journal operation
      await this._journalOperation('put', key, {
        size,
        compressed: compressionResult.compressed,
        expiresAt
      });

      // ✨ Track stats
      if (this.enableStats) {
        this.stats.puts++;
      }

      // 🪵 Debug: PUT operation
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
      // ✨ Release lock
      this._releaseLock(key);
    }
  }

  /**
   * Retrieve an object (✨ enhanced with decompression and TTL checking)
   */
  async get(key) {
    const objectPath = this._getObjectPath(key);
    const metaPath = this._getMetadataPath(key);

    // Read metadata first (to check TTL)
    const [okMeta, errMeta, metaData] = await tryFn(() => this._readMetadata(key));
    if (!okMeta) {
      throw this._mapFilesystemError(errMeta, { key, path: metaPath, operation: 'get' });
    }

    // ✨ Check TTL expiration
    if (this.enableTTL && metaData.expiresAt && metaData.expiresAt < Date.now()) {
      // Delete expired object
      await this.delete(key);
      throw this._mapFilesystemError(
        { code: 'ENOENT', message: 'Object has expired' },
        { key, path: objectPath, operation: 'get' }
      );
    }

    // Read body
    const [okBody, errBody, bodyBuffer] = await tryFn(() => readFile(objectPath));
    if (!okBody) {
      if (this.enableStats) this.stats.errors++;
      throw this._mapFilesystemError(errBody, { key, path: objectPath, operation: 'get' });
    }

    // ✨ Decompress if needed
    const finalBuffer = this._decompressBody(bodyBuffer, metaData.compressed);

    // ✨ Track stats
    if (this.enableStats) {
      this.stats.gets++;
    }

    // 🪵 Debug: GET operation
    const info = [`${metaData.size} bytes`];
    if (metaData.compressed) {
      info.push(`decompressed: ${metaData.size}→${finalBuffer.length}`);
    }
    this.logger.debug({ key, size: metaData.size, compressed: metaData.compressed }, `GET ${key} (${info.join(', ')})`);

    // Convert Buffer to Readable stream (same as MemoryStorage)
    const bodyStream = Readable.from(finalBuffer);

    // Add AWS SDK compatible transformToString() method
    bodyStream.transformToString = async (encoding = 'utf-8') => {
      const chunks = [];
      for await (const chunk of bodyStream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString(encoding);
    };

    // Add AWS SDK compatible transformToByteArray() method
    bodyStream.transformToByteArray = async () => {
      const chunks = [];
      for await (const chunk of bodyStream) {
        chunks.push(chunk);
      }
      return new Uint8Array(Buffer.concat(chunks));
    };

    // Add AWS SDK compatible transformToWebStream() method
    bodyStream.transformToWebStream = () => {
      return Readable.toWeb(bodyStream);
    };

    return {
      Body: bodyStream,
      Metadata: { ...metaData.metadata },
      ContentType: metaData.contentType,
      ContentLength: finalBuffer.length, // Use decompressed size
      ETag: this._formatEtag(metaData.etag),
      LastModified: new Date(metaData.lastModified),
      ContentEncoding: metaData.contentEncoding
    };
  }

  /**
   * Get object metadata only (like S3 HeadObject)
   */
  async head(key) {
    const metaPath = this._getMetadataPath(key);

    const [ok, err, metaData] = await tryFn(() => this._readMetadata(key));
    if (!ok) {
      throw this._mapFilesystemError(err, { key, path: metaPath, operation: 'head' });
    }

    // 🪵 Debug: HEAD operation
    this.logger.debug({ key }, `HEAD ${key}`);

    return {
      Metadata: { ...metaData.metadata },
      ContentType: metaData.contentType,
      ContentLength: metaData.size,
      ETag: this._formatEtag(metaData.etag),
      LastModified: new Date(metaData.lastModified),
      ContentEncoding: metaData.contentEncoding
    };
  }

  /**
   * Copy an object
   */
  async copy(from, to, { metadata, metadataDirective, contentType }) {
    const sourceObjectPath = this._getObjectPath(from);
    const sourceMetaPath = this._getMetadataPath(from);

    // Check if source exists
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

    // Read source metadata
    const sourceMeta = await this._readMetadata(from);

    // Determine final metadata based on directive
    let finalMetadata = { ...sourceMeta.metadata };
    if (metadataDirective === 'REPLACE' && metadata) {
      finalMetadata = metadata;
    } else if (metadata) {
      finalMetadata = { ...finalMetadata, ...metadata };
    }

    // Copy body file
    const destObjectPath = this._getObjectPath(to);
    await this._ensureDirectory(destObjectPath);
    const [okCopy, errCopy] = await tryFn(() => copyFile(sourceObjectPath, destObjectPath));
    if (!okCopy) {
      throw this._mapFilesystemError(errCopy, { key: to, path: destObjectPath, operation: 'copy' });
    }

    // Write new metadata (always regenerate for destination)
    const destMeta = {
      metadata: finalMetadata,
      contentType: contentType || sourceMeta.contentType,
      etag: sourceMeta.etag, // Keep same ETag for same content
      lastModified: new Date().toISOString(),
      size: sourceMeta.size,
      contentEncoding: sourceMeta.contentEncoding,
      contentLength: sourceMeta.contentLength
    };

    await this._writeMetadata(to, destMeta);

    // 🪵 Debug: COPY operation
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

  /**
   * Delete an object (✨ enhanced with stats and journal)
   */
  async delete(key) {
    const objectPath = this._getObjectPath(key);
    const metaPath = this._getMetadataPath(key);

    // Delete body file (ignore if doesn't exist - S3 behavior)
    await tryFn(() => unlink(objectPath));

    // Delete metadata file (ignore if doesn't exist)
    await tryFn(() => unlink(metaPath));

    // ✨ Delete backup file if exists
    if (this.enableBackup) {
      const backupPath = objectPath + this.backupSuffix;
      await tryFn(() => unlink(backupPath));
    }

    // ✨ Journal operation
    await this._journalOperation('delete', key);

    // ✨ Track stats
    if (this.enableStats) {
      this.stats.deletes++;
    }

    // 🪵 Debug: DELETE operation
    this.logger.debug({ key }, `DELETE ${key}`);

    return {
      DeleteMarker: false,
      VersionId: null
    };
  }

  /**
   * Delete multiple objects (batch)
   */
  async deleteMultiple(keys) {
    const deleted = [];
    const errors = [];

    for (const key of keys) {
      try {
        await this.delete(key);
        deleted.push({ Key: key });
      } catch (error) {
        errors.push({
          Key: key,
          Code: error.name || 'InternalError',
          Message: error.message
        });
      }
    }

    // 🪵 Debug: DELETE BATCH
    this.logger.debug({ deletedCount: deleted.length, errorCount: errors.length }, `DELETE BATCH (${deleted.length} deleted, ${errors.length} errors)`);

    return { Deleted: deleted, Errors: errors };
  }

  /**
   * Recursively walk directory and yield file entries
   */
  async *_walkDirectory(dirPath, prefix = '') {
    let entries;

    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return; // Directory doesn't exist, no entries
      }
      throw error;
    }

    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories (sequentially to preserve order/logic)
        yield* this._walkDirectory(fullPath, prefix);
      } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
        files.push({ entry, fullPath });
      }
    }

    // Process files in parallel batches to avoid sequential I/O bottleneck
    // This reduces list time from O(N*latency) to O(N/Concurrency*latency)
    const fileBatches = chunk(files, 50); // Batch size 50 for file descriptors safety

    for (const batch of fileBatches) {
      const promises = batch.map(async ({ entry, fullPath }) => {
        const key = this._pathToKey(fullPath);

        // Filter by prefix if specified
        if (!prefix || key.startsWith(prefix)) {
          const [ok, , stats] = await tryFn(() => stat(fullPath));
          if (ok) {
            return {
              key,
              path: fullPath,
              size: stats.size,
              mtime: stats.mtime
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

  /**
   * List objects with prefix/delimiter support
   */
  async list({ prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null }) {
    const prefixFilter = prefix || '';

    // Start from prefix directory if it exists, otherwise from basePath
    const startPath = prefixFilter ? this._keyToPath(prefixFilter) : this.basePath;
    const searchPath = existsSync(startPath) && (await stat(startPath)).isDirectory()
      ? startPath
      : path.dirname(startPath);

    const allKeys = [];

    // Walk directory tree
    for await (const entry of this._walkDirectory(searchPath, prefixFilter)) {
      allKeys.push(entry);
    }

    // Sort by key
    allKeys.sort((a, b) => a.key.localeCompare(b.key));

    // Apply startAfter or continuationToken
    let startAfterKey = null;
    if (continuationToken) {
      startAfterKey = this._decodeContinuationToken(continuationToken);
    } else if (startAfter) {
      startAfterKey = startAfter;
    }

    let filteredKeys = startAfterKey
      ? allKeys.filter(entry => entry.key > startAfterKey)
      : allKeys;

    // Process keys with delimiter (common prefixes)
    const contents = [];
    const commonPrefixes = new Set();
    let processed = 0;
    let lastKeyInPage = null;

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

      // Read metadata for ETag
      const [ok, , metaData] = await tryFn(() => this._readMetadata(entry.key));
      const etag = ok ? metaData.etag : this._generateETag('');

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

    // 🪵 Debug: LIST operation
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

  /**
   * Check if object exists
   */
  exists(key) {
    const objectPath = this._getObjectPath(key);
    return existsSync(objectPath);
  }

  /**
   * Clear all objects (delete entire basePath directory)
   */
  async clear() {
    // For safety, only clear if basePath looks like a data directory
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

    // 🪵 Debug: CLEAR operation
    this.logger.debug({ basePath: this.basePath }, `Cleared all objects from ${this.basePath}`);
  }

  /**
   * ✨ Cleanup resources (stop cron jobs)
   */
  destroy() {
    if (this.cleanupJobName) {
      this.cronManager.stop(this.cleanupJobName);
      this.cleanupJobName = null;
    }

    // 🪵 Debug: destroyed
    this.logger.debug('Destroyed (cleanup stopped)');
  }
}

export default FileSystemStorage;
