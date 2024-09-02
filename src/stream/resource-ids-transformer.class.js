import { isArray } from "lodash-es";
import { Transform } from "node:stream";
import { PromisePool } from "@supercharge/promise-pool";

class ResourceIdsToDataTransformer extends Transform {
  constructor({ resource }) {
    super({ objectMode: true, highWaterMark: resource.s3Client.parallelism * 2 });

    this.resource = resource;
  }

  async _transform(chunk, encoding, callback) {
    if (!isArray(chunk)) this.push(null);
    this.emit("page", chunk);

    await PromisePool.for(chunk)
      .withConcurrency(this.resource.s3Client.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
      })
      .process(async (id) => {
        this.emit("id", id);
        const data = await this.resource.get(id);
        this.push(data);
        return data;
      });

    callback(null);
  }
}

export default ResourceIdsToDataTransformer;
