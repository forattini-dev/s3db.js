import zlib from 'node:zlib';
import os from 'node:os';
import v8 from 'node:v8';
import { Cache } from './cache.class.js';
import { CacheError } from '../cache.errors.js';
import { createLogger } from '../../concerns/logger.js';
export class MemoryCache extends Cache {
    logger;
    caseSensitive;
    serializer;
    deserializer;
    enableStats;
    evictionPolicy;
    cache;
    meta;
    maxSize;
    maxMemoryBytes;
    maxMemoryPercent;
    ttl;
    enableCompression;
    compressionThreshold;
    heapUsageThreshold;
    monitorInterval;
    compressionStats;
    currentMemoryBytes;
    evictedDueToMemory;
    memoryPressureEvents;
    _monitorHandle;
    _accessCounter;
    stats;
    constructor(config = {}) {
        super(config);
        this.logger = createLogger({ name: 'MemoryCache', level: 'warn' });
        this.caseSensitive = config.caseSensitive !== undefined ? config.caseSensitive : true;
        this.serializer = typeof config.serializer === 'function' ? config.serializer : JSON.stringify;
        const defaultDeserializer = (str) => {
            return JSON.parse(str, (_key, value) => {
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
                    return new Date(value);
                }
                return value;
            });
        };
        this.deserializer = typeof config.deserializer === 'function' ? config.deserializer : defaultDeserializer;
        this.enableStats = config.enableStats === true;
        this.evictionPolicy = (config.evictionPolicy || 'lru').toLowerCase();
        if (!['lru', 'fifo'].includes(this.evictionPolicy)) {
            this.evictionPolicy = 'fifo';
        }
        this.cache = {};
        this.meta = {};
        this.maxSize = config.maxSize !== undefined ? config.maxSize : 1000;
        if (config.maxMemoryBytes && config.maxMemoryBytes > 0 &&
            config.maxMemoryPercent && config.maxMemoryPercent > 0) {
            throw new CacheError('[MemoryCache] Cannot use both maxMemoryBytes and maxMemoryPercent', {
                driver: 'memory',
                operation: 'constructor',
                statusCode: 400,
                retriable: false,
                suggestion: 'Choose either maxMemoryBytes or maxMemoryPercent to limit memory usage.'
            });
        }
        if (config.maxMemoryPercent && config.maxMemoryPercent > 0) {
            if (config.maxMemoryPercent > 1) {
                throw new CacheError('[MemoryCache] maxMemoryPercent must be between 0 and 1', {
                    driver: 'memory',
                    operation: 'constructor',
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'Provide a fraction between 0 and 1 (e.g., 0.1 for 10%).',
                    maxMemoryPercent: config.maxMemoryPercent
                });
            }
            const totalMemory = os.totalmem();
            this.maxMemoryBytes = Math.floor(totalMemory * config.maxMemoryPercent);
            this.maxMemoryPercent = config.maxMemoryPercent;
        }
        else {
            this.maxMemoryBytes = config.maxMemoryBytes !== undefined ? config.maxMemoryBytes : 0;
            this.maxMemoryPercent = 0;
        }
        this.ttl = config.ttl !== undefined ? config.ttl : 300000;
        this.enableCompression = config.enableCompression !== undefined ? config.enableCompression : false;
        this.compressionThreshold = config.compressionThreshold !== undefined ? config.compressionThreshold : 1024;
        this.heapUsageThreshold = config.heapUsageThreshold ?? 0.6;
        if (!(this.heapUsageThreshold > 0 && this.heapUsageThreshold < 1)) {
            this.heapUsageThreshold = 0.6;
        }
        this.monitorInterval = config.monitorInterval === undefined ? 15000 : config.monitorInterval;
        this.compressionStats = {
            totalCompressed: 0,
            totalOriginalSize: 0,
            totalCompressedSize: 0,
            compressionRatio: '0'
        };
        this.currentMemoryBytes = 0;
        this.evictedDueToMemory = 0;
        this.memoryPressureEvents = 0;
        this._monitorHandle = null;
        this._accessCounter = 0;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
        if (this.monitorInterval > 0) {
            this._monitorHandle = setInterval(() => this._memoryHealthCheck(), this.monitorInterval);
            if (typeof this._monitorHandle?.unref === 'function') {
                this._monitorHandle.unref();
            }
        }
    }
    _normalizeKey(key) {
        return this.caseSensitive ? key : key.toLowerCase();
    }
    _recordStat(type) {
        if (!this.enableStats)
            return;
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
            entries.sort((a, b) => (a[1].accessOrder ?? a[1].insertOrder ?? 0) - (b[1].accessOrder ?? b[1].insertOrder ?? 0));
        }
        else {
            entries.sort((a, b) => (a[1].insertOrder ?? a[1].createdAt ?? a[1].ts) - (b[1].insertOrder ?? b[1].createdAt ?? b[1].ts));
        }
        return entries[0]?.[0] || null;
    }
    _evictKey(key) {
        if (!key || !Object.prototype.hasOwnProperty.call(this.cache, key)) {
            return 0;
        }
        const evictedSize = this.meta[key]?.compressedSize || 0;
        delete this.cache[key];
        delete this.meta[key];
        this.currentMemoryBytes = Math.max(0, this.currentMemoryBytes - evictedSize);
        this.evictedDueToMemory++;
        this._recordStat('evictions');
        return evictedSize;
    }
    _enforceMemoryLimit(incomingSize = 0) {
        if (this.maxMemoryBytes > 0) {
            if (incomingSize > this.maxMemoryBytes) {
                return false;
            }
            while (this.currentMemoryBytes + incomingSize > this.maxMemoryBytes && Object.keys(this.cache).length > 0) {
                const candidate = this._selectEvictionCandidate();
                if (!candidate)
                    break;
                this._evictKey(candidate);
            }
            if (this.currentMemoryBytes + incomingSize > this.maxMemoryBytes) {
                return false;
            }
        }
        return true;
    }
    _reduceMemoryTo(targetBytes) {
        targetBytes = Math.max(0, targetBytes);
        while (this.currentMemoryBytes > targetBytes && Object.keys(this.cache).length > 0) {
            const candidate = this._selectEvictionCandidate();
            if (!candidate)
                break;
            this._evictKey(candidate);
        }
    }
    _memoryHealthCheck() {
        let freedBytes = 0;
        if (this.maxMemoryBytes > 0 && this.currentMemoryBytes > this.maxMemoryBytes) {
            const before = this.currentMemoryBytes;
            this._enforceMemoryLimit(0);
            const diff = Math.max(0, before - this.currentMemoryBytes);
            if (diff > 0) {
                freedBytes += diff;
                if (this.config?.logEvictions) {
                    this.logger.warn(`[MemoryCache] Reduced cache size from ${this._formatBytes(before)} to ${this._formatBytes(this.currentMemoryBytes)} to respect maxMemoryBytes.`);
                }
                this.emit('memory:evict', {
                    reason: 'limit',
                    freedBytes: diff,
                    currentBytes: this.currentMemoryBytes,
                    maxMemoryBytes: this.maxMemoryBytes
                });
                this.emit('memory:pressure', {
                    reason: 'limit',
                    heapLimit: v8.getHeapStatistics()?.heap_size_limit ?? 0,
                    heapUsed: process.memoryUsage().heapUsed,
                    currentBytes: this.currentMemoryBytes,
                    maxMemoryBytes: this.maxMemoryBytes,
                    freedBytes: diff
                });
                this.memoryPressureEvents += 1;
            }
        }
        const heapStats = v8.getHeapStatistics();
        const heapLimit = heapStats?.heap_size_limit;
        if (heapLimit && heapLimit > 0) {
            const { heapUsed } = process.memoryUsage();
            const heapRatio = heapUsed / heapLimit;
            if (heapRatio >= this.heapUsageThreshold) {
                const before = this.currentMemoryBytes;
                const target = this.maxMemoryBytes > 0
                    ? Math.min(Math.floor(this.maxMemoryBytes * 0.5), this.currentMemoryBytes)
                    : Math.floor(this.currentMemoryBytes * 0.5);
                this._reduceMemoryTo(target);
                const diff = Math.max(0, before - this.currentMemoryBytes);
                if (diff > 0) {
                    freedBytes += diff;
                    if (this.config?.logEvictions) {
                        this.logger.warn(`[MemoryCache] Heap usage ${(heapRatio * 100).toFixed(1)}% exceeded threshold ${(this.heapUsageThreshold * 100).toFixed(1)}%. Evicted ${this._formatBytes(diff)} (current: ${this._formatBytes(this.currentMemoryBytes)}).`);
                    }
                    this.emit('memory:evict', {
                        reason: 'heap',
                        freedBytes: diff,
                        currentBytes: this.currentMemoryBytes,
                        heapLimit,
                        heapUsed
                    });
                }
                this.memoryPressureEvents += 1;
                this.emit('memory:pressure', {
                    reason: 'heap',
                    heapLimit,
                    heapUsed,
                    heapRatio,
                    currentBytes: this.currentMemoryBytes,
                    maxMemoryBytes: this.maxMemoryBytes,
                    freedBytes: diff
                });
            }
        }
        return freedBytes;
    }
    async shutdown() {
        if (this._monitorHandle) {
            clearInterval(this._monitorHandle);
            this._monitorHandle = null;
        }
    }
    async _set(key, data) {
        const normalizedKey = this._normalizeKey(key);
        let serialized;
        try {
            serialized = this.serializer(data);
        }
        catch (error) {
            throw new CacheError(`Failed to serialize data for key '${key}'`, {
                driver: 'memory',
                operation: 'set',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure the custom serializer handles the provided data type.',
                key,
                original: error
            });
        }
        let finalData = serialized;
        let compressed = false;
        let originalSize = 0;
        let compressedSize = 0;
        if (typeof serialized !== 'string') {
            throw new CacheError('MemoryCache serializer must return a string', {
                driver: 'memory',
                operation: 'set',
                statusCode: 500,
                retriable: false,
                suggestion: 'Update the custom serializer to return a string output.'
            });
        }
        originalSize = Buffer.byteLength(serialized, 'utf8');
        if (this.enableCompression) {
            try {
                if (originalSize >= this.compressionThreshold) {
                    const compressedBuffer = zlib.gzipSync(Buffer.from(serialized, 'utf8'));
                    finalData = {
                        __compressed: true,
                        __data: compressedBuffer.toString('base64'),
                        __originalSize: originalSize
                    };
                    compressedSize = Buffer.byteLength(finalData.__data, 'utf8');
                    compressed = true;
                    this.compressionStats.totalCompressed++;
                    this.compressionStats.totalOriginalSize += originalSize;
                    this.compressionStats.totalCompressedSize += compressedSize;
                    this.compressionStats.compressionRatio =
                        (this.compressionStats.totalCompressedSize / this.compressionStats.totalOriginalSize).toFixed(2);
                }
            }
            catch (error) {
                this.logger.warn(`[MemoryCache] Compression failed for key '${key}': ${error.message}`);
            }
        }
        const itemSize = compressed ? compressedSize : originalSize;
        if (Object.prototype.hasOwnProperty.call(this.cache, normalizedKey)) {
            const oldSize = this.meta[normalizedKey]?.compressedSize || 0;
            this.currentMemoryBytes = Math.max(0, this.currentMemoryBytes - oldSize);
        }
        if (!this._enforceMemoryLimit(itemSize)) {
            this.evictedDueToMemory++;
            return data;
        }
        if (this.maxSize > 0 && !Object.prototype.hasOwnProperty.call(this.cache, normalizedKey) && Object.keys(this.cache).length >= this.maxSize) {
            const candidate = this._selectEvictionCandidate();
            if (candidate) {
                this._evictKey(candidate);
            }
        }
        this.cache[normalizedKey] = finalData;
        const timestamp = Date.now();
        const insertOrder = ++this._accessCounter;
        this.meta[normalizedKey] = {
            ts: timestamp,
            createdAt: timestamp,
            lastAccess: timestamp,
            insertOrder,
            accessOrder: insertOrder,
            compressed,
            originalSize,
            compressedSize: itemSize,
            originalKey: key
        };
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
        if (this.ttl > 0) {
            const now = Date.now();
            const meta = this.meta[normalizedKey];
            if (meta && now - (meta.createdAt ?? meta.ts) > this.ttl) {
                const itemSize = meta.compressedSize || 0;
                this.currentMemoryBytes -= itemSize;
                delete this.cache[normalizedKey];
                delete this.meta[normalizedKey];
                this._recordStat('misses');
                return null;
            }
        }
        const rawData = this.cache[normalizedKey];
        if (rawData && typeof rawData === 'object' && rawData.__compressed) {
            try {
                const compressedBuffer = Buffer.from(rawData.__data, 'base64');
                const decompressed = zlib.gunzipSync(compressedBuffer).toString('utf8');
                const value = this.deserializer(decompressed);
                this._recordStat('hits');
                if (this.evictionPolicy === 'lru' && this.meta[normalizedKey]) {
                    this.meta[normalizedKey].lastAccess = Date.now();
                    this.meta[normalizedKey].accessOrder = ++this._accessCounter;
                }
                return value;
            }
            catch (error) {
                this.logger.warn(`[MemoryCache] Decompression failed for key '${key}': ${error.message}`);
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
                this.meta[normalizedKey].accessOrder = ++this._accessCounter;
            }
            return value;
        }
        catch (error) {
            this.logger.warn(`[MemoryCache] Deserialization failed for key '${key}': ${error.message}`);
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
            this.currentMemoryBytes = 0;
            this.evictedDueToMemory = 0;
            if (this.enableStats) {
                this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
            }
            return true;
        }
        const normalizedPrefix = this._normalizeKey(prefix);
        for (const key of Object.keys(this.cache)) {
            if (key.startsWith(normalizedPrefix)) {
                const itemSize = this.meta[key]?.compressedSize || 0;
                this.currentMemoryBytes -= itemSize;
                delete this.cache[key];
                delete this.meta[key];
            }
        }
        return true;
    }
    async size() {
        return Object.keys(this.cache).length;
    }
    async keys() {
        return Object.keys(this.cache).map(key => this.meta[key]?.originalKey || key);
    }
    getStats() {
        if (!this.enableStats) {
            return { enabled: false, hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
        }
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? this.stats.hits / total : 0;
        return {
            ...this.stats,
            memoryUsageBytes: this.currentMemoryBytes,
            maxMemoryBytes: this.maxMemoryBytes,
            evictedDueToMemory: this.evictedDueToMemory,
            hitRate,
            monitorInterval: this.monitorInterval,
            heapUsageThreshold: this.heapUsageThreshold
        };
    }
    getCompressionStats() {
        if (!this.enableCompression) {
            return { enabled: false, message: 'Compression is disabled' };
        }
        const spaceSavings = this.compressionStats.totalOriginalSize > 0
            ? ((this.compressionStats.totalOriginalSize - this.compressionStats.totalCompressedSize) / this.compressionStats.totalOriginalSize * 100).toFixed(2)
            : '0';
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
    getMemoryStats() {
        const totalItems = Object.keys(this.cache).length;
        const memoryUsagePercent = this.maxMemoryBytes > 0
            ? parseFloat(((this.currentMemoryBytes / this.maxMemoryBytes) * 100).toFixed(2))
            : 0;
        const systemMemory = {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem()
        };
        const cachePercentOfTotal = systemMemory.total > 0
            ? parseFloat(((this.currentMemoryBytes / systemMemory.total) * 100).toFixed(2))
            : 0;
        return {
            currentMemoryBytes: this.currentMemoryBytes,
            maxMemoryBytes: this.maxMemoryBytes,
            maxMemoryPercent: this.maxMemoryPercent,
            memoryUsagePercent,
            cachePercentOfSystemMemory: cachePercentOfTotal,
            totalItems,
            maxSize: this.maxSize,
            evictedDueToMemory: this.evictedDueToMemory,
            memoryPressureEvents: this.memoryPressureEvents,
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
    _formatBytes(bytes) {
        if (bytes === 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }
}
export default MemoryCache;
//# sourceMappingURL=memory-cache.class.js.map