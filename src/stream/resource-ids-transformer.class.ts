import { isArray } from "lodash";
import { Transform, TransformCallback } from "node:stream";

import Resource from "../resource.class";

export default class ResourceIdsToDataTransformer extends Transform {
  resource: Resource;

  constructor({ resource }: { resource: Resource }) {
    super({ objectMode: true, highWaterMark: resource.client.parallelism });
    this.resource = resource;
  }

  async _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): Promise<void> {
    if (!isArray(chunk)) this.push(null);
    this.emit("page", this.resource.name, chunk);

    const proms = chunk.map(async (id: string) => {
      this.emit("id", this.resource.name, id);
      const data = await this.resource.getById(id);
      this.push(data);
      return data
    });

    await Promise.all(proms);
    callback(null);
  }
}
