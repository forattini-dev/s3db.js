import EventEmitter from "events";

export class Cache extends EventEmitter {
  // to implement:
  async _set (key, data) {}
  async _get (key) {}
  async _del (key) {}
  async _clear (key) {}

  // generic class methods
  async set(key, data) {
    await this._set(key, data);
    this.emit("set", data);
    return data
  }

  async get(key) {
    const data = await this._get(key);
    this.emit("get", data);
    return data;
  }

  async del(key) {
    const data = await this._del(key);
    this.emit("delete", data);
    return data;
  }

  async clear() {
    const data = await this._clear();
    this.emit("clear", data);
    return data;
  }
}

export default Cache
