import EventEmitter from "events";
import { WritableStream } from 'node:stream/web'
import { PromisePool } from '@supercharge/promise-pool'

export class ResourceWriter extends EventEmitter {
  constructor({ resource }) {
    super()

    this.resource = resource;
    this.client = resource.client;

    this.stream = new WritableStream({
      start: this._start.bind(this),
      write: this._write.bind(this),
      close: this._close.bind(this),
      abort: this._abort.bind(this),
    });
  }

  build() {
    return this.stream.getWriter();
  }

  async _start(controller) {
    this.controller = controller;
  }

  async _write(chunk, controller) {
    const resource = this.resource 

    await PromisePool.for([].concat(chunk))
      .withConcurrency(this.client.parallelism)
      // .handleError(async (error, content) => {
      // console.error('Error processing item:', content, error);
      // })
      .process(async (item) => {
        await resource.insert(item);
      });
  }

  async _close(controller) {}

  async _abort(reason) {
    console.error('Stream aborted:', reason);
  }
}

export default ResourceWriter;
