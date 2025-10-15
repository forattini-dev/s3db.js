import EventEmitter from "events";
import { Transform } from "stream";
import { PromisePool } from "@supercharge/promise-pool";

import { ResourceIdsPageReader } from "./resource-ids-page-reader.class.js"
import tryFn from "../concerns/try-fn.js";
import { StreamError } from '../errors.js';

export class ResourceReader extends EventEmitter {
  constructor({ resource, batchSize = 10, concurrency = 5 }) {
    super()

    if (!resource) {
      throw new StreamError('Resource is required for ResourceReader', {
        operation: 'constructor',
        resource: resource?.name,
        suggestion: 'Pass a valid Resource instance when creating ResourceReader'
      });
    }

    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;
    
    this.input = new ResourceIdsPageReader({ resource: this.resource });

    // Create a Node.js Transform stream instead of Web Stream
    this.transform = new Transform({
      objectMode: true,
      transform: this._transform.bind(this)
    });

    // Set up event forwarding
    this.input.on('data', (chunk) => {
      this.transform.write(chunk);
    });

    this.input.on('end', () => {
      this.transform.end();
    });

    this.input.on('error', (error) => {
      this.emit('error', error);
    });

    // Forward transform events
    this.transform.on('data', (data) => {
      this.emit('data', data);
    });

    this.transform.on('end', () => {
      this.emit('end');
    });

    this.transform.on('error', (error) => {
      this.emit('error', error);
    });
  }

  build() {
    return this;
  }

  async _transform(chunk, encoding, callback) {
    const [ok, err] = await tryFn(async () => {
      await PromisePool.for(chunk)
        .withConcurrency(this.concurrency)
        .handleError(async (error, content) => {
          this.emit("error", error, content);
        })
        .process(async (id) => {
          const data = await this.resource.get(id);
          this.push(data);
          return data;
        });
    });
    callback(err);
  }

  resume() {
    this.input.resume();
  }
}

export default ResourceReader;
