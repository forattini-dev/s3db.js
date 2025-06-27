import zlib from "zlib";
import { join } from "path";

import { Cache } from "./cache.class.js"
import { streamToString } from "../stream/index.js";

export class S3Cache extends Cache {
  constructor({ 
    client, 
    keyPrefix = 'cache',
    ttl = 0,
    prefix = undefined
  }) {
    super({ client, keyPrefix, ttl, prefix });
    this.client = client
    this.keyPrefix = keyPrefix;
    this.config.ttl = ttl;
    this.config.client = client;
    this.config.prefix = prefix !== undefined ? prefix : keyPrefix + (keyPrefix.endsWith('/') ? '' : '/');
  }

  async _set(key, data) {
    let body = JSON.stringify(data);
    const lengthSerialized = body.length;
    body = zlib.gzipSync(body).toString('base64');

    return this.client.putObject({
      key: join(this.keyPrefix, key),
      body,
      contentEncoding: "gzip",
      contentType: "application/gzip",
      metadata: {
        compressor: "zlib",
        compressed: 'true',
        "client-id": this.client.id,
        "length-serialized": String(lengthSerialized),
        "length-compressed": String(body.length),
        "compression-gain": (body.length/lengthSerialized).toFixed(2),
      },
    });
  }

  async _get(key) {
    try {
      const { Body } = await this.client.getObject(join(this.keyPrefix, key));
      let content = await streamToString(Body);
      content = Buffer.from(content, 'base64');
      content = zlib.unzipSync(content).toString();
      return JSON.parse(content);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  async _del(key) {
    await this.client.deleteObject(join(this.keyPrefix, key));
    return true
  }

  async _clear() {
    const keys = await this.client.getAllKeys({ 
      prefix: this.keyPrefix,
    });
    for (const key of keys) {
      await this.client.deleteObject(key);
    }
  }

  async size() {
    const keys = await this.keys();
    return keys.length;
  }

  async keys() {
    // Busca todas as chaves com o prefixo do cache e remove o prefixo
    const allKeys = await this.client.getAllKeys({ prefix: this.keyPrefix });
    const prefix = this.keyPrefix.endsWith('/') ? this.keyPrefix : this.keyPrefix + '/';
    return allKeys.map(k => k.startsWith(prefix) ? k.slice(prefix.length) : k);
  }
}

export default S3Cache
