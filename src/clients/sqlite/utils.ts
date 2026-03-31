import path from 'path';
import { Readable } from 'node:stream';
import { createHash } from 'crypto';

import { metadataEncode, metadataDecode } from '../../concerns/metadata-encoding.js';
import { DatabaseError, ResourceError, ValidationError } from '../../errors.js';
import type { S3Object } from '../types.js';
import type {
  DbRow,
  DbObjectHeaderRow,
  DbPartitionRow,
  DbBucketStatsRow
} from './types.js';
import { SqliteClientBase } from './base.js';

export class SqliteClientUtils extends SqliteClientBase {
  protected _applyKeyPrefix(key?: string): string {
    if (!this.keyPrefix) {
      if (key === undefined || key === null) return '';
      return key;
    }
    if (key === undefined || key === null || key === '') {
      return path.posix.join(this.keyPrefix, '');
    }

    return path.posix.join(this.keyPrefix, key);
  }

  protected _stripKeyPrefix(key: string = ''): string {
    if (!this.keyPrefix) return key;

    const normalizedPrefix = this._keyPrefixForStrip;
    if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
      return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
    }

    return key;
  }

  protected _encodeMetadata(metadata?: Record<string, unknown>): Record<string, string> | undefined {
    if (!metadata) {
      return undefined;
    }

    const encoded: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries(metadata)) {
      const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const { encoded: encodedValue } = metadataEncode(value);
      encoded[validKey] = encodedValue;
    }

    return encoded;
  }

  protected _decodeMetadataRow(row: { metadata: string }): Record<string, unknown> {
    let metadata: Record<string, string>;
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = {};
    }

    const decoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadata || {})) {
      decoded[k] = metadataDecode(v);
    }

    return decoded;
  }

  protected _formatEtag(etag: string): string {
    return `"${etag}"`;
  }

  protected _generateEtag(body: Buffer): string {
    return createHash('md5').update(body).digest('hex');
  }

  protected _encodeContinuationToken(key: string): string {
    return Buffer.from(String(key), 'utf8').toString('base64');
  }

  protected _decodeContinuationToken(token: string): string {
    try {
      const normalized = String(token).trim();
      return Buffer.from(normalized, 'base64').toString('utf8');
    } catch {
      throw new ValidationError('Invalid continuation token', {
        field: 'ContinuationToken',
        retriable: false,
        suggestion: 'Use the NextContinuationToken returned by a previous ListObjectsV2 response.'
      });
    }
  }

  protected _normalizeBody(
    inputBody: unknown,
    bodyLimit: { maxBytes: number; code: string; suggestion: string } | null = null
  ): Promise<Buffer> {
    const getLimitMessage = (code: string): string => {
      return code === 'SqliteMemoryLimitExceeded'
        ? 'SQLite memory budget exceeded'
        : 'Object size exceeds in sqlite limit';
    };

    if (inputBody === undefined || inputBody === null) {
      return Promise.resolve(Buffer.alloc(0));
    }
    if (Buffer.isBuffer(inputBody)) {
      if (bodyLimit && inputBody.length > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      return Promise.resolve(inputBody);
    }
    if (inputBody instanceof Uint8Array) {
      const buffer = Buffer.from(inputBody);
      if (bodyLimit && buffer.length > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      return Promise.resolve(buffer);
    }
    if (typeof inputBody === 'string') {
      const buffer = Buffer.from(inputBody);
      if (bodyLimit && buffer.length > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      return Promise.resolve(buffer);
    }
    if (inputBody instanceof Readable) {
      return this._bufferFromStream(inputBody, bodyLimit);
    }

    const buffer = Buffer.from(String(inputBody));
    if (bodyLimit && buffer.length > bodyLimit.maxBytes) {
      throw new ResourceError(getLimitMessage(bodyLimit.code), {
        bucket: this.bucket,
        code: bodyLimit.code,
        statusCode: 413,
        retriable: false,
        suggestion: bodyLimit.suggestion
      });
    }
    return Promise.resolve(buffer);
  }

  protected async _bufferFromStream(
    stream: Readable,
    bodyLimit: { maxBytes: number; code: string; suggestion: string } | null
  ): Promise<Buffer> {
    const getLimitMessage = (code: string): string => {
      return code === 'SqliteMemoryLimitExceeded'
        ? 'SQLite memory budget exceeded'
        : 'Object size exceeds in sqlite limit';
    };

    const chunks: Buffer[] = [];
    let total = 0;

    for await (const item of stream) {
      const chunk = Buffer.isBuffer(item) ? item : Buffer.from(String(item));
      total += chunk.length;
      if (bodyLimit && total > bodyLimit.maxBytes) {
        throw new ResourceError(getLimitMessage(bodyLimit.code), {
          bucket: this.bucket,
          code: bodyLimit.code,
          statusCode: 413,
          retriable: false,
          suggestion: bodyLimit.suggestion
        });
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  protected _extractCommonPrefix(prefix: string, delimiter: string, key: string): string | null {
    if (!delimiter) return null;

    const hasPrefix = Boolean(prefix);
    if (hasPrefix && !key.startsWith(prefix)) return null;

    const remainder = hasPrefix ? key.slice(prefix.length) : key;
    const index = remainder.indexOf(delimiter);
    if (index === -1) return null;

    const baseLength = hasPrefix ? prefix.length : 0;
    return key.slice(0, baseLength + index + delimiter.length);
  }

  protected _parseCopySource(copySource?: string): { sourceBucket: string; sourceKey: string } {
    const trimmedSource = String(copySource || '').replace(/^\//, '');
    const [sourcePath] = trimmedSource.split('?');
    const decodedSource = decodeURIComponent(sourcePath || '');
    const [sourceBucket, ...sourceKeyParts] = decodedSource.split('/');

    if (!sourceBucket || sourceKeyParts.length === 0) {
      throw new DatabaseError(`Invalid CopySource value: ${copySource}`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Provide CopySource in the format "<bucket>/<key>" as expected by AWS S3.'
      });
    }

    return {
      sourceBucket,
      sourceKey: sourceKeyParts.join('/')
    };
  }

  protected _normalizePartitionObject(row: DbPartitionRow, headOnly: boolean): S3Object {
    const metadata = this._decodeMetadataRow(row);
    let bodyStream: S3Object['Body'] | undefined;

    if (!headOnly) {
      const bodyBuffer = Buffer.alloc(0);
      bodyStream = Readable.from(bodyBuffer) as S3Object['Body'];
      bodyStream!.transformToString = async () => bodyBuffer.toString('utf-8');
      bodyStream!.transformToByteArray = async () => new Uint8Array(bodyBuffer);
      bodyStream!.transformToWebStream = () => Readable.toWeb(bodyStream as Readable) as ReadableStream;
    }

    return {
      Body: headOnly ? undefined : bodyStream,
      Metadata: metadata as Record<string, string>,
      ContentType: row.content_type,
      ContentLength: 0,
      ETag: this._formatEtag(row.etag),
      LastModified: new Date(row.last_modified)
    };
  }

  protected _normalizeObject(row: DbRow | DbObjectHeaderRow, headOnly: boolean): S3Object {
    const metadata = this._decodeMetadataRow(row);
    let bodyStream: S3Object['Body'] | undefined;

    if (!headOnly) {
      const bodyBuffer = Buffer.from((row as DbRow).body);
      bodyStream = Readable.from(bodyBuffer) as S3Object['Body'];
      bodyStream!.transformToString = async () => bodyBuffer.toString('utf-8');
      bodyStream!.transformToByteArray = async () => new Uint8Array(bodyBuffer);
      bodyStream!.transformToWebStream = () => Readable.toWeb(bodyStream as Readable) as ReadableStream;
    }

    return {
      Body: headOnly ? undefined : bodyStream,
      Metadata: metadata as Record<string, string>,
      ContentType: row.content_type,
      ContentLength: row.content_length,
      ETag: this._formatEtag(row.etag),
      LastModified: new Date(row.last_modified),
      ContentEncoding: row.content_encoding || undefined
    };
  }

  protected _validateLimits(body: Buffer, metadata?: Record<string, unknown>, key?: string): void {
    if (!this.enforceLimits) {
      return;
    }

    const metadataSize = this._getMetadataSize(metadata);
    if (metadataSize > this.metadataLimit) {
      throw new ResourceError('Metadata limit exceeded in sqlite storage', {
        bucket: this.bucket,
        key,
        code: 'MetadataLimitExceeded',
        statusCode: 413,
        retriable: false,
        suggestion: 'Reduce metadata size or disable enforceLimits in SqliteClient configuration.'
      });
    }

    if (body.length > this.maxObjectSize) {
      throw new ResourceError('Object size exceeds in sqlite limit', {
        bucket: this.bucket,
        key,
        code: 'EntityTooLarge',
        statusCode: 413,
        retriable: false,
        suggestion: 'Reduce object size or increase maxObjectSize in SqliteClient configuration.'
      });
    }
  }

  protected _validateMemoryBudget(newSize: number, existingSize: number, key?: string): void {
    if (this.maxMemoryBytes === null) {
      return;
    }

    const existing = Math.max(0, existingSize);
    const next = Math.max(0, newSize);
    const currentUsage = this._getCurrentBucketSize();
    const projectedUsage = currentUsage - existing + next;

    if (projectedUsage > this.maxMemoryBytes) {
      throw new ResourceError('SQLite memory budget exceeded', {
        bucket: this.bucket,
        key,
        code: 'SqliteMemoryLimitExceeded',
        statusCode: 413,
        retriable: false,
        suggestion: 'Lower object size/payload volume or raise maxMemoryMB for this SqliteClient.'
      });
    }
  }

  protected _getWriteBodyLimit(existingSize: number): { maxBytes: number; code: string; suggestion: string } | null {
    let limit = Number.POSITIVE_INFINITY;
    let code = 'EntityTooLarge';
    let suggestion = 'Reduce object size or increase maxObjectSize in SqliteClient configuration.';

    if (this.enforceLimits && this.maxObjectSize > 0) {
      limit = Math.min(limit, this.maxObjectSize);
      code = 'EntityTooLarge';
      suggestion = 'Reduce object size or increase maxObjectSize in SqliteClient configuration.';
    }

    if (this.maxMemoryBytes !== null) {
      const currentUsage = this._getCurrentBucketSize();
      const budgetLimit = this.maxMemoryBytes - currentUsage + Math.max(existingSize, 0);
      if (budgetLimit < limit) {
        limit = Math.max(0, budgetLimit);
        code = 'SqliteMemoryLimitExceeded';
        suggestion = 'Lower object size/payload volume or raise maxMemoryMB for this SqliteClient.';
      }
    }

    if (!Number.isFinite(limit)) {
      return null;
    }

    return { maxBytes: Math.floor(limit), code, suggestion };
  }

  protected _getMetadataSize(metadata?: Record<string, unknown>): number {
    if (!metadata) return 0;

    let size = 0;
    for (const [metaKey, metaValue] of Object.entries(metadata)) {
      size += Buffer.byteLength(metaKey, 'utf8');
      size += Buffer.byteLength(String(metaValue), 'utf8');
    }
    return size;
  }

  protected _getCurrentBucketSize(): number {
    const statement = this._prepareCached(`
      SELECT total_content_length
      FROM bucket_stats
      WHERE bucket = ?
    `);
    const row = statement.get(this.bucket) as DbBucketStatsRow | undefined;
    const total = Number(row?.total_content_length || 0);

    return Number.isFinite(total) ? total : 0;
  }

  protected _adjustBucketSize(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    this._ensureBucketStatsRow();
    const statement = this._prepareCached(`
      UPDATE bucket_stats
      SET total_content_length = MAX(0, total_content_length + ?)
      WHERE bucket = ?
    `);
    statement.run(Math.trunc(delta), this.bucket);
  }
}
