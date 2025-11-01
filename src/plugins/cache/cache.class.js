import EventEmitter from "events";
import { CacheError } from "../cache.errors.js";

export class Cache extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this._fallbackStore = new Map();
  }
  // to implement:
  async _set (key, data) {}
  async _get (key) {}
  async _del (key) {}
  async _clear (key) {}

  validateKey(key) {
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

  // generic class methods
  async set(key, data) {
    this.validateKey(key);
    this._fallbackStore.set(key, data);
    await this._set(key, data);
    this.emit("set", { key, value: data });
    return data
  }

  async get(key) {
    this.validateKey(key);
    const data = await this._get(key);
    const value = data !== undefined ? data : this._fallbackStore.get(key);
    this.emit("fetched", { key, value });
    return value;
  }

  async del(key) {
    this.validateKey(key);
    const data = await this._del(key);
    this._fallbackStore.delete(key);
    this.emit("deleted", { key, value: data });
    return data;
  }

  async delete(key) {
    return this.del(key);
  }

  async clear(prefix) {
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
    this.emit("clear", { prefix, value: data });
    return data;
  }

  stats() {
    return typeof this.getStats === 'function' ? this.getStats() : {};
  }
}

export default Cache
