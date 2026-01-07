import EventEmitter from "events";
import { Writable, WritableOptions } from 'stream';
import { TasksPool } from '../tasks/tasks-pool.class.js';
import tryFn from "../concerns/try-fn.js";

interface S3Client {
  parallelism: number;
  config: { keyPrefix: string };
}

interface Resource {
  name: string;
  client: S3Client;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface ResourceWriterOptions {
  resource: Resource;
  batchSize?: number;
  concurrency?: number;
}

export class ResourceWriter extends EventEmitter {
  resource: Resource;
  client: S3Client;
  batchSize: number;
  concurrency: number;
  buffer: Record<string, unknown>[];
  writing: boolean;
  ended: boolean;
  writable: Writable;

  constructor({ resource, batchSize = 10, concurrency = 5 }: ResourceWriterOptions) {
    super();

    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;
    this.buffer = [];
    this.writing = false;
    this.ended = false;

    this.writable = new Writable({
      objectMode: true,
      write: this._write.bind(this)
    } as WritableOptions);

    this.writable.on('finish', () => {
      this.emit('finish');
    });

    this.writable.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  build(): this {
    return this;
  }

  write(chunk: Record<string, unknown>): boolean {
    this.buffer.push(chunk);
    this._maybeWrite().catch(error => {
      this.emit('error', error);
    });
    return true;
  }

  end(): void {
    this.ended = true;
    this._maybeWrite().catch(error => {
      this.emit('error', error);
    });
  }

  async _maybeWrite(): Promise<void> {
    if (this.writing) return;
    if (this.buffer.length === 0 && !this.ended) return;
    this.writing = true;
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.batchSize);
      const [ok, err] = await tryFn(async () => {
        await TasksPool.map(
          batch,
          async (item) => {
            const [insertOk, insertErr, result] = await tryFn(async () => {
              const res = await this.resource.insert(item);
              return res;
            });
            if (!insertOk) {
              this.emit('error', insertErr, item);
              return null;
            }
            return result;
          },
          {
            concurrency: this.concurrency,
            onItemError: (error, item) => this.emit("error", error, item)
          }
        );
      });
      if (!ok) {
        this.emit('error', err);
      }
    }
    this.writing = false;
    if (this.ended) {
      this.writable.emit('finish');
    }
  }

  _write(
    _chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}

export default ResourceWriter;
