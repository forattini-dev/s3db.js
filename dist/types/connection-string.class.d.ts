export declare const S3_DEFAULT_REGION = "us-east-1";
export declare const S3_DEFAULT_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
export type ClientType = 'filesystem' | 'memory' | 's3' | 'custom';
export interface ClientOptions {
    [key: string]: unknown;
}
export declare class ConnectionString {
    region: string;
    bucket: string;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    endpoint: string;
    keyPrefix: string;
    forcePathStyle?: boolean;
    clientType?: ClientType;
    basePath?: string;
    clientOptions: ClientOptions;
    constructor(connectionString: string);
    private _parseQueryParams;
    private _coerceValue;
    private defineFromS3;
    private defineFromCustomUri;
    private defineFromFileUri;
    private defineFromMemoryUri;
}
export default ConnectionString;
//# sourceMappingURL=connection-string.class.d.ts.map