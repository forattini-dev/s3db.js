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
    listObjects(options: {
        prefix: string;
        continuationToken: string | null;
    }): Promise<ListObjectsResponse>;
}
interface Resource {
    name: string;
    client: S3Client;
}
interface ResourceIdsReaderOptions {
    resource: Resource;
}
export declare class ResourceIdsReader extends EventEmitter {
    resource: Resource;
    client: S3Client;
    stream: ReadableStream<string | string[]>;
    controller: ReadableStreamDefaultController<string | string[]>;
    continuationToken: string | null;
    closeNextIteration: boolean;
    constructor({ resource }: ResourceIdsReaderOptions);
    build(): ReadableStreamDefaultReader<string | string[]>;
    _start(controller: ReadableStreamDefaultController<string | string[]>): Promise<void>;
    _pull(_controller: ReadableStreamDefaultController<string | string[]>): Promise<void>;
    enqueue(ids: string[]): void;
    _cancel(_reason?: unknown): void;
}
export default ResourceIdsReader;
//# sourceMappingURL=resource-ids-reader.class.d.ts.map