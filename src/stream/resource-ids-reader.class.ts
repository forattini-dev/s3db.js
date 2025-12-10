import EventEmitter from "events";
import { ReadableStream, ReadableStreamDefaultController, ReadableStreamDefaultReader } from "node:stream/web";

interface S3Object {
  Key: string;
}

interface ListObjectsResponse {
  Contents: S3Object[];
  NextContinuationToken?: string;
  IsTruncated: boolean;
}

interface S3ClientConfig {
  keyPrefix: string;
}

interface S3Client {
  parallelism: number;
  config: S3ClientConfig;
  listObjects(options: { prefix: string; continuationToken: string | null }): Promise<ListObjectsResponse>;
}

interface Resource {
  name: string;
  client: S3Client;
}

interface ResourceIdsReaderOptions {
  resource: Resource;
}

export class ResourceIdsReader extends EventEmitter {
  resource: Resource;
  client: S3Client;
  stream: ReadableStream<string | string[]>;
  controller!: ReadableStreamDefaultController<string | string[]>;
  continuationToken: string | null = null;
  closeNextIteration: boolean = false;

  constructor({ resource }: ResourceIdsReaderOptions) {
    super();

    this.resource = resource;
    this.client = resource.client;

    this.stream = new ReadableStream<string | string[]>({
      start: this._start.bind(this),
      pull: this._pull.bind(this),
      cancel: this._cancel.bind(this),
    }, {
      highWaterMark: this.client.parallelism * 3
    });
  }

  build(): ReadableStreamDefaultReader<string | string[]> {
    return this.stream.getReader();
  }

  async _start(controller: ReadableStreamDefaultController<string | string[]>): Promise<void> {
    this.controller = controller;
    this.continuationToken = null;
    this.closeNextIteration = false;
  }

  async _pull(_controller: ReadableStreamDefaultController<string | string[]>): Promise<void> {
    if (this.closeNextIteration) {
      this.controller.close();
      return;
    }

    const response = await this.client.listObjects({
      prefix: `resource=${this.resource.name}`,
      continuationToken: this.continuationToken,
    });

    const keys = response?.Contents
      .map((x) => x.Key)
      .map((x) => x.replace(this.client.config.keyPrefix, ""))
      .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x))
      .map((x) => x.replace(`resource=${this.resource.name}/id=`, ""));

    this.continuationToken = response.NextContinuationToken || null;
    this.enqueue(keys);

    if (!response.IsTruncated) this.closeNextIteration = true;
  }

  enqueue(ids: string[]): void {
    ids.forEach((key) => {
      this.controller.enqueue(key);
      this.emit("id", key);
    });
  }

  _cancel(_reason?: unknown): void {
    // No cleanup needed
  }
}

export default ResourceIdsReader;
