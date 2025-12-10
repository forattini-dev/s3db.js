export interface QueueItem<T = unknown> {
  task?: T;
  priority?: number;
  [key: string]: unknown;
}

export class FifoTaskQueue<T = unknown> {
  public buffer: Array<T | undefined>;
  public mask: number;
  public head: number;
  public tail: number;

  constructor(capacity: number = 32) {
    const size = this._normalizeCapacity(capacity);
    this.buffer = new Array(size);
    this.mask = size - 1;
    this.head = 0;
    this.tail = 0;
  }

  get length(): number {
    return this.tail - this.head;
  }

  enqueue(value: T): void {
    if (this.length >= this.buffer.length) {
      this._grow();
    }
    const index = this.tail & this.mask;
    this.buffer[index] = value;
    this.tail++;
  }

  dequeue(): T | null {
    if (this.head === this.tail) {
      return null;
    }
    const index = this.head & this.mask;
    const value = this.buffer[index];
    this.buffer[index] = undefined;
    this.head++;
    if (this.head === this.tail) {
      this.head = 0;
      this.tail = 0;
    }
    return value as T;
  }

  flush(callback?: (item: T) => void): void {
    if (typeof callback === 'function') {
      for (let i = this.head; i < this.tail; i++) {
        const value = this.buffer[i & this.mask];
        if (value !== undefined) {
          callback(value as T);
        }
      }
    }
    this.clear();
  }

  clear(): void {
    if (this.head !== this.tail) {
      for (let i = this.head; i < this.tail; i++) {
        this.buffer[i & this.mask] = undefined;
      }
    }
    this.head = 0;
    this.tail = 0;
  }

  setAgingMultiplier(_multiplier?: number): void {
    // Compatibility no-op for TasksPool.
  }

  toArray(): T[] {
    const len = this.length;
    if (len === 0) {
      return [];
    }
    const snapshot: T[] = new Array(len);
    for (let i = 0; i < len; i++) {
      snapshot[i] = this.buffer[(this.head + i) & this.mask] as T;
    }
    return snapshot;
  }

  private _grow(): void {
    const newSize = this.buffer.length * 2;
    const next: Array<T | undefined> = new Array(newSize);
    const len = this.length;
    for (let i = 0; i < len; i++) {
      next[i] = this.buffer[(this.head + i) & this.mask];
    }
    this.buffer = next;
    this.mask = newSize - 1;
    this.head = 0;
    this.tail = len;
  }

  private _normalizeCapacity(value: number): number {
    let size = 8;
    const normalized = Number.isFinite(value) && value > 0 ? Math.ceil(value) : size;
    const target = Math.max(size, normalized);
    while (size < target) {
      size <<= 1;
    }
    return size;
  }
}
