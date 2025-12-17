/**
 * Fixed-size circular buffer for efficient rolling metrics.
 * Used by GlobalCoordinatorService for latency percentile tracking.
 *
 * Inspired by etcd's histogram-based metrics but implemented as a simple
 * ring buffer to avoid external dependencies.
 */
export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private _count: number = 0;

  constructor(private capacity: number) {
    if (capacity < 1) {
      throw new Error('RingBuffer capacity must be at least 1');
    }
    this.buffer = new Array(capacity);
  }

  push(value: T): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this._count < this.capacity) {
      this._count++;
    }
  }

  toArray(): T[] {
    if (this._count === 0) return [];

    const result: T[] = [];
    if (this._count < this.capacity) {
      for (let i = 0; i < this._count; i++) {
        result.push(this.buffer[i] as T);
      }
    } else {
      for (let i = 0; i < this.capacity; i++) {
        const idx = (this.head + i) % this.capacity;
        result.push(this.buffer[idx] as T);
      }
    }
    return result;
  }

  get count(): number {
    return this._count;
  }

  get isFull(): boolean {
    return this._count === this.capacity;
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this._count = 0;
  }
}

/**
 * Specialized ring buffer for numeric latency tracking with percentile calculations.
 */
export class LatencyBuffer extends RingBuffer<number> {
  private sortedCache: number[] | null = null;
  private sortedCacheVersion: number = 0;
  private currentVersion: number = 0;

  constructor(capacity: number = 100) {
    super(capacity);
  }

  override push(value: number): void {
    super.push(value);
    this.currentVersion++;
    this.sortedCache = null;
  }

  private getSorted(): number[] {
    if (this.sortedCache && this.sortedCacheVersion === this.currentVersion) {
      return this.sortedCache;
    }

    this.sortedCache = this.toArray().sort((a, b) => a - b);
    this.sortedCacheVersion = this.currentVersion;
    return this.sortedCache;
  }

  percentile(p: number): number {
    if (p < 0 || p > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }

    const sorted = this.getSorted();
    if (sorted.length === 0) return 0;

    if (p === 0) return sorted[0]!;
    if (p === 100) return sorted[sorted.length - 1]!;

    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)]!;
  }

  p50(): number {
    return this.percentile(50);
  }

  p95(): number {
    return this.percentile(95);
  }

  p99(): number {
    return this.percentile(99);
  }

  max(): number {
    const sorted = this.getSorted();
    return sorted.length > 0 ? sorted[sorted.length - 1]! : 0;
  }

  min(): number {
    const sorted = this.getSorted();
    return sorted.length > 0 ? sorted[0]! : 0;
  }

  avg(): number {
    const arr = this.toArray();
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  getStats(): LatencyStats {
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

  override clear(): void {
    super.clear();
    this.sortedCache = null;
    this.currentVersion++;
  }
}

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}
