import zlib from "zlib";
import { join } from "path";

import { Cache } from "./cache.class"
import { streamToString } from "../stream";

export class S3Cache extends Cache {
  constructor({ 
    client, 
    keyPrefix = 'cache' 
  }) {
    super();
  
    this.client = client
    this.keyPrefix = keyPrefix;
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
    const { Body } = await this.client.getObject(join(this.keyPrefix, key));
    let content = await streamToString(Body);
    content = Buffer.from(content, 'base64');
    content = zlib.unzipSync(content).toString();
    return JSON.parse(content);
  }

  async _del(key) {
    await this.client.deleteObject(join(this.keyPrefix, key));
    return true
  }

  async _clear(dir = '') {
    const keys = await this.client.getAllKeys({ 
      prefix: join(this.keyPrefix, dir),
    });

    console.log({keys})

    await this.client.deleteObjects(keys);
  }
}

export default S3Cache
