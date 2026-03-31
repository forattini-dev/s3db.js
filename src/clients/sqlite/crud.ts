import { chunk } from 'lodash-es';

import { normalizeEtagHeader } from '../client-compat.js';
import { mapAwsError, DatabaseError, ResourceError, BaseError, NoSuchKey } from '../../errors.js';
import type {
  PutObjectParams,
  CopyObjectParams,
  S3Object,
  PutObjectResponse,
  CopyObjectResponse,
  DeleteObjectResponse
} from '../types.js';
import type { DbRow } from './types.js';
import { SqliteClientPartitions } from './partitions.js';

export class SqliteClientCrud extends SqliteClientPartitions {
  async putObject(params: PutObjectParams): Promise<PutObjectResponse> {
    return this._runWriteTask(async () => {
      const {
        key,
        metadata,
        contentType,
        body,
        contentEncoding,
        contentLength,
        ifMatch,
        ifNoneMatch
      } = params;

      const fullKey = this._applyKeyPrefix(key);
      const responseInput = {
        Key: key,
        Metadata: metadata,
        ContentType: contentType,
        Body: body,
        ContentEncoding: contentEncoding,
        ContentLength: contentLength,
        IfMatch: ifMatch,
        IfNoneMatch: ifNoneMatch
      };

      try {
        const initialState = this._getObjectState(fullKey);
        const objectLengthFromLimit = this._getWriteBodyLimit(initialState?.content_length || 0);
        const objectBody = await this._normalizeBody(body, objectLengthFromLimit);
        const objectLength = objectBody.length;
        const shouldMaterializePartition = this._shouldMaterializePartitionWrite(fullKey, objectBody);

        if (shouldMaterializePartition) {
          const response = this._withWriteTransaction(() => {
            const existingPartitionRow = this._getPartitionIndexRow(fullKey);
            const existingObjectRow = this._getObjectState(fullKey);
            const existingRow = existingPartitionRow
              ? { content_length: 0, etag: existingPartitionRow.etag }
              : existingObjectRow;

            this._validateLimits(objectBody, metadata, fullKey);
            this._validateMemoryBudget(0, existingObjectRow?.content_length || 0, fullKey);

            if (ifMatch !== undefined && ifMatch !== null) {
              if (!existingRow) {
                throw new ResourceError(`Precondition failed: object does not exist for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
                });
              }

              const expectedEtags = normalizeEtagHeader(ifMatch);
              if (!expectedEtags.includes(existingRow.etag)) {
                throw new ResourceError(`Precondition failed: ETag mismatch for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
                });
              }
            }

            if (ifNoneMatch !== undefined && ifNoneMatch !== null && existingRow) {
              if (ifNoneMatch === '*') {
                throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Use ifNoneMatch: "*" only when the key should be created.'
                });
              }

              const normalized = normalizeEtagHeader(ifNoneMatch);
              if (normalized.includes(existingRow.etag)) {
                throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                  bucket: this.bucket,
                  key: fullKey,
                  code: 'PreconditionFailed',
                  statusCode: 412,
                  retriable: false,
                  suggestion: 'Remove ifNoneMatch header if you want to overwrite the object.'
                });
              }
            }

            const partitionEntry = this._parsePartitionIndexKey(fullKey);
            if (!partitionEntry) {
              throw new DatabaseError(`Invalid partition index key: ${fullKey}`, {
                operation: 'putObject',
                bucket: this.bucket,
                key: fullKey,
                retriable: false,
                suggestion: 'Partition index keys must include resource=, partition= and id= segments.'
              });
            }

            const encodedMetadata = this._encodeMetadata(metadata);
            const now = new Date().toISOString();
            const etag = this._generateEtag(objectBody);
            const statement = this._prepareCached(`
              INSERT INTO partition_index (
                bucket, key, resource_name, partition_name, record_id, metadata, content_type, etag, last_modified
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(bucket, key) DO UPDATE SET
                resource_name = excluded.resource_name,
                partition_name = excluded.partition_name,
                record_id = excluded.record_id,
                metadata = excluded.metadata,
                content_type = excluded.content_type,
                etag = excluded.etag,
                last_modified = excluded.last_modified
            `);

            statement.run(
              this.bucket,
              fullKey,
              partitionEntry.resourceName,
              partitionEntry.partitionName,
              partitionEntry.recordId,
              JSON.stringify(encodedMetadata || {}),
              contentType || 'application/octet-stream',
              etag,
              now
            );

            if (existingObjectRow) {
              const legacyDeleteStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
              legacyDeleteStatement.run(this.bucket, fullKey);
              this._adjustBucketSize(-existingObjectRow.content_length);
            }

            return {
              ETag: this._formatEtag(etag),
              VersionId: null,
              ServerSideEncryption: null,
              Location: `/${this.bucket}/${fullKey}`
            } satisfies PutObjectResponse;
          });

          this.emit('cl:response', 'PutObjectCommand', response, responseInput);
          return response;
        }

        const response = this._withWriteTransaction(() => {
          const existingPartitionRow = this._getPartitionIndexRow(fullKey);
          const existingRow = existingPartitionRow
            ? { content_length: 0, etag: existingPartitionRow.etag }
            : this._getObjectState(fullKey);
          this._validateLimits(objectBody, metadata, fullKey);
          this._validateMemoryBudget(objectLength, existingRow?.content_length || 0, fullKey);

          const storedContentLength = typeof contentLength === 'number' ? contentLength : objectLength;

          if (ifMatch !== undefined && ifMatch !== null) {
            if (!existingRow) {
              throw new ResourceError(`Precondition failed: object does not exist for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
              });
            }

            const expectedEtags = normalizeEtagHeader(ifMatch);
            if (!expectedEtags.includes(existingRow.etag)) {
              throw new ResourceError(`Precondition failed: ETag mismatch for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Fetch the latest object and retry with the current ETag in ifMatch.'
              });
            }
          }

          if (ifNoneMatch !== undefined && ifNoneMatch !== null && existingRow) {
            if (ifNoneMatch === '*') {
              throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Use ifNoneMatch: "*" only when the key should be created.'
              });
            }

            const normalized = normalizeEtagHeader(ifNoneMatch);
            if (normalized.includes(existingRow.etag)) {
              throw new ResourceError(`Precondition failed: object already exists for key "${fullKey}"`, {
                bucket: this.bucket,
                key: fullKey,
                code: 'PreconditionFailed',
                statusCode: 412,
                retriable: false,
                suggestion: 'Remove ifNoneMatch header if you want to overwrite the object.'
              });
            }
          }

          const encodedMetadata = this._encodeMetadata(metadata);
          const now = new Date().toISOString();
          const etag = this._generateEtag(objectBody);
          const statement = this._prepareCached(`
            INSERT INTO objects (
              bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(bucket, key) DO UPDATE SET
              metadata = excluded.metadata,
              content_type = excluded.content_type,
              content_encoding = excluded.content_encoding,
              content_length = excluded.content_length,
              etag = excluded.etag,
              last_modified = excluded.last_modified,
              body = excluded.body
          `);

          statement.run(
            this.bucket,
            fullKey,
            JSON.stringify(encodedMetadata || {}),
            contentType || 'application/octet-stream',
            contentEncoding || null,
            storedContentLength,
            etag,
            now,
            objectBody
          );
          this._adjustBucketSize(storedContentLength - (existingRow?.content_length || 0));

          return {
            ETag: this._formatEtag(etag),
            VersionId: null,
            ServerSideEncryption: null,
            Location: `/${this.bucket}/${fullKey}`
          } satisfies PutObjectResponse;
        });

        this.emit('cl:response', 'PutObjectCommand', response, responseInput);
        return response;
      } catch (error) {
        if (error instanceof BaseError) {
          throw error;
        }
        throw mapAwsError(error as Error, {
          bucket: this.bucket,
          key: fullKey,
          operation: 'putObject',
          commandName: 'PutObjectCommand',
          commandInput: responseInput
        });
      }
    });
  }

  async getObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const responseInput = { Key: key };

    try {
      const partitionRow = this._isPartitionIndexKey(fullKey)
        ? this._getPartitionIndexRow(fullKey)
        : null;
      const row = partitionRow ? null : this._getRow(fullKey);
      if (partitionRow) {
        const response = this._normalizePartitionObject(partitionRow, false);
        this.emit('cl:response', 'GetObjectCommand', response, responseInput);
        return response;
      }

      if (!row) {
        throw new NoSuchKey({
          bucket: this.bucket,
          key: fullKey,
          statusCode: 404,
          retriable: false,
          suggestion: 'Ensure the key exists before attempting to read it.'
        });
      }

      const response = this._normalizeObject(row, false);
      this.emit('cl:response', 'GetObjectCommand', response, responseInput);
      return response;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw mapAwsError(error as Error, {
        bucket: this.bucket,
        key: fullKey,
        operation: 'getObject',
        commandName: 'GetObjectCommand',
        commandInput: responseInput
      });
    }
  }

  async getObjects(keys: string[]): Promise<Array<{ key: string; object: S3Object }>> {
    if (!Array.isArray(keys) || keys.length === 0) {
      return [];
    }

    const keyEntries = keys.map((key) => ({
      requestedKey: key,
      fullKey: this._applyKeyPrefix(key)
    }));
    const rowsByKey = new Map<string, DbRow>();

    for (const batch of chunk(keyEntries, 500)) {
      if (batch.length === 0) {
        continue;
      }

      const placeholders = batch.map(() => '?').join(', ');
      const statement = this._prepareCached(`
        SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
        FROM objects
        WHERE bucket = ? AND key IN (${placeholders})
      `);
      const rows = statement.all(
        this.bucket,
        ...batch.map((entry) => entry.fullKey)
      ) as unknown as DbRow[];

      for (const row of rows) {
        rowsByKey.set(row.key, row);
      }
    }

    return keyEntries.flatMap(({ requestedKey, fullKey }) => {
      const row = rowsByKey.get(fullKey);
      if (!row) {
        return [];
      }

      return [{
        key: requestedKey,
        object: this._normalizeObject(row, false)
      }];
    });
  }

  async headObject(key: string): Promise<S3Object> {
    const fullKey = this._applyKeyPrefix(key);
    const responseInput = { Key: key };

    try {
      const partitionRow = this._isPartitionIndexKey(fullKey)
        ? this._getPartitionIndexRow(fullKey)
        : null;
      const row = partitionRow ? null : this._getObjectHeaderRow(fullKey);
      if (partitionRow) {
        const response = this._normalizePartitionObject(partitionRow, true);
        this.emit('cl:response', 'HeadObjectCommand', response, responseInput);
        return response;
      }

      if (!row) {
        throw new NoSuchKey({
          bucket: this.bucket,
          key: fullKey,
          statusCode: 404,
          retriable: false,
          suggestion: 'Ensure the key exists before attempting to read it.'
        });
      }

      const response = this._normalizeObject(row, true);
      this.emit('cl:response', 'HeadObjectCommand', response, responseInput);
      return response;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw mapAwsError(error as Error, {
        bucket: this.bucket,
        key: fullKey,
        operation: 'headObject',
        commandName: 'HeadObjectCommand',
        commandInput: responseInput
      });
    }
  }

  async copyObject(params: CopyObjectParams): Promise<CopyObjectResponse> {
    return this._runWriteTask(async () => {
      const { from, to, metadata, metadataDirective, contentType } = params;
      const fullFrom = this._applyKeyPrefix(from);
      const fullTo = this._applyKeyPrefix(to);
      const responseInput = {
        CopySource: from,
        Key: to,
        Metadata: metadata,
        MetadataDirective: metadataDirective,
        ContentType: contentType
      };

      try {
        const response = this._withWriteTransaction(() => {
          const sourceRow = this._getCopySourceRow(fullFrom);
          if (!sourceRow) {
            throw new NoSuchKey({
              bucket: this.bucket,
              key: fullFrom,
              statusCode: 404,
              retriable: false,
              suggestion: 'Copy requires an existing source object.'
            });
          }

          const destinationRow = this._getObjectState(fullTo);
          const destinationPartitionRow = this._isPartitionIndexKey(fullTo)
            ? this._getPartitionIndexRow(fullTo)
            : null;
          this._validateMemoryBudget(sourceRow.content_length, destinationRow?.content_length || 0, fullTo);

          const sourceMetadata = this._decodeMetadataRow(sourceRow);
          const normalizedMetadata = this._encodeMetadata(sourceMetadata);
          let finalMetadata: Record<string, string>;

          if (metadataDirective === 'REPLACE' && metadata) {
            finalMetadata = this._encodeMetadata(metadata) || {};
          } else if (metadata) {
            finalMetadata = { ...normalizedMetadata, ...this._encodeMetadata(metadata) };
          } else {
            finalMetadata = normalizedMetadata || {};
          }

          const finalContentType = contentType || sourceRow.content_type;
          const now = new Date().toISOString();
          const shouldMaterializeDestination = this._shouldMaterializePartitionWrite(fullTo, sourceRow.body);

          if (shouldMaterializeDestination) {
            const partitionEntry = this._parsePartitionIndexKey(fullTo);
            if (!partitionEntry) {
              throw new DatabaseError(`Invalid partition index key: ${fullTo}`, {
                operation: 'copyObject',
                bucket: this.bucket,
                key: fullTo,
                retriable: false,
                suggestion: 'Partition index keys must include resource=, partition= and id= segments.'
              });
            }

            const statement = this._prepareCached(`
              INSERT INTO partition_index (
                bucket, key, resource_name, partition_name, record_id, metadata, content_type, etag, last_modified
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(bucket, key) DO UPDATE SET
                resource_name = excluded.resource_name,
                partition_name = excluded.partition_name,
                record_id = excluded.record_id,
                metadata = excluded.metadata,
                content_type = excluded.content_type,
                etag = excluded.etag,
                last_modified = excluded.last_modified
            `);

            statement.run(
              this.bucket,
              fullTo,
              partitionEntry.resourceName,
              partitionEntry.partitionName,
              partitionEntry.recordId,
              JSON.stringify(finalMetadata || {}),
              finalContentType,
              sourceRow.etag,
              now
            );

            if (destinationRow) {
              const deleteLegacyStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
              deleteLegacyStatement.run(this.bucket, fullTo);
              this._adjustBucketSize(-destinationRow.content_length);
            }
          } else if (fullFrom === fullTo && sourceRow.source === 'object') {
            const statement = this._prepareCached(`
              UPDATE objects
              SET metadata = ?, content_type = ?, last_modified = ?
              WHERE bucket = ? AND key = ?
            `);
            statement.run(
              JSON.stringify(finalMetadata || {}),
              finalContentType,
              now,
              this.bucket,
              fullTo
            );
          } else {
            const statement = this._prepareCached(`
              INSERT INTO objects (
                bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(bucket, key) DO UPDATE SET
                metadata = excluded.metadata,
                content_type = excluded.content_type,
                content_encoding = excluded.content_encoding,
                content_length = excluded.content_length,
                etag = excluded.etag,
                last_modified = excluded.last_modified,
                body = excluded.body
            `);

            statement.run(
              this.bucket,
              fullTo,
              JSON.stringify(finalMetadata || {}),
              finalContentType,
              sourceRow.content_encoding,
              sourceRow.content_length,
              sourceRow.etag,
              now,
              sourceRow.body
            );
            this._adjustBucketSize(sourceRow.content_length - (destinationRow?.content_length || 0));

            if (destinationPartitionRow) {
              const deletePartitionStatement = this._prepareCached('DELETE FROM partition_index WHERE bucket = ? AND key = ?');
              deletePartitionStatement.run(this.bucket, fullTo);
            }
          }

          return {
            CopyObjectResult: {
              ETag: this._formatEtag(sourceRow.etag),
              LastModified: now
            },
            BucketKeyEnabled: false,
            VersionId: null,
            ServerSideEncryption: null
          } satisfies CopyObjectResponse;
        });

        this.emit('cl:response', 'CopyObjectCommand', response, responseInput);
        return response;
      } catch (error) {
        if (error instanceof BaseError) {
          throw error;
        }
        throw mapAwsError(error as Error, {
          bucket: this.bucket,
          key: fullTo,
          operation: 'copyObject',
          commandName: 'CopyObjectCommand',
          commandInput: responseInput
        });
      }
    });
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this._applyKeyPrefix(key);
    if (this._isPartitionIndexKey(fullKey) && this._hasPartitionIndexKey(fullKey)) {
      return true;
    }
    return this._hasKey(fullKey);
  }

  async deleteObject(key: string): Promise<DeleteObjectResponse> {
    return this._runWriteTask(async () => {
      const fullKey = this._applyKeyPrefix(key);
      const responseInput = { Key: key };

      try {
        const response = this._withWriteTransaction(() => {
          const partitionRow = this._isPartitionIndexKey(fullKey)
            ? this._getPartitionIndexRow(fullKey)
            : null;
          const existingRow = this._getObjectState(fullKey);
          const objectDeleteStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
          objectDeleteStatement.run(this.bucket, fullKey);

          if (partitionRow) {
            const partitionDeleteStatement = this._prepareCached('DELETE FROM partition_index WHERE bucket = ? AND key = ?');
            partitionDeleteStatement.run(this.bucket, fullKey);
          }

          if (existingRow) {
            this._adjustBucketSize(-existingRow.content_length);
          }

          return {
            DeleteMarker: false,
            VersionId: null
          } satisfies DeleteObjectResponse;
        });

        this.emit('cl:response', 'DeleteObjectCommand', response, responseInput);
        return response;
      } catch (error) {
        if (error instanceof BaseError) {
          throw error;
        }
        throw mapAwsError(error as Error, {
          bucket: this.bucket,
          key: fullKey,
          operation: 'deleteObject',
          commandName: 'DeleteObjectCommand',
          commandInput: responseInput
        });
      }
    });
  }
}
