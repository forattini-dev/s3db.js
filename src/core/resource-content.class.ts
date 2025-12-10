import { tryFn } from '../concerns/try-fn.js';
import { ResourceError } from '../errors.js';
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

export class ResourceContent {
  resource: Resource;

  constructor(resource: Resource) {
    this.resource = resource;
  }

  private get client(): S3Client {
    return this.resource.client;
  }

  async setContent({ id, buffer, contentType = 'application/octet-stream' }: SetContentParams): Promise<StringRecord> {
    const [ok, err, currentData] = await tryFn(() => this.resource.get(id));
    if (!ok || !currentData) {
      throw new ResourceError(`Resource with id '${id}' not found`, {
        resourceName: this.resource.name,
        id,
        operation: 'setContent'
      });
    }

    const bufferLength = typeof buffer === 'string' ? buffer.length : buffer.length;
    const updatedData: StringRecord = {
      ...currentData,
      _hasContent: true,
      _contentLength: bufferLength,
      _mimeType: contentType
    };

    const mappedMetadata = await this.resource.schema.mapper(updatedData);

    const [ok2, err2] = await tryFn(() => this.client.putObject({
      key: this.resource.getResourceKey(id),
      metadata: mappedMetadata,
      body: buffer,
      contentType
    }));

    if (!ok2) throw err2;

    this.resource._emitStandardized('content-set', { id, contentType, contentLength: bufferLength }, id);
    return updatedData;
  }

  async content(id: string): Promise<ContentResult> {
    const key = this.resource.getResourceKey(id);
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));

    if (!ok) {
      const error = err as S3Error;
      if (error.name === 'NoSuchKey' || error.code === 'NoSuchKey' || error.Code === 'NoSuchKey' || error.statusCode === 404) {
        return {
          buffer: null,
          contentType: null
        };
      }
      throw err;
    }

    const s3Response = response as S3Response;
    const buffer = Buffer.from(await s3Response.Body!.transformToByteArray());
    const contentType = s3Response.ContentType || null;

    this.resource._emitStandardized('content-fetched', { id, contentLength: buffer.length, contentType }, id);

    return {
      buffer,
      contentType
    };
  }

  async hasContent(id: string): Promise<boolean> {
    const key = this.resource.getResourceKey(id);
    const [ok, , response] = await tryFn(() => this.client.headObject(key));
    if (!ok) return false;
    const s3Response = response as S3Response;
    return (s3Response.ContentLength || 0) > 0;
  }

  async deleteContent(id: string): Promise<void> {
    const key = this.resource.getResourceKey(id);
    const [ok, err, existingObject] = await tryFn(() => this.client.headObject(key));
    if (!ok) throw err;

    const s3Response = existingObject as S3Response;
    const existingMetadata = s3Response.Metadata || {};

    const [ok2, err2] = await tryFn(() => this.client.putObject({
      key,
      body: '',
      metadata: existingMetadata,
    }));

    if (!ok2) throw err2;

    this.resource._emitStandardized('content-deleted', id, id);
  }
}

export default ResourceContent;
