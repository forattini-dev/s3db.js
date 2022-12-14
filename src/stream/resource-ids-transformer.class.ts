import { isArray } from "lodash";
import { PromisePool } from "@supercharge/promise-pool";
import { Transform, TransformCallback } from "node:stream";

import {S3Resource} from "../s3-resource.class";

export class ResourceIdsToDataTransformer extends Transform {
  resource: S3Resource;

  constructor({ resource }: { resource: S3Resource }) {
    super({ objectMode: true, highWaterMark: resource.s3Client.parallelism * 2 });

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
      .withConcurrency(this.resource.s3Client.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
      })
      .process(async (id: any) => {
        this.emit("id",  id);
        const data = await this.resource.get(id);
        this.push(data);
        return data;
      });

    callback(null);
  }
}

export default ResourceIdsToDataTransformer
