import { isArray } from "lodash";
import { PromisePool } from "@supercharge/promise-pool";
import { Transform, TransformCallback } from "node:stream";

import Resource from "../resource.class";

export default class ResourceIdsToDataTransformer extends Transform {
  resource: Resource;

  constructor({ resource }: { resource: Resource }) {
    super({ objectMode: true, highWaterMark: resource.client.parallelism * 2 });
    
    this.resource = resource;
  }

  async _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): Promise<void> {
    if (!isArray(chunk)) this.push(null);
    this.emit("page", chunk);

    await PromisePool.for(chunk)
      .withConcurrency(this.resource.client.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
      })
      .process(async (id: any) => {
        this.emit("id",  id);
        const data = await this.resource.getById(id);
        this.push(data);
        return data;
      });

    callback(null);
  }
}
