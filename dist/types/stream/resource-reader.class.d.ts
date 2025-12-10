import EventEmitter from "events";
import { Transform, TransformCallback } from "stream";
import { ResourceIdsPageReader } from "./resource-ids-page-reader.class.js";
interface S3Client {
    parallelism: number;
    config: {
        keyPrefix: string;
    };
    listObjects(options: {
        prefix: string;
        continuationToken: string | null;
    }): Promise<unknown>;
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
export declare class ResourceReader extends EventEmitter {
    resource: Resource;
    client: S3Client;
    batchSize: number;
    concurrency: number;
    input: ResourceIdsPageReader;
    transform: Transform;
    constructor({ resource, batchSize, concurrency }: ResourceReaderOptions);
    build(): this;
    _transform(chunk: string[], _encoding: BufferEncoding, callback: TransformCallback): Promise<void>;
    resume(): void;
}
export default ResourceReader;
//# sourceMappingURL=resource-reader.class.d.ts.map