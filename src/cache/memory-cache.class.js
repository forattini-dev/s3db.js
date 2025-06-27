import { Cache } from "./cache.class.js"

export class MemoryCache extends Cache {
  constructor(config = {}) {
    super(config);
    this.cache = {};
    this.meta = {};
    this.maxSize = config.maxSize || 0;
    this.ttl = config.ttl || 0;
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
    this.cache[key] = data;
    this.meta[key] = { ts: Date.now() };
    return data;
  }

  async _get(key) {
    if (!Object.prototype.hasOwnProperty.call(this.cache, key)) return null;
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
    return this.cache[key];
  }

  async _del(key) {
    delete this.cache[key];
    delete this.meta[key];
    return true;
  }

  async _clear() {
    this.cache = {};
    this.meta = {};
    return true;
  }

  async size() {
    return Object.keys(this.cache).length;
  }

  async keys() {
    return Object.keys(this.cache);
  }
}

export default MemoryCache
