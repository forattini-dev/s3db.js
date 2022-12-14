import { isEmpty } from "lodash";
import { Writable } from "node:stream";

import {S3Resource} from "../s3-resource.class";

export class ResourceWriteStream extends Writable {
  resource: S3Resource;
  contents: any[];
  receivedFinalMessage: boolean;
  running: null | Promise<void>;

  constructor({ resource }: { resource: S3Resource }) {
    super({ objectMode: true, highWaterMark: resource.s3Client.parallelism * 2 });

    this.resource = resource;
    this.contents = [];
    this.running = null
    this.receivedFinalMessage = false;
  }

  async _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): Promise<void> {
    if (this.running) await this.running
    
    if (!isEmpty(chunk)) {
      this.contents.push(chunk);
    } else {
      this.receivedFinalMessage = true;
    }

    this.running = this.writeOrWait();
    return callback(null);
  }

  async _writev(
    chunks: { chunk: any; encoding: BufferEncoding }[],
    callback: (error?: Error | null | undefined) => void
  ): Promise<void> {
    if (this.running) await this.running

    if (!isEmpty(chunks)) {
      for (const obj of chunks.map((c) => c.chunk)) {
        this.contents.push(obj);
      }
    } else {
      this.receivedFinalMessage = true;
    }

    this.running = this.writeOrWait();
    return callback(null);
  }

  private async writeOrWait() {
    if (this.receivedFinalMessage) {
      const data = this.contents.splice(0, this.contents.length - 1);
      await this.resource.insertMany(data);
      this.emit("end");
      return;
    }

    if (this.contents.length < this.resource.s3Client.parallelism) return;

    const objs = this.contents.splice(0, this.resource.s3Client.parallelism);
    objs.forEach((obj) => this.emit("id", obj.id));

    await this.resource.insertMany(objs);
    objs.forEach((obj) => this.emit("data", obj));
  }

  async _final(callback: (error?: Error | null | undefined) => void) {
    this.receivedFinalMessage = true;
    await this.writeOrWait();
    callback(null);
  }
}

export default ResourceWriteStream
