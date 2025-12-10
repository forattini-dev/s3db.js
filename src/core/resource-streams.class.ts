import { ResourceReader, ResourceWriter } from '../stream/index.js';

interface S3Client {
  parallelism: number;
  config: { keyPrefix: string };
  listObjects(options: { prefix: string; continuationToken: string | null }): Promise<unknown>;
}

export interface Resource {
  name: string;
  client: S3Client;
  get(id: string): Promise<Record<string, unknown>>;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface StreamBuilder {
  build(): unknown;
}

export class ResourceStreams {
  resource: Resource;

  constructor(resource: Resource) {
    this.resource = resource;
  }

  readable(): unknown {
    const stream = new ResourceReader({ resource: this.resource });
    return (stream as StreamBuilder).build();
  }

  writable(): unknown {
    const stream = new ResourceWriter({ resource: this.resource });
    return (stream as StreamBuilder).build();
  }
}

export default ResourceStreams;
