import EventEmitter from "events";
import { Transform, TransformCallback } from "stream";
import { PromisePool } from "@supercharge/promise-pool";

import { ResourceIdsPageReader } from "./resource-ids-page-reader.class.js";
import tryFn from "../concerns/try-fn.js";
import { StreamError } from '../errors.js';

interface S3Client {
  parallelism: number;
  config: { keyPrefix: string };
  listObjects(options: { prefix: string; continuationToken: string | null }): Promise<unknown>;
}

interface Resource {
  name: string;
  client: S3Client;
  get(id: string): Promise<Record<string, unknown>>;
}

interface ResourceReaderOptions {
  resource: Resource;
  batchSize?: number;
  concurrency?: number;
}

export class ResourceReader extends EventEmitter {
  resource: Resource;
  client: S3Client;
  batchSize: number;
  concurrency: number;
  input: ResourceIdsPageReader;
  transform: Transform;

  constructor({ resource, batchSize = 10, concurrency = 5 }: ResourceReaderOptions) {
    super();

    if (!resource) {
      throw new StreamError('Resource is required for ResourceReader', {
        operation: 'constructor',
        resource: (resource as Resource | undefined)?.name,
        suggestion: 'Pass a valid Resource instance when creating ResourceReader'
      });
    }

    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;

    this.input = new ResourceIdsPageReader({ resource: this.resource as any });

    this.transform = new Transform({
      objectMode: true,
      transform: this._transform.bind(this)
    });

    this.input.on('data', (chunk: string[]) => {
      this.transform.write(chunk);
    });

    this.input.on('end', () => {
      this.transform.end();
    });

    this.input.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.transform.on('data', (data: Record<string, unknown>) => {
      this.emit('data', data);
    });

    this.transform.on('end', () => {
      this.emit('end');
    });

    this.transform.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  build(): this {
    return this;
  }

  async _transform(chunk: string[], _encoding: BufferEncoding, callback: TransformCallback): Promise<void> {
    const [, err] = await tryFn(async () => {
      await PromisePool.for(chunk)
        .withConcurrency(this.concurrency)
        .handleError(async (error, content) => {
          this.emit("error", error, content);
        })
        .process(async (id) => {
          const data = await this.resource.get(id);
          this.transform.push(data);
          return data;
        });
    });
    callback(err as Error | null | undefined);
  }

  resume(): void {
    this.input.emit('resume');
  }
}

export default ResourceReader;
