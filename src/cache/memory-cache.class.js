import { Cache } from "./cache.class.js"

export class MemoryCache extends Cache {
  constructor() {
    super();
    this.cache = {};
  }

  async _set(key, data) {
    this.cache[key] = data;
    return data;
  }

  async _get(key) {
    return this.cache[key];
  }

  async _del(key) {
    delete this.cache[key];
    return true;
  }

  async _clear() {
    this.cache = {};
    return true;
  }
}

export default MemoryCache
