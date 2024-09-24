import EventEmitter from "events";
import { TransformStream } from "node:stream/web";
import { PromisePool } from "@supercharge/promise-pool";

import { ResourceIdsPageReader } from "./resource-ids-page-reader.class"

export class ResourceReader  extends EventEmitter {
  constructor({ resource }) {
    super()

    this.resource = resource;
    this.client = resource.client;
    
    this.input = new ResourceIdsPageReader({ resource: this.resource });

    this.output = new TransformStream(
      { transform: this._transform.bind(this) },
      { highWaterMark: this.client.parallelism * 2 },
      { highWaterMark: 1 },
    )

    this.stream = this.input.stream.pipeThrough(this.output);
  }

  build () {
    return this.stream.getReader();
  }

  async _transform(chunk, controller) {
    await PromisePool.for(chunk)
      .withConcurrency(this.client.parallelism)
      // .handleError(async (error, content) => {
        // this.emit("error", error, content);
      // })
      .process(async (id) => {
        const data = await this.resource.get(id);
        controller.enqueue(data);
        return data;
      });
  }
}

export default ResourceReader;
