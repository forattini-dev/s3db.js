import EventEmitter from "events";

export class Cache extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
  }
  // to implement:
  async _set (key, data) {}
  async _get (key) {}
  async _del (key) {}
  async _clear (key) {}

  validateKey(key) {
    if (key === null || key === undefined || typeof key !== 'string' || !key) {
      throw new Error('Invalid key');
    }
  }

  // generic class methods
  async set(key, data) {
    this.validateKey(key);
    await this._set(key, data);
    this.emit("set", data);
    return data
  }

  async get(key) {
    this.validateKey(key);
    const data = await this._get(key);
    this.emit("get", data);
    return data;
  }

  async del(key) {
    this.validateKey(key);
    const data = await this._del(key);
    this.emit("delete", data);
    return data;
  }

  async delete(key) {
    return this.del(key);
  }

  async clear() {
    const data = await this._clear();
    this.emit("clear", data);
    return data;
  }
}

export default Cache
