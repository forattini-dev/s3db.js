export interface LRUCacheOptions {
  max?: number;
  ttl?: number;
}

interface CacheItem<T> {
  value: T;
  timestamp: number;
}

export class LRUCache<T = unknown> {
  private max: number;
  private ttl: number;
  private cache: Map<string, CacheItem<T>>;

  constructor(options: LRUCacheOptions = {}) {
    this.max = options.max || 1000;
    this.ttl = options.ttl || 60000;
    this.cache = new Map();
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);

    if (!item) {
      return undefined;
    }

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    this.cache.delete(key);
    this.cache.set(key, item);

    return item.value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    if (this.cache.size >= this.max) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
