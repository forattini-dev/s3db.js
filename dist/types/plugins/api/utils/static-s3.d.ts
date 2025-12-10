import type { S3Client } from '@aws-sdk/client-s3';
import type { MiddlewareHandler } from 'hono';
export interface S3HandlerConfig {
    s3Client: S3Client;
    bucket: string;
    prefix?: string;
    streaming?: boolean;
    signedUrlExpiry?: number;
    maxAge?: number;
    cacheControl?: string;
    contentDisposition?: string;
    etag?: boolean;
    cors?: boolean;
}
export declare function createS3Handler(config: S3HandlerConfig): MiddlewareHandler;
export declare function validateS3Config(config: Partial<S3HandlerConfig>): void;
declare const _default: {
    createS3Handler: typeof createS3Handler;
    validateS3Config: typeof validateS3Config;
};
export default _default;
//# sourceMappingURL=static-s3.d.ts.map