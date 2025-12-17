/**
 * Fixed-size circular buffer for efficient rolling metrics.
 * Used by GlobalCoordinatorService for latency percentile tracking.
 *
 * Inspired by etcd's histogram-based metrics but implemented as a simple
 * ring buffer to avoid external dependencies.
 */
export class RingBuffer {
    capacity;
    buffer;
    head = 0;
    _count = 0;
    constructor(capacity) {
        this.capacity = capacity;
        if (capacity < 1) {
            throw new Error('RingBuffer capacity must be at least 1');
        }
        this.buffer = new Array(capacity);
    }
    push(value) {
        this.buffer[this.head] = value;
        this.head = (this.head + 1) % this.capacity;
        if (this._count < this.capacity) {
            this._count++;
        }
    }
    toArray() {
        if (this._count === 0)
            return [];
        const result = [];
        if (this._count < this.capacity) {
            for (let i = 0; i < this._count; i++) {
                result.push(this.buffer[i]);
            }
        }
        else {
            for (let i = 0; i < this.capacity; i++) {
                const idx = (this.head + i) % this.capacity;
                result.push(this.buffer[idx]);
            }
        }
        return result;
    }
    get count() {
        return this._count;
    }
    get isFull() {
        return this._count === this.capacity;
    }
    clear() {
        this.buffer = new Array(this.capacity);
        this.head = 0;
        this._count = 0;
    }
}
/**
 * Specialized ring buffer for numeric latency tracking with percentile calculations.
 */
export class LatencyBuffer extends RingBuffer {
    sortedCache = null;
    sortedCacheVersion = 0;
    currentVersion = 0;
    constructor(capacity = 100) {
        super(capacity);
    }
    push(value) {
        super.push(value);
        this.currentVersion++;
        this.sortedCache = null;
    }
    getSorted() {
        if (this.sortedCache && this.sortedCacheVersion === this.currentVersion) {
            return this.sortedCache;
        }
        this.sortedCache = this.toArray().sort((a, b) => a - b);
        this.sortedCacheVersion = this.currentVersion;
        return this.sortedCache;
    }
    percentile(p) {
        if (p < 0 || p > 100) {
            throw new Error('Percentile must be between 0 and 100');
        }
        const sorted = this.getSorted();
        if (sorted.length === 0)
            return 0;
        if (p === 0)
            return sorted[0];
        if (p === 100)
            return sorted[sorted.length - 1];
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    }
    p50() {
        return this.percentile(50);
    }
    p95() {
        return this.percentile(95);
    }
    p99() {
        return this.percentile(99);
    }
    max() {
        const sorted = this.getSorted();
        return sorted.length > 0 ? sorted[sorted.length - 1] : 0;
    }
    min() {
        const sorted = this.getSorted();
        return sorted.length > 0 ? sorted[0] : 0;
    }
    avg() {
        const arr = this.toArray();
        if (arr.length === 0)
            return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }
    getStats() {
        return {
            count: this.count,
            min: this.min(),
            max: this.max(),
            avg: this.avg(),
            p50: this.p50(),
            p95: this.p95(),
            p99: this.p99()
        };
    }
    clear() {
        super.clear();
        this.sortedCache = null;
        this.currentVersion++;
    }
}
//# sourceMappingURL=ring-buffer.js.map