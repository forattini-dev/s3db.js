/**
 * Memory Cache Configuration Documentation
 * 
 * This cache implementation stores data in memory using a Map-like structure.
 * It provides fast access to frequently used data but is limited by available RAM
 * and data is lost when the process restarts.
 * 
 * @typedef {Object} MemoryCacheConfig
 * @property {number} [maxSize=1000] - Maximum number of items to store in cache
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
 * @notes
 * - Memory usage is limited by available RAM and maxSize setting
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
 */
import zlib from 'node:zlib';
import { Cache } from "./cache.class.js"

export class MemoryCache extends Cache {
  constructor(config = {}) {
    super(config);
    this.cache = {};
    this.meta = {};
    this.maxSize = config.maxSize !== undefined ? config.maxSize : 1000;
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
  }

  async _set(key, data) {
    // Limpar se exceder maxSize
    if (this.maxSize > 0 && Object.keys(this.cache).length >= this.maxSize) {
      // Remove o item mais antigo
      const oldestKey = Object.entries(this.meta)
        .sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
      if (oldestKey) {
        delete this.cache[oldestKey];
        delete this.meta[oldestKey];
      }
    }
    
    // Prepare data for storage
    let finalData = data;
    let compressed = false;
    let originalSize = 0;
    let compressedSize = 0;
    
    // Apply compression if enabled
    if (this.enableCompression) {
      try {
        // Serialize data to measure size
        const serialized = JSON.stringify(data);
        originalSize = Buffer.byteLength(serialized, 'utf8');
        
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
    
    this.cache[key] = finalData;
    this.meta[key] = { 
      ts: Date.now(),
      compressed,
      originalSize,
      compressedSize: compressed ? compressedSize : originalSize
    };
    
    return data;
  }

  async _get(key) {
    if (!Object.prototype.hasOwnProperty.call(this.cache, key)) return null;
    
    // Check TTL expiration
    if (this.ttl > 0) {
      const now = Date.now();
      const meta = this.meta[key];
      if (meta && now - meta.ts > this.ttl * 1000) {
        // Expirado
        delete this.cache[key];
        delete this.meta[key];
        return null;
      }
    }
    
    const rawData = this.cache[key];
    
    // Check if data is compressed
    if (rawData && typeof rawData === 'object' && rawData.__compressed) {
      try {
        // Decompress data
        const compressedBuffer = Buffer.from(rawData.__data, 'base64');
        const decompressed = zlib.gunzipSync(compressedBuffer).toString('utf8');
        return JSON.parse(decompressed);
      } catch (error) {
        console.warn(`[MemoryCache] Decompression failed for key '${key}':`, error.message);
        // If decompression fails, remove corrupted entry
        delete this.cache[key];
        delete this.meta[key];
        return null;
      }
    }
    
    // Return uncompressed data
    return rawData;
  }

  async _del(key) {
    delete this.cache[key];
    delete this.meta[key];
    return true;
  }

  async _clear(prefix) {
    if (!prefix) {
      this.cache = {};
      this.meta = {};
      return true;
    }
    // Remove only keys that start with the prefix
    const removed = [];
    for (const key of Object.keys(this.cache)) {
      if (key.startsWith(prefix)) {
        removed.push(key);
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
}

export default MemoryCache
