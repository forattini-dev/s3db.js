import EventEmitter from "events";
import { Writable } from 'stream';
interface S3Client {
    parallelism: number;
    config: {
        keyPrefix: string;
    };
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
export declare class ResourceWriter extends EventEmitter {
    resource: Resource;
    client: S3Client;
    batchSize: number;
    concurrency: number;
    buffer: Record<string, unknown>[];
    writing: boolean;
    ended: boolean;
    writable: Writable;
    constructor({ resource, batchSize, concurrency }: ResourceWriterOptions);
    build(): this;
    write(chunk: Record<string, unknown>): boolean;
    end(): void;
    _maybeWrite(): Promise<void>;
    _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
}
export default ResourceWriter;
//# sourceMappingURL=resource-writer.class.d.ts.map