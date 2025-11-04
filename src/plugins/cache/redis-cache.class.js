/**
 * Redis Cache Configuration Documentation
 *
 * This cache implementation uses Redis as a distributed cache backend,
 * providing persistent storage that can be shared across multiple instances.
 * It's suitable for production deployments with multiple servers.
 *
 * @typedef {Object} RedisCacheConfig
 * @property {string} [host='localhost'] - Redis server hostname
 * @property {number} [port=6379] - Redis server port
 * @property {string} [password] - Redis authentication password
 * @property {number} [db=0] - Redis database number (0-15)
 * @property {string} [keyPrefix='cache'] - Prefix for all Redis keys
 * @property {number} [ttl=3600000] - Time to live in milliseconds (1 hour default)
 * @property {boolean} [enableCompression=true] - Whether to compress cache values using gzip
 * @property {number} [compressionThreshold=1024] - Minimum size in bytes to trigger compression
 * @property {number} [connectTimeout=5000] - Connection timeout in milliseconds
 * @property {number} [commandTimeout=5000] - Command execution timeout in milliseconds
 * @property {number} [retryAttempts=3] - Number of retry attempts for failed operations
 * @property {number} [retryDelay=1000] - Delay in milliseconds between retry attempts
 * @property {boolean} [lazyConnect=true] - Connect to Redis on first operation instead of constructor
 * @property {boolean} [keepAlive=true] - Enable TCP keepalive
 * @property {number} [keepAliveInitialDelay=0] - Initial delay for keepalive probes
 * @property {Function} [retryStrategy] - Custom retry strategy function
 * @property {boolean} [enableStats=false] - Track hits/misses/errors
 *
 * @example
 * // Basic configuration
 * {
 *   host: 'localhost',
 *   port: 6379,
 *   keyPrefix: 'app-cache/',
 *   ttl: 3600000, // 1 hour
 *   enableCompression: true
 * }
 *
 * @example
 * // Production with authentication and compression
 * {
 *   host: 'redis.production.com',
 *   port: 6379,
 *   password: 'secret',
 *   db: 1,
 *   keyPrefix: 'myapp-cache/',
 *   ttl: 7200000, // 2 hours
 *   enableCompression: true,
 *   compressionThreshold: 512,
 *   retryAttempts: 5
 * }
 *
 * @example
 * // High-performance configuration
 * {
 *   host: 'localhost',
 *   port: 6379,
 *   keyPrefix: 'cache/',
 *   enableCompression: false, // Disable for speed
 *   connectTimeout: 3000,
 *   commandTimeout: 3000,
 *   keepAlive: true
 * }
 *
 * @notes
 * - Requires 'ioredis' package as peer dependency
 * - TTL is enforced by Redis native expiration
 * - Compression reduces network bandwidth and storage
 * - All operations are async and return Promises
 * - Connection pooling is handled by ioredis
 * - Supports Redis Cluster and Sentinel (via ioredis options)
 * - Keys are namespaced with keyPrefix to avoid collisions
 * - Automatic reconnection with exponential backoff
 */
import zlib from "node:zlib";
import { promisify } from "node:util";
import { Cache } from "./cache.class.js";
import { CacheError } from "../cache.errors.js";
import { requirePluginDependency } from "../concerns/plugin-dependencies.js";
import { getCronManager } from "../../concerns/cron-manager.js";

const gzip = promisify(zlib.gzip);
const unzip = promisify(zlib.unzip);

export class RedisCache extends Cache {
  constructor({
    host = 'localhost',
    port = 6379,
    password,
    db = 0,
    keyPrefix = 'cache',
    ttl = 3600000,
    enableCompression = true,
    compressionThreshold = 1024,
    connectTimeout = 5000,
    commandTimeout = 5000,
    retryAttempts = 3,
    retryDelay = 1000,
    lazyConnect = true,
    keepAlive = true,
    keepAliveInitialDelay = 0,
    retryStrategy,
    enableStats = false,
    ...redisOptions
  }) {
    super();

    // Validate ioredis dependency
    requirePluginDependency('ioredis', 'RedisCache');

    this.config = {
      host,
      port,
      password,
      db,
      keyPrefix: keyPrefix.endsWith('/') ? keyPrefix : keyPrefix + '/',
      ttl,
      enableCompression,
      compressionThreshold,
      connectTimeout,
      commandTimeout,
      retryAttempts,
      retryDelay,
      lazyConnect,
      keepAlive,
      keepAliveInitialDelay,
      retryStrategy,
      enableStats,
      ...redisOptions
    };

    this.ttlMs = typeof ttl === 'number' && ttl > 0 ? ttl : 0;
    this.ttlSeconds = this.ttlMs > 0 ? Math.ceil(this.ttlMs / 1000) : 0;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      sets: 0,
      deletes: 0,
      enabled: enableStats
    };

    // Redis client will be initialized on first use (lazy connect)
    this.client = null;
    this.connected = false;
    this.connecting = false;
    this.connectionCheckJobName = null;
  }

  /**
   * Initialize Redis connection
   * @private
   */
  async _ensureConnection() {
    if (this.connected) return;
    if (this.connecting) {
      // Wait for existing connection attempt
      await new Promise(resolve => {
        const cronManager = getCronManager();
        this.connectionCheckJobName = cronManager.scheduleInterval(
          50,
          () => {
            if (this.connected || !this.connecting) {
              if (this.connectionCheckJobName) {
                cronManager.stop(this.connectionCheckJobName);
                this.connectionCheckJobName = null;
              }
              resolve();
            }
          },
          `redis-connection-check-${Date.now()}`
        );
      });
      return;
    }

    this.connecting = true;

    try {
      // Dynamic import of ioredis
      const Redis = (await import('ioredis')).default;

      // Create Redis client with configuration
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        connectTimeout: this.config.connectTimeout,
        commandTimeout: this.config.commandTimeout,
        lazyConnect: this.config.lazyConnect,
        keepAlive: this.config.keepAlive,
        keepAliveInitialDelay: this.config.keepAliveInitialDelay,
        retryStrategy: this.config.retryStrategy || ((times) => {
          if (times > this.config.retryAttempts) {
            return null; // Stop retrying
          }
          return Math.min(times * this.config.retryDelay, 5000); // Max 5s delay
        }),
        ...this.config.redisOptions
      });

      // Wait for connection if lazy connect
      if (this.config.lazyConnect) {
        await this.client.connect();
      }

      this.connected = true;
      this.connecting = false;

      // Handle connection events
      this.client.on('error', (err) => {
        if (this.config.enableStats) {
          this.stats.errors++;
        }
        console.error('Redis connection error:', err);
      });

      this.client.on('close', () => {
        this.connected = false;
      });

      this.client.on('reconnecting', () => {
        this.connected = false;
        this.connecting = true;
      });

      this.client.on('ready', () => {
        this.connected = true;
        this.connecting = false;
      });

    } catch (error) {
      this.connecting = false;
      throw new CacheError('Failed to connect to Redis', {
        operation: 'connect',
        driver: 'RedisCache',
        config: {
          host: this.config.host,
          port: this.config.port,
          db: this.config.db
        },
        cause: error,
        suggestion: 'Ensure Redis server is running and accessible. Install ioredis: npm install ioredis'
      });
    }
  }

  /**
   * Build full Redis key with prefix
   * @private
   */
  _getKey(key) {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Compress data if enabled and above threshold
   * @private
   */
  async _compressData(data) {
    const jsonString = JSON.stringify(data);

    // Don't compress if disabled or below threshold
    if (!this.config.enableCompression || jsonString.length < this.config.compressionThreshold) {
      return {
        data: jsonString,
        compressed: false,
        originalSize: jsonString.length
      };
    }

    // Compress with gzip
    const compressed = await gzip(Buffer.from(jsonString, 'utf-8'));
    return {
      data: compressed.toString('base64'),
      compressed: true,
      originalSize: jsonString.length,
      compressedSize: compressed.length,
      compressionRatio: (compressed.length / jsonString.length).toFixed(2)
    };
  }

  /**
   * Decompress data if needed
   * @private
   */
  async _decompressData(storedData) {
    if (!storedData) return null;

    // Parse the stored metadata
    const metadata = JSON.parse(storedData);

    if (!metadata.compressed) {
      // Not compressed - parse JSON directly
      return JSON.parse(metadata.data);
    }

    // Decompress gzip data
    const buffer = Buffer.from(metadata.data, 'base64');
    const decompressed = await unzip(buffer);
    return JSON.parse(decompressed.toString('utf-8'));
  }

  async _set(key, data) {
    await this._ensureConnection();

    try {
      const compressed = await this._compressData(data);
      const redisKey = this._getKey(key);
      const value = JSON.stringify(compressed);

      // Set with TTL if configured
      if (this.ttlSeconds > 0) {
        await this.client.setex(redisKey, this.ttlSeconds, value);
      } else {
        await this.client.set(redisKey, value);
      }

      if (this.config.enableStats) {
        this.stats.sets++;
      }

      return true;
    } catch (error) {
      if (this.config.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError('Failed to set cache value in Redis', {
        operation: 'set',
        driver: 'RedisCache',
        key,
        cause: error,
        retriable: true,
        suggestion: 'Check Redis connection and server status'
      });
    }
  }

  async _get(key) {
    await this._ensureConnection();

    try {
      const redisKey = this._getKey(key);
      const value = await this.client.get(redisKey);

      if (!value) {
        if (this.config.enableStats) {
          this.stats.misses++;
        }
        return null;
      }

      if (this.config.enableStats) {
        this.stats.hits++;
      }

      return await this._decompressData(value);
    } catch (error) {
      if (this.config.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError('Failed to get cache value from Redis', {
        operation: 'get',
        driver: 'RedisCache',
        key,
        cause: error,
        retriable: true,
        suggestion: 'Check Redis connection and server status'
      });
    }
  }

  async _del(key) {
    await this._ensureConnection();

    try {
      const redisKey = this._getKey(key);
      await this.client.del(redisKey);

      if (this.config.enableStats) {
        this.stats.deletes++;
      }

      return true;
    } catch (error) {
      if (this.config.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError('Failed to delete cache key from Redis', {
        operation: 'delete',
        driver: 'RedisCache',
        key,
        cause: error,
        retriable: true,
        suggestion: 'Check Redis connection and server status'
      });
    }
  }

  async _clear(prefix) {
    await this._ensureConnection();

    try {
      const pattern = prefix
        ? `${this.config.keyPrefix}${prefix}*`
        : `${this.config.keyPrefix}*`;

      // Use SCAN to avoid blocking Redis (safer than KEYS)
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );

        cursor = nextCursor;

        if (keys.length > 0) {
          await this.client.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      if (this.config.enableStats) {
        this.stats.deletes += deletedCount;
      }

      return true;
    } catch (error) {
      if (this.config.enableStats) {
        this.stats.errors++;
      }
      throw new CacheError('Failed to clear cache keys from Redis', {
        operation: 'clear',
        driver: 'RedisCache',
        prefix,
        cause: error,
        retriable: true,
        suggestion: 'Check Redis connection and server status'
      });
    }
  }

  async size() {
    await this._ensureConnection();

    try {
      const pattern = `${this.config.keyPrefix}*`;
      let cursor = '0';
      let count = 0;

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );

        cursor = nextCursor;
        count += keys.length;
      } while (cursor !== '0');

      return count;
    } catch (error) {
      throw new CacheError('Failed to get cache size from Redis', {
        operation: 'size',
        driver: 'RedisCache',
        cause: error,
        retriable: true,
        suggestion: 'Check Redis connection and server status'
      });
    }
  }

  async keys() {
    await this._ensureConnection();

    try {
      const pattern = `${this.config.keyPrefix}*`;
      const allKeys = [];
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );

        cursor = nextCursor;

        // Remove prefix from keys
        const cleanKeys = keys.map(k => k.startsWith(this.config.keyPrefix)
          ? k.slice(this.config.keyPrefix.length)
          : k
        );

        allKeys.push(...cleanKeys);
      } while (cursor !== '0');

      return allKeys;
    } catch (error) {
      throw new CacheError('Failed to get cache keys from Redis', {
        operation: 'keys',
        driver: 'RedisCache',
        cause: error,
        retriable: true,
        suggestion: 'Check Redis connection and server status'
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    if (!this.stats.enabled) {
      return {
        enabled: false,
        message: 'Statistics are disabled. Enable with enableStats: true'
      };
    }

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      enabled: true,
      hits: this.stats.hits,
      misses: this.stats.misses,
      errors: this.stats.errors,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      total,
      hitRate,
      hitRatePercent: (hitRate * 100).toFixed(2) + '%'
    };
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
      this.client = null;
    }
  }
}

export default RedisCache;
