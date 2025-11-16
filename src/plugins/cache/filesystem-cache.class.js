/**
 * Filesystem Cache Configuration Documentation
 * 
 * This cache implementation stores data in the local filesystem, providing persistent storage
 * that survives process restarts and is suitable for single-instance applications.
 * It's faster than S3 cache for local operations and doesn't require network connectivity.
 * 
 * @typedef {Object} FilesystemCacheConfig
 * @property {string} directory - The directory path to store cache files (required)
 * @property {string} [prefix='cache'] - Prefix for cache filenames
 * @property {number} [ttl=3600000] - Time to live in milliseconds (1 hour default)
 * @property {boolean} [enableCompression=true] - Whether to compress cache values using gzip
 * @property {number} [compressionThreshold=1024] - Minimum size in bytes to trigger compression
 * @property {boolean} [createDirectory=true] - Whether to create the directory if it doesn't exist
 * @property {string} [fileExtension='.cache'] - File extension for cache files
 * @property {boolean} [enableMetadata=true] - Whether to store metadata alongside cache data
 * @property {number} [maxFileSize=10485760] - Maximum file size in bytes (10MB default)
 * @property {boolean} [enableStats=false] - Whether to track cache statistics
 * @property {boolean} [enableCleanup=true] - Whether to automatically clean up expired files
 * @property {number} [cleanupInterval=300000] - Interval in milliseconds to run cleanup (5 minutes default)
 * @property {string} [encoding='utf8'] - File encoding to use
 * @property {number} [fileMode=0o644] - File permissions in octal notation
 * @property {boolean} [enableBackup=false] - Whether to create backup files before overwriting
 * @property {string} [backupSuffix='.bak'] - Suffix for backup files
 * @property {boolean} [enableLocking=false] - Whether to use file locking to prevent concurrent access
 * @property {number} [lockTimeout=5000] - Lock timeout in milliseconds
 * @property {boolean} [enableJournal=false] - Whether to maintain a journal of operations
 * @property {string} [journalFile='cache.journal'] - Journal filename
 * 
 * @example
 * // Basic configuration
 * {
 *   directory: './cache',
 *   prefix: 'app-cache',
 *   ttl: 7200000, // 2 hours
 *   enableCompression: true
 * }
 * 
 * @example
 * // Configuration with cleanup and metadata
 * {
 *   directory: '/tmp/s3db-cache',
 *   prefix: 'db-cache',
 *   ttl: 1800000, // 30 minutes
 *   enableCompression: true,
 *   compressionThreshold: 512,
 *   enableCleanup: true,
 *   cleanupInterval: 600000, // 10 minutes
 *   enableMetadata: true,
 *   maxFileSize: 5242880 // 5MB
 * }
 * 
 * @example
 * // Configuration with backup and locking
 * {
 *   directory: './data/cache',
 *   ttl: 86400000, // 24 hours
 *   enableBackup: true,
 *   enableLocking: true,
 *   lockTimeout: 3000,
 *   enableJournal: true
 * }
 * 
 * @example
 * // Minimal configuration
 * {
 *   directory: './cache'
 * }
 * 
 * @notes
 * - Requires filesystem write permissions to the specified directory
 * - File storage is faster than S3 but limited to single instance
 * - Compression reduces disk usage but increases CPU overhead
 * - TTL is enforced by checking file modification time
 * - Cleanup interval helps prevent disk space issues
 * - File locking prevents corruption during concurrent access
 * - Journal provides audit trail of cache operations
 * - Backup files help recover from write failures
 * - Metadata includes creation time, compression info, and custom properties
 */
import fs from 'fs';
import { readFile, writeFile, unlink, readdir, stat, mkdir } from 'fs/promises';
import path from 'path';
import zlib from 'node:zlib';
import { Cache } from './cache.class.js';
import tryFn from '../../concerns/try-fn.js';
import { CacheError } from '../cache.errors.js';
import { getCronManager } from '../../concerns/cron-manager.js';

export class FilesystemCache extends Cache {
  constructor({
    directory,
    prefix = 'cache',
    ttl = 3600000,
    enableCompression = true,
    compressionThreshold = 1024,
    createDirectory = true,
    fileExtension = '.cache',
    enableMetadata = true,
    maxFileSize = 10485760, // 10MB
    enableStats = false,
    enableCleanup = true,
    cleanupInterval = 300000, // 5 minutes
    encoding = 'utf8',
    fileMode = 0o644,
    enableBackup = false,
    backupSuffix = '.bak',
    enableLocking = false,
    lockTimeout = 5000,
    enableJournal = false,
    journalFile = 'cache.journal',
    ...config
  }) {
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
      errors: 0
    };

    this.locks = new Map(); // For file locking
    this.cronManager = getCronManager();
    this.cleanupJobName = null;

    // Store _init promise to allow tests to handle initialization errors
    this._initPromise = this._init().catch(err => {
      this._initError = err;
      // Silently capture initialization error - will be thrown on first operation
    });
  }

  async _init() {
    // Create cache directory if needed
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
    
    // Start cleanup timer if enabled
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

  async _ensureDirectory(dir) {
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
    
    if (!ok && err.code !== 'EEXIST') {
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

  _getFilePath(key) {
    // Sanitize key for filesystem
    const sanitizedKey = key.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${this.prefix}_${sanitizedKey}${this.fileExtension}`;
    return path.join(this.directory, filename);
  }

  _getMetadataPath(filePath) {
    return filePath + '.meta';
  }

  async _set(key, data) {
    const filePath = this._getFilePath(key);

    try {
      // Prepare data
      let serialized = JSON.stringify(data);
      const originalSize = Buffer.byteLength(serialized, this.encoding);

      // Check size limit
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

      // Compress if enabled and over threshold
      if (this.enableCompression && originalSize >= this.compressionThreshold) {
        const compressedBuffer = zlib.gzipSync(Buffer.from(serialized, this.encoding));
        finalData = compressedBuffer.toString('base64');
        compressed = true;
      }

      // Ensure directory exists before writing
      const dir = path.dirname(filePath);
      await this._ensureDirectory(dir);

      // Create backup if enabled
      if (this.enableBackup && await this._fileExists(filePath)) {
        const backupPath = filePath + this.backupSuffix;
        await this._copyFile(filePath, backupPath);
      }

      // Acquire lock if enabled
      if (this.enableLocking) {
        await this._acquireLock(filePath);
      }

      try {
        // Write data
        await writeFile(filePath, finalData, {
          encoding: compressed ? 'utf8' : this.encoding,
          mode: this.fileMode
        });
        
        // Write metadata if enabled
        if (this.enableMetadata) {
          const metadata = {
            key,
            timestamp: Date.now(),
            ttl: this.ttl,
            compressed,
            originalSize,
            compressedSize: compressed ? Buffer.byteLength(finalData, 'utf8') : originalSize,
            compressionRatio: compressed ? (Buffer.byteLength(finalData, 'utf8') / originalSize).toFixed(2) : 1.0
          };
          
          await writeFile(this._getMetadataPath(filePath), JSON.stringify(metadata), {
            encoding: this.encoding,
            mode: this.fileMode
          });
        }
        
        // Update stats
        if (this.enableStats) {
          this.stats.sets++;
        }
        
        // Journal operation
        if (this.enableJournal) {
          await this._journalOperation('set', key, { size: originalSize, compressed });
        }
        
      } finally {
        // Release lock
        if (this.enableLocking) {
          this._releaseLock(filePath);
        }
      }
      
      return data;
      
    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError(`Failed to set cache key '${key}': ${error.message}`, {
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

  async _get(key) {
    const filePath = this._getFilePath(key);
    
    try {
      // Check if file exists
      if (!await this._fileExists(filePath)) {
        if (this.enableStats) {
          this.stats.misses++;
        }
        return null;
      }
      
      // Check TTL using metadata or file modification time
      let isExpired = false;
      
      if (this.enableMetadata) {
        const metadataPath = this._getMetadataPath(filePath);
        if (await this._fileExists(metadataPath)) {
          const [ok, err, metadata] = await tryFn(async () => {
            const metaContent = await readFile(metadataPath, this.encoding);
            return JSON.parse(metaContent);
          });
          
          if (ok && metadata.ttl > 0) {
            const age = Date.now() - metadata.timestamp;
            isExpired = age > metadata.ttl;
          }
        }
      } else if (this.ttl > 0) {
        // Fallback to file modification time
        const stats = await stat(filePath);
        const age = Date.now() - stats.mtime.getTime();
        isExpired = age > this.ttl;
      }
      
      // Remove expired files
      if (isExpired) {
        await this._del(key);
        if (this.enableStats) {
          this.stats.misses++;
        }
        return null;
      }
      
      // Acquire lock if enabled
      if (this.enableLocking) {
        await this._acquireLock(filePath);
      }
      
      try {
        // Read file content
        const content = await readFile(filePath, this.encoding);
        
        // Check if compressed using metadata
        let isCompressed = false;
        if (this.enableMetadata) {
          const metadataPath = this._getMetadataPath(filePath);
          if (await this._fileExists(metadataPath)) {
            const [ok, err, metadata] = await tryFn(async () => {
              const metaContent = await readFile(metadataPath, this.encoding);
              return JSON.parse(metaContent);
            });
            if (ok) {
              isCompressed = metadata.compressed;
            }
          }
        }
        
        // Decompress if needed
        let finalContent = content;
        if (isCompressed || (this.enableCompression && content.match(/^[A-Za-z0-9+/=]+$/))) {
          try {
            const compressedBuffer = Buffer.from(content, 'base64');
            finalContent = zlib.gunzipSync(compressedBuffer).toString(this.encoding);
          } catch (decompressError) {
            // If decompression fails, assume it's not compressed
            finalContent = content;
          }
        }
        
        // Parse JSON
        const data = JSON.parse(finalContent);
        
        // Update stats
        if (this.enableStats) {
          this.stats.hits++;
        }
        
        return data;
        
      } finally {
        // Release lock
        if (this.enableLocking) {
          this._releaseLock(filePath);
        }
      }
      
    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      // If file is corrupted or unreadable, delete it and return null
      await this._del(key);
      return null;
    }
  }

  async _del(key) {
    const filePath = this._getFilePath(key);
    
    try {
      // Delete main file
      if (await this._fileExists(filePath)) {
        await unlink(filePath);
      }
      
      // Delete metadata file
      if (this.enableMetadata) {
        const metadataPath = this._getMetadataPath(filePath);
        if (await this._fileExists(metadataPath)) {
          await unlink(metadataPath);
        }
      }
      
      // Delete backup file
      if (this.enableBackup) {
        const backupPath = filePath + this.backupSuffix;
        if (await this._fileExists(backupPath)) {
          await unlink(backupPath);
        }
      }
      
      // Update stats
      if (this.enableStats) {
        this.stats.deletes++;
      }
      
      // Journal operation
      if (this.enableJournal) {
        await this._journalOperation('delete', key);
      }
      
      return true;
      
    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError(`Failed to delete cache key '${key}': ${error.message}`, {
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

  async _clear(prefix) {
    try {
      // Check if directory exists before trying to read it
      if (!await this._fileExists(this.directory)) {
        // Directory doesn't exist, nothing to clear
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
          // Extract key from filename
          const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
          return keyPart.startsWith(prefix);
        }
        
        return true;
      });
      
      // Delete matching files and their metadata
      for (const file of cacheFiles) {
        const filePath = path.join(this.directory, file);
        
        // Delete main file (handle ENOENT gracefully)
        try {
          if (await this._fileExists(filePath)) {
            await unlink(filePath);
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error; // Re-throw non-ENOENT errors
          }
          // ENOENT means file is already gone, which is what we wanted
        }
        
        // Delete metadata file (handle ENOENT gracefully)
        if (this.enableMetadata) {
          try {
            const metadataPath = this._getMetadataPath(filePath);
            if (await this._fileExists(metadataPath)) {
              await unlink(metadataPath);
            }
          } catch (error) {
            if (error.code !== 'ENOENT') {
              throw error; // Re-throw non-ENOENT errors
            }
            // ENOENT means file is already gone, which is what we wanted
          }
        }
        
        // Delete backup file (handle ENOENT gracefully)
        if (this.enableBackup) {
          try {
            const backupPath = filePath + this.backupSuffix;
            if (await this._fileExists(backupPath)) {
              await unlink(backupPath);
            }
          } catch (error) {
            if (error.code !== 'ENOENT') {
              throw error; // Re-throw non-ENOENT errors
            }
            // ENOENT means file is already gone, which is what we wanted
          }
        }
      }
      
      // Update stats
      if (this.enableStats) {
        this.stats.clears++;
      }
      
      // Journal operation
      if (this.enableJournal) {
        await this._journalOperation('clear', prefix || 'all', { count: cacheFiles.length });
      }
      
      return true;
      
    } catch (error) {
      // Handle ENOENT errors at the top level too (e.g., directory doesn't exist)
      if (error.code === 'ENOENT') {
        if (this.enableStats) {
          this.stats.clears++;
        }
        return true; // Already cleared!
      }
      
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError(`Failed to clear cache: ${error.message}`, {
        driver: 'filesystem',
        operation: 'clear',
        statusCode: 500,
        retriable: false,
        suggestion: 'Verify the cache directory is accessible and not in use by another process.',
        original: error
      });
    }
  }

  async size() {
    const keys = await this.keys();
    return keys.length;
  }

  async keys() {
    try {
      const files = await readdir(this.directory);
      const cacheFiles = files.filter(file => 
        file.startsWith(this.prefix) && 
        file.endsWith(this.fileExtension)
      );
      
      // Extract keys from filenames
      const keys = cacheFiles.map(file => {
        const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
        return keyPart;
      });
      
      return keys;
      
    } catch (error) {
      this.logger.warn('FilesystemCache: Failed to list keys:', error.message);
      return [];
    }
  }

  // Helper methods

  async _fileExists(filePath) {
    const [ok] = await tryFn(async () => {
      await stat(filePath);
    });
    return ok;
  }

  async _copyFile(src, dest) {
    const [ok, err] = await tryFn(async () => {
      const content = await readFile(src);
      await writeFile(dest, content);
    });
    if (!ok) {
      this.logger.warn('FilesystemCache: Failed to create backup:', err.message);
    }
  }

  async _cleanup() {
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
          // Use metadata for TTL check
          const metadataPath = this._getMetadataPath(filePath);
          if (await this._fileExists(metadataPath)) {
            const [ok, err, metadata] = await tryFn(async () => {
              const metaContent = await readFile(metadataPath, this.encoding);
              return JSON.parse(metaContent);
            });
            
            if (ok && metadata.ttl > 0) {
              const age = now - metadata.timestamp;
              shouldDelete = age > metadata.ttl;
            }
          }
        } else {
          // Use file modification time
          const [ok, err, stats] = await tryFn(async () => {
            return await stat(filePath);
          });
          
          if (ok) {
            const age = now - stats.mtime.getTime();
            shouldDelete = age > this.ttl;
          }
        }
        
        if (shouldDelete) {
          const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
          await this._del(keyPart);
        }
      }
      
    } catch (error) {
      this.logger.warn('FilesystemCache cleanup error:', error.message);
    }
  }

  async _acquireLock(filePath) {
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

  _releaseLock(filePath) {
    if (!this.enableLocking) return;
    this.locks.delete(filePath);
  }

  async _journalOperation(operation, key, metadata = {}) {
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
    
    if (!ok) {
      this.logger.warn('FilesystemCache journal error:', err.message);
    }
  }

  // Cleanup on process exit
  destroy() {
    if (this.cleanupJobName) {
      this.cronManager.stop(this.cleanupJobName);
      this.cleanupJobName = null;
    }
  }

  // Get cache statistics
  getStats() {
    return {
      ...this.stats,
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
