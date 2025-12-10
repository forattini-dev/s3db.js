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
export interface Resource {
    name: string;
    client: S3Client;
    get(id: string): Promise<Record<string, unknown>>;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
export interface StreamBuilder {
    build(): unknown;
}
export declare class ResourceStreams {
    resource: Resource;
    constructor(resource: Resource);
    readable(): unknown;
    writable(): unknown;
}
export default ResourceStreams;
//# sourceMappingURL=resource-streams.class.d.ts.map