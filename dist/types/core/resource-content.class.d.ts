import type { StringRecord } from '../types/common.types.js';
export interface S3Response {
    Body?: {
        transformToByteArray(): Promise<Uint8Array>;
    };
    ContentType?: string;
    ContentLength?: number;
    Metadata?: StringRecord<string>;
}
export interface S3Client {
    putObject(params: {
        key: string;
        metadata: StringRecord<string>;
        body: Buffer | string;
        contentType?: string;
    }): Promise<void>;
    getObject(key: string): Promise<S3Response>;
    headObject(key: string): Promise<S3Response>;
}
export interface SchemaMapper {
    mapper(data: StringRecord): Promise<StringRecord<string>>;
}
export interface Resource {
    name: string;
    client: S3Client;
    schema: SchemaMapper;
    getResourceKey(id: string): string;
    get(id: string): Promise<StringRecord>;
    _emitStandardized(event: string, payload: unknown, id?: string): void;
}
export interface SetContentParams {
    id: string;
    buffer: Buffer | string;
    contentType?: string;
}
export interface ContentResult {
    buffer: Buffer | null;
    contentType: string | null;
}
export interface S3Error extends Error {
    name: string;
    code?: string;
    Code?: string;
    statusCode?: number;
}
export declare class ResourceContent {
    resource: Resource;
    constructor(resource: Resource);
    private get client();
    setContent({ id, buffer, contentType }: SetContentParams): Promise<StringRecord>;
    content(id: string): Promise<ContentResult>;
    hasContent(id: string): Promise<boolean>;
    deleteContent(id: string): Promise<void>;
}
export default ResourceContent;
//# sourceMappingURL=resource-content.class.d.ts.map