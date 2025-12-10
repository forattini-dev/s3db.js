import EventEmitter from 'events';
import { CacheError } from '../cache.errors.js';

export interface CacheConfig {
  [key: string]: unknown;
}

export interface CacheStats {
  enabled?: boolean;
  hits?: number;
  misses?: number;
  sets?: number;
  deletes?: number;
  evictions?: number;
  hitRate?: number;
  [key: string]: unknown;
}

export class Cache extends EventEmitter {
  config: CacheConfig;
  protected _fallbackStore: Map<string, unknown>;

  constructor(config: CacheConfig = {}) {
    super();
    this.config = config;
    this._fallbackStore = new Map();
  }

  protected async _set(_key: string, _data: unknown): Promise<unknown> { return undefined; }
  protected async _get(_key: string): Promise<unknown> { return undefined; }
  protected async _del(_key: string): Promise<unknown> { return undefined; }
  protected async _clear(_prefix?: string): Promise<unknown> { return undefined; }

  validateKey(key: string): void {
    if (key === null || key === undefined || typeof key !== 'string' || !key) {
      throw new CacheError('Invalid cache key', {
        operation: 'validateKey',
        driver: this.constructor.name,
        key,
        keyType: typeof key,
        suggestion: 'Cache key must be a non-empty string'
      });
    }
  }

  async set<T>(key: string, data: T): Promise<T> {
    this.validateKey(key);
    this._fallbackStore.set(key, data);
    await this._set(key, data);
    this.emit('set', { key, value: data });
    return data;
  }

  async get<T>(key: string): Promise<T | undefined> {
    this.validateKey(key);
    const data = await this._get(key);
    const value = data !== undefined ? data : this._fallbackStore.get(key);
    this.emit('fetched', { key, value });
    return value as T | undefined;
  }

  async del(key: string): Promise<unknown> {
    this.validateKey(key);
    const data = await this._del(key);
    this._fallbackStore.delete(key);
    this.emit('deleted', { key, value: data });
    return data;
  }

  async delete(key: string): Promise<unknown> {
    return this.del(key);
  }

  async clear(prefix?: string): Promise<unknown> {
    const data = await this._clear(prefix);
    if (!prefix) {
      this._fallbackStore.clear();
    } else {
      for (const key of this._fallbackStore.keys()) {
        if (key.startsWith(prefix)) {
          this._fallbackStore.delete(key);
        }
      }
    }
    this.emit('clear', { prefix, value: data });
    return data;
  }

}

export default Cache;
