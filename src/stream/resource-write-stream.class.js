import { isEmpty } from "lodash-es";
import { Writable } from "node:stream";

class ResourceWriteStream extends Writable {
  constructor({ resource }) {
    super({ objectMode: true, highWaterMark: resource.s3Client.parallelism * 2 });

    this.resource = resource;
    this.contents = [];
    this.running = null;
    this.receivedFinalMessage = false;
  }

  async _write(chunk, encoding, callback) {
    if (this.running) await this.running;
    
    if (!isEmpty(chunk)) {
      this.contents.push(chunk);
    } else {
      this.receivedFinalMessage = true;
    }

    this.running = this.writeOrWait();
    return callback(null);
  }

  async _writev(chunks, callback) {
    if (this.running) await this.running;

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

  async writeOrWait() {
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

  async _final(callback) {
    this.receivedFinalMessage = true;
    await this.writeOrWait();
    callback(null);
  }
}

export default ResourceWriteStream;
