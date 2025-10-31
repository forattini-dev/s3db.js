/**
 * Memory Cache Configuration Documentation
 *
 * This cache implementation stores data in memory using a Map-like structure.
 * It provides fast access to frequently used data but is limited by available RAM
 * and data is lost when the process restarts.
 *
 * @typedef {Object} MemoryCacheConfig
 * @property {number} [maxSize=1000] - Maximum number of items to store in cache
 * @property {number} [maxMemoryBytes=0] - Maximum memory usage in bytes (0 = unlimited). When set, cache will evict items to stay under this limit.
 * @property {number} [maxMemoryPercent=0] - Maximum memory usage as decimal fraction of total system memory (0 = unlimited, 0.1 = 10%, 0.5 = 50%, 1.0 = 100%). Takes precedence over maxMemoryBytes if both are set.
 * @property {number} [ttl=300000] - Time to live in milliseconds (5 minutes default)
 * @property {boolean} [enableStats=false] - Whether to track cache statistics (hits, misses, etc.)
 * @property {string} [evictionPolicy='lru'] - Cache eviction policy: 'lru' (Least Recently Used) or 'fifo' (First In First Out)
 * @property {boolean} [logEvictions=false] - Whether to log when items are evicted from cache
 * @property {number} [cleanupInterval=60000] - Interval in milliseconds to run cleanup of expired items (1 minute default)
 * @property {boolean} [caseSensitive=true] - Whether cache keys are case sensitive
 * @property {Function} [serializer] - Custom function to serialize values before storage
 *   - Parameters: (value: any) => string
 *   - Default: JSON.stringify
 * @property {Function} [deserializer] - Custom function to deserialize values after retrieval
 *   - Parameters: (string: string) => any
 *   - Default: JSON.parse
 * @property {boolean} [enableCompression=false] - Whether to compress values using gzip (requires zlib)
 * @property {number} [compressionThreshold=1024] - Minimum size in bytes to trigger compression
 * @property {Object} [tags] - Default tags to apply to all cached items
 *   - Key: tag name (e.g., 'environment', 'version')
 *   - Value: tag value (e.g., 'production', '1.0.0')
 * @property {boolean} [persistent=false] - Whether to persist cache to disk (experimental)
 * @property {string} [persistencePath='./cache'] - Directory path for persistent cache storage
 * @property {number} [persistenceInterval=300000] - Interval in milliseconds to save cache to disk (5 minutes default)
 * 
 * @example
 * // Basic configuration with LRU eviction
 * {
 *   maxSize: 5000,
 *   ttl: 600000, // 10 minutes
 *   evictionPolicy: 'lru',
 *   enableStats: true,
 *   logEvictions: true
 * }
 * 
 * @example
 * // Configuration with compression and custom serialization
 * {
 *   maxSize: 10000,
 *   ttl: 1800000, // 30 minutes
 *   enableCompression: true,
 *   compressionThreshold: 512,
 *   serializer: (value) => Buffer.from(JSON.stringify(value)).toString('base64'),
 *   deserializer: (str) => JSON.parse(Buffer.from(str, 'base64').toString()),
 *   tags: {
 *     'environment': 'production',
 *     'cache_type': 'memory'
 *   }
 * }
 * 
 * @example
 * // FIFO configuration with persistent storage
 * {
 *   maxSize: 2000,
 *   ttl: 900000, // 15 minutes
 *   evictionPolicy: 'fifo',
 *   persistent: true,
 *   persistencePath: './data/cache',
 *   persistenceInterval: 600000 // 10 minutes
 * }
 * 
 * @example
 * // Minimal configuration using defaults
 * {
 *   maxSize: 1000,
 *   ttl: 300000 // 5 minutes
 * }
 *
 * @example
 * // Memory-limited configuration (prevents memory exhaustion)
 * {
 *   maxMemoryBytes: 100 * 1024 * 1024, // 100MB hard limit
 *   ttl: 600000, // 10 minutes
 *   enableCompression: true, // Reduce memory usage
 *   compressionThreshold: 1024 // Compress items > 1KB
 * }
 *
 * @example
 * // Production configuration with memory monitoring (absolute bytes)
 * {
 *   maxSize: 5000, // Limit number of items
 *   maxMemoryBytes: 512 * 1024 * 1024, // 512MB memory limit
 *   ttl: 1800000, // 30 minutes
 *   enableCompression: true,
 *   compressionThreshold: 512
 * }
 *
 * // Check memory usage
 * const stats = cache.getMemoryStats();
 * console.log(`Memory: ${stats.memoryUsage.current} / ${stats.memoryUsage.max}`);
 * console.log(`Usage: ${stats.memoryUsagePercent}%`);
 * console.log(`Evicted due to memory: ${stats.evictedDueToMemory}`);
 *
 * @example
 * // Production configuration with percentage of system memory
 * {
 *   maxMemoryPercent: 0.1, // Use max 10% of system memory (0.1 = 10%)
 *   ttl: 1800000, // 30 minutes
 *   enableCompression: true
 * }
 *
 * // On a 16GB system, this sets maxMemoryBytes to ~1.6GB
 * // On a 32GB system, this sets maxMemoryBytes to ~3.2GB
 *
 * // Check system memory stats
 * const stats = cache.getMemoryStats();
 * console.log(`System Memory: ${stats.systemMemory.total}`);
 * console.log(`Cache using: ${stats.systemMemory.cachePercent} of system memory`);
 * console.log(`Max allowed: ${(stats.maxMemoryPercent * 100).toFixed(1)}%`);
 *
 * @notes
 * - Memory usage is limited by available RAM, maxSize setting, and optionally maxMemoryBytes or maxMemoryPercent
 * - maxMemoryPercent takes precedence over maxMemoryBytes if both are set
 * - maxMemoryPercent is calculated based on total system memory at cache creation time
 * - Useful for containerized/cloud environments where system memory varies
 * - TTL is checked on access, not automatically in background
 * - LRU eviction removes least recently accessed items when cache is full
 * - FIFO eviction removes oldest items when cache is full
 * - Statistics include hit rate, miss rate, and eviction count
 * - Compression reduces memory usage but increases CPU overhead
 * - Custom serializers allow for specialized data formats
 * - Persistent storage survives process restarts but may be slower
 * - Cleanup interval helps prevent memory leaks from expired items
 * - Tags are useful for cache invalidation and monitoring
 * - Case sensitivity affects key matching and storage efficiency
 * - maxMemoryBytes prevents memory exhaustion by enforcing byte-level limits
 * - Memory tracking includes serialized data size (compressed or uncompressed)
 * - getMemoryStats() includes systemMemory info for monitoring
 */
import zlib from 'node:zlib';
import os from 'node:os';
import { Cache } from "./cache.class.js"

export class MemoryCache extends Cache {
  constructor(config = {}) {
    super(config);
    this.caseSensitive = config.caseSensitive !== undefined ? config.caseSensitive : true;
    this.serializer = typeof config.serializer === 'function' ? config.serializer : JSON.stringify;
    this.deserializer = typeof config.deserializer === 'function' ? config.deserializer : JSON.parse;
    this.enableStats = config.enableStats === true;
    this.evictionPolicy = (config.evictionPolicy || 'fifo').toLowerCase();
    this.cache = {};
    this.meta = {};
    this.maxSize = config.maxSize !== undefined ? config.maxSize : 1000;

    // Validate that only one memory limit option is used
    if (config.maxMemoryBytes && config.maxMemoryBytes > 0 &&
        config.maxMemoryPercent && config.maxMemoryPercent > 0) {
      throw new Error(
        '[MemoryCache] Cannot use both maxMemoryBytes and maxMemoryPercent. ' +
        'Choose one: maxMemoryBytes (absolute) or maxMemoryPercent (0...1 fraction).'
      );
    }

    // Calculate maxMemoryBytes from percentage if provided
    if (config.maxMemoryPercent && config.maxMemoryPercent > 0) {
      if (config.maxMemoryPercent > 1) {
        throw new Error(
          '[MemoryCache] maxMemoryPercent must be between 0 and 1 (e.g., 0.1 for 10%). ' +
          `Received: ${config.maxMemoryPercent}`
        );
      }

      const totalMemory = os.totalmem();
      this.maxMemoryBytes = Math.floor(totalMemory * config.maxMemoryPercent);
      this.maxMemoryPercent = config.maxMemoryPercent;
    } else {
      this.maxMemoryBytes = config.maxMemoryBytes !== undefined ? config.maxMemoryBytes : 0; // 0 = unlimited
      this.maxMemoryPercent = 0;
    }

    this.ttl = config.ttl !== undefined ? config.ttl : 300000;

    // Compression configuration
    this.enableCompression = config.enableCompression !== undefined ? config.enableCompression : false;
    this.compressionThreshold = config.compressionThreshold !== undefined ? config.compressionThreshold : 1024;

    // Stats for compression
    this.compressionStats = {
      totalCompressed: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      compressionRatio: 0
    };

    // Memory tracking
    this.currentMemoryBytes = 0;
    this.evictedDueToMemory = 0;

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }

  _normalizeKey(key) {
    return this.caseSensitive ? key : key.toLowerCase();
  }

  _recordStat(type) {
    if (!this.enableStats) return;
    if (Object.prototype.hasOwnProperty.call(this.stats, type)) {
      this.stats[type] += 1;
    }
  }

  _selectEvictionCandidate() {
    const entries = Object.entries(this.meta);
    if (entries.length === 0) {
      return null;
    }

    if (this.evictionPolicy === 'lru') {
      entries.sort((a, b) => (a[1].lastAccess ?? a[1].ts) - (b[1].lastAccess ?? b[1].ts));
    } else {
      // Default to FIFO (order of insertion)
      entries.sort((a, b) => (a[1].createdAt ?? a[1].ts) - (b[1].createdAt ?? b[1].ts));
    }

    return entries[0]?.[0] || null;
  }

  async _set(key, data) {
    const normalizedKey = this._normalizeKey(key);

    // Prepare data for storage
    let finalData = serialized;
    let compressed = false;
    let originalSize = 0;
    let compressedSize = 0;

    // Serialize first (needed for both compression and memory limit checks)
    let serialized;
    try {
      serialized = this.serializer(data);
    } catch (error) {
      throw new Error(`[MemoryCache] Failed to serialize data for key '${key}': ${error.message}`);
    }

    if (typeof serialized !== 'string') {
      throw new Error('[MemoryCache] Serializer must return a string');
    }

    originalSize = Buffer.byteLength(serialized, 'utf8');

    // Apply compression if enabled
    if (this.enableCompression) {
      try {
        // Compress only if over threshold
        if (originalSize >= this.compressionThreshold) {
          const compressedBuffer = zlib.gzipSync(Buffer.from(serialized, 'utf8'));
          finalData = {
            __compressed: true,
            __data: compressedBuffer.toString('base64'),
            __originalSize: originalSize
          };
          compressedSize = Buffer.byteLength(finalData.__data, 'utf8');
          compressed = true;

          // Update compression stats
          this.compressionStats.totalCompressed++;
          this.compressionStats.totalOriginalSize += originalSize;
          this.compressionStats.totalCompressedSize += compressedSize;
          this.compressionStats.compressionRatio =
            (this.compressionStats.totalCompressedSize / this.compressionStats.totalOriginalSize).toFixed(2);
        }
      } catch (error) {
        // If compression fails, store uncompressed
        console.warn(`[MemoryCache] Compression failed for key '${key}':`, error.message);
      }
    }

    // Calculate actual storage size (compressed or original)
    const itemSize = compressed ? compressedSize : originalSize;

    // If replacing existing key, subtract its old size from current memory
    if (Object.prototype.hasOwnProperty.call(this.cache, normalizedKey)) {
      const oldSize = this.meta[normalizedKey]?.compressedSize || 0;
      this.currentMemoryBytes -= oldSize;
    }

    // Memory-aware eviction: Remove items until we have space
    if (this.maxMemoryBytes > 0) {
      while (this.currentMemoryBytes + itemSize > this.maxMemoryBytes && Object.keys(this.cache).length > 0) {
        const candidate = this._selectEvictionCandidate();
        if (!candidate) break;
        const evictedSize = this.meta[candidate]?.compressedSize || 0;
        delete this.cache[candidate];
        delete this.meta[candidate];
        this.currentMemoryBytes -= evictedSize;
        this.evictedDueToMemory++;
        this._recordStat('evictions');
      }
    }

    // Item count eviction (original logic)
    if (this.maxSize > 0 && Object.keys(this.cache).length >= this.maxSize) {
      const candidate = this._selectEvictionCandidate();
      if (candidate) {
        const evictedSize = this.meta[candidate]?.compressedSize || 0;
        delete this.cache[candidate];
        delete this.meta[candidate];
        this.currentMemoryBytes -= evictedSize;
        this._recordStat('evictions');
      }
    }

    // Store the item
    this.cache[normalizedKey] = finalData;
    const timestamp = Date.now();
    this.meta[normalizedKey] = {
      ts: timestamp,
      createdAt: timestamp,
      lastAccess: timestamp,
      compressed,
      originalSize,
      compressedSize: itemSize
    };

    // Update current memory usage
    this.currentMemoryBytes += itemSize;

    this._recordStat('sets');

    return data;
  }

  async _get(key) {
    const normalizedKey = this._normalizeKey(key);

    if (!Object.prototype.hasOwnProperty.call(this.cache, normalizedKey)) {
      this._recordStat('misses');
      return null;
    }

    // Check TTL expiration
    if (this.ttl > 0) {
      const now = Date.now();
      const meta = this.meta[normalizedKey];
      if (meta && now - (meta.createdAt ?? meta.ts) > this.ttl) {
        // Expired - decrement memory before deleting
        const itemSize = meta.compressedSize || 0;
        this.currentMemoryBytes -= itemSize;
        delete this.cache[normalizedKey];
        delete this.meta[normalizedKey];
        this._recordStat('misses');
        return null;
      }
    }

    const rawData = this.cache[normalizedKey];

    // Check if data is compressed
    if (rawData && typeof rawData === 'object' && rawData.__compressed) {
      try {
        // Decompress data
        const compressedBuffer = Buffer.from(rawData.__data, 'base64');
        const decompressed = zlib.gunzipSync(compressedBuffer).toString('utf8');
        const value = this.deserializer(decompressed);
        this._recordStat('hits');
        if (this.evictionPolicy === 'lru' && this.meta[normalizedKey]) {
          this.meta[normalizedKey].lastAccess = Date.now();
        }
        return value;
      } catch (error) {
        console.warn(`[MemoryCache] Decompression failed for key '${key}':`, error.message);
        // If decompression fails, remove corrupted entry
        delete this.cache[normalizedKey];
        delete this.meta[normalizedKey];
        this._recordStat('misses');
        return null;
      }
    }
    
    try {
      const value = typeof rawData === 'string' ? this.deserializer(rawData) : rawData;
      this._recordStat('hits');
      if (this.evictionPolicy === 'lru' && this.meta[normalizedKey]) {
        this.meta[normalizedKey].lastAccess = Date.now();
      }
      return value;
    } catch (error) {
      console.warn(`[MemoryCache] Deserialization failed for key '${key}':`, error.message);
      delete this.cache[normalizedKey];
      delete this.meta[normalizedKey];
      this._recordStat('misses');
      return null;
    }
  }

  async _del(key) {
    const normalizedKey = this._normalizeKey(key);

    if (Object.prototype.hasOwnProperty.call(this.cache, normalizedKey)) {
      const itemSize = this.meta[normalizedKey]?.compressedSize || 0;
      this.currentMemoryBytes -= itemSize;
    }

    delete this.cache[normalizedKey];
    delete this.meta[normalizedKey];
    this._recordStat('deletes');
    return true;
  }

  async _clear(prefix) {
    if (!prefix) {
      this.cache = {};
      this.meta = {};
      this.currentMemoryBytes = 0; // Reset memory counter
      if (this.enableStats) {
        this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
      }
      return true;
    }
    // Remove only keys that start with the prefix
    const removed = [];
    const normalizedPrefix = this._normalizeKey(prefix);
    for (const key of Object.keys(this.cache)) {
      if (key.startsWith(normalizedPrefix)) {
        removed.push(key);
        // Decrement memory usage
        const itemSize = this.meta[key]?.compressedSize || 0;
        this.currentMemoryBytes -= itemSize;
        delete this.cache[key];
        delete this.meta[key];
      }
    }
    if (removed.length > 0) {
    }
    return true;
  }

  async size() {
    return Object.keys(this.cache).length;
  }

  async keys() {
    return Object.keys(this.cache);
  }

  /**
   * Get compression statistics
   * @returns {Object} Compression stats including total compressed items, ratios, and space savings
   */
  getCompressionStats() {
    if (!this.enableCompression) {
      return { enabled: false, message: 'Compression is disabled' };
    }

    const spaceSavings = this.compressionStats.totalOriginalSize > 0
      ? ((this.compressionStats.totalOriginalSize - this.compressionStats.totalCompressedSize) / this.compressionStats.totalOriginalSize * 100).toFixed(2)
      : 0;

    return {
      enabled: true,
      totalItems: Object.keys(this.cache).length,
      compressedItems: this.compressionStats.totalCompressed,
      compressionThreshold: this.compressionThreshold,
      totalOriginalSize: this.compressionStats.totalOriginalSize,
      totalCompressedSize: this.compressionStats.totalCompressedSize,
      averageCompressionRatio: this.compressionStats.compressionRatio,
      spaceSavingsPercent: spaceSavings,
      memoryUsage: {
        uncompressed: `${(this.compressionStats.totalOriginalSize / 1024).toFixed(2)} KB`,
        compressed: `${(this.compressionStats.totalCompressedSize / 1024).toFixed(2)} KB`,
        saved: `${((this.compressionStats.totalOriginalSize - this.compressionStats.totalCompressedSize) / 1024).toFixed(2)} KB`
      }
    };
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory stats including current usage, limits, and eviction counts
   */
  getMemoryStats() {
    const totalItems = Object.keys(this.cache).length;
    const memoryUsagePercent = this.maxMemoryBytes > 0
      ? ((this.currentMemoryBytes / this.maxMemoryBytes) * 100).toFixed(2)
      : 0;

    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };

    const cachePercentOfTotal = systemMemory.total > 0
      ? ((this.currentMemoryBytes / systemMemory.total) * 100).toFixed(2)
      : 0;

    return {
      currentMemoryBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      maxMemoryPercent: this.maxMemoryPercent,
      memoryUsagePercent: parseFloat(memoryUsagePercent),
      cachePercentOfSystemMemory: parseFloat(cachePercentOfTotal),
      totalItems,
      maxSize: this.maxSize,
      evictedDueToMemory: this.evictedDueToMemory,
      averageItemSize: totalItems > 0 ? Math.round(this.currentMemoryBytes / totalItems) : 0,
      memoryUsage: {
        current: this._formatBytes(this.currentMemoryBytes),
        max: this.maxMemoryBytes > 0 ? this._formatBytes(this.maxMemoryBytes) : 'unlimited',
        available: this.maxMemoryBytes > 0 ? this._formatBytes(this.maxMemoryBytes - this.currentMemoryBytes) : 'unlimited'
      },
      systemMemory: {
        total: this._formatBytes(systemMemory.total),
        free: this._formatBytes(systemMemory.free),
        used: this._formatBytes(systemMemory.used),
        cachePercent: `${cachePercentOfTotal}%`
      }
    };
  }

  /**
   * Format bytes to human-readable format
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}

export default MemoryCache
