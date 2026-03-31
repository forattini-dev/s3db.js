import { chunk } from 'lodash-es';

import { tryFn } from '../../concerns/try-fn.js';
import { mapAwsError, DatabaseError, BaseError } from '../../errors.js';
import type {
  ListObjectsParams,
  GetKeysPageParams,
  GetFilteredObjectsPageParams,
  GetFilteredObjectsWindowParams,
  FilteredObjectsWindowResponse,
  S3Object,
  ListObjectsResponse,
  DeleteObjectsResponse
} from '../types.js';
import type { DbListRow, DbCountRow, DbDeleteSummaryRow } from './types.js';
import { SqliteClientCrud } from './crud.js';

export class SqliteClientQuery extends SqliteClientCrud {
  async deleteObjects(keys: string[]): Promise<DeleteObjectsResponse> {
    return this._runWriteTask(async () => {
      const fullKeys = keys.map(key => this._applyKeyPrefix(key));
      const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };

      const batches = chunk(fullKeys, this.taskManager.concurrency || 5);
      const allResults: DeleteObjectsResponse = { Deleted: [], Errors: [] };

      const { results, errors } = await this.taskManager.process(
        batches,
        async (batch) => {
          return this._withWriteTransaction(() => {
            const deleted: Array<{ Key: string }> = [];
            const batchErrors: Array<{ Key: string; Code: string; Message: string }> = [];
            const objectDeleteStatement = this._prepareCached('DELETE FROM objects WHERE bucket = ? AND key = ?');
            const partitionDeleteStatement = this._prepareCached('DELETE FROM partition_index WHERE bucket = ? AND key = ?');
            let reclaimedBytes = 0;

            for (const fullKey of batch) {
              try {
                const partitionRow = this._isPartitionIndexKey(fullKey)
                  ? this._getPartitionIndexRow(fullKey)
                  : null;
                const existingRow = this._getObjectState(fullKey);
                objectDeleteStatement.run(this.bucket, fullKey) as any;
                if (partitionRow) {
                  partitionDeleteStatement.run(this.bucket, fullKey) as any;
                }
                if (existingRow) {
                  reclaimedBytes += existingRow.content_length;
                }
                const localKey = this._stripKeyPrefix(fullKey);
                deleted.push({ Key: localKey });
              } catch (error) {
                batchErrors.push({
                  Key: this._stripKeyPrefix(fullKey),
                  Code: (error as Error).name || 'InternalError',
                  Message: (error as Error).message
                });
              }
            }

            if (reclaimedBytes > 0) {
              this._adjustBucketSize(-reclaimedBytes);
            }

            return { deleted, batchErrors };
          });
        }
      );

      for (const result of results) {
        allResults.Deleted.push(...result.deleted);
        if (result.batchErrors.length > 0) {
          allResults.Errors.push(...result.batchErrors);
        }
      }
      for (const error of errors) {
        const sourceError = error.error;
        allResults.Errors.push({
          Key: keys[error.index] || `index-${error.index}`,
          Code: sourceError instanceof Error ? sourceError.name : 'InternalError',
          Message: sourceError instanceof Error ? sourceError.message : 'Unknown error'
        });
      }

      this.emit('cl:response', 'DeleteObjectsCommand', allResults, input);
      return allResults;
    });
  }

  async listObjects(params: ListObjectsParams = {}): Promise<ListObjectsResponse> {
    const {
      prefix = '',
      delimiter = null,
      maxKeys = 1000,
      continuationToken = null,
      startAfter = null
    } = params;

    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const responseInput = {
      Prefix: prefix,
      Delimiter: delimiter,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
      StartAfter: startAfter
    };

    try {
      if (this._prefixTargetsPartitionIndex(fullPrefix)) {
        const response = this._listPartitionObjects({
          prefix,
          fullPrefix,
          delimiter,
          maxKeys,
          continuationToken,
          startAfter
        });
        this.emit('cl:response', 'ListObjectsV2Command', response, responseInput);
        return response;
      }

      const startFilter = continuationToken
        ? this._decodeContinuationToken(continuationToken)
        : startAfter;
      const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);

      const queryParams: Array<string | number> = [this.bucket, rangeStart, rangeEnd];
      const whereClauses: string[] = ['bucket = ?', 'key >= ?', 'key < ?'];

      if (startFilter) {
        whereClauses.push('key > ?');
        queryParams.push(startFilter);
      }

      const maxKeysValue = Number.isFinite(maxKeys) ? Math.trunc(maxKeys) : 1000;
      const safeMaxKeys = Math.max(1, maxKeysValue);
      const queryLimit = safeMaxKeys === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : safeMaxKeys + 1;
      const statement = this._prepareCached(`
        SELECT key, content_length, etag, last_modified, content_type, content_encoding
        FROM objects
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY key ASC
        LIMIT ?
      `);
      const rows = statement.all(...queryParams, queryLimit) as unknown as DbListRow[];
      const hasExtraRow = rows.length > safeMaxKeys;

      const contents: Array<{ Key: string; Size: number; LastModified: Date; ETag: string; StorageClass: string }> = [];
      const commonPrefixSet = new Set<string>();
      const commonPrefixes: Array<{ Prefix: string }> = [];

      let processed = 0;
      let hasMore = false;
      let lastKey: string | null = null;

      for (const row of rows) {
        if (processed >= safeMaxKeys) {
          hasMore = true;
          break;
        }

        const commonPrefix = delimiter
          ? this._extractCommonPrefix(fullPrefix, delimiter, row.key)
          : null;

        if (commonPrefix) {
          if (!commonPrefixSet.has(commonPrefix)) {
            commonPrefixSet.add(commonPrefix);
            commonPrefixes.push({ Prefix: this._stripKeyPrefix(commonPrefix) });
            processed++;
            lastKey = row.key;
          }
          continue;
        }

        contents.push({
          Key: this._stripKeyPrefix(row.key),
          Size: row.content_length,
          LastModified: new Date(row.last_modified),
          ETag: this._formatEtag(row.etag),
          StorageClass: 'STANDARD'
        });
        processed++;
        lastKey = row.key;
      }

      hasMore = hasMore || hasExtraRow;

      const response: ListObjectsResponse = {
        Contents: contents,
        CommonPrefixes: commonPrefixes,
        IsTruncated: hasMore,
        ContinuationToken: continuationToken || undefined,
        NextContinuationToken: hasMore && lastKey ? this._encodeContinuationToken(lastKey) : null,
        KeyCount: contents.length,
        MaxKeys: maxKeys,
        Prefix: prefix || undefined,
        Delimiter: delimiter,
        StartAfter: startAfter || undefined
      };

      this.emit('cl:response', 'ListObjectsV2Command', response, responseInput);
      return response;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      if (error instanceof Error) {
        throw mapAwsError(error, {
          bucket: this.bucket,
          operation: 'listObjects',
          commandName: 'ListObjectsV2Command',
          commandInput: responseInput
        });
      }
      throw new DatabaseError('Unexpected error in listObjects', {
        bucket: this.bucket,
        operation: 'listObjects'
      });
    }
  }

  async getKeysPage(params: GetKeysPageParams = {}): Promise<string[]> {
    const { prefix = '', offset = 0, amount = 100 } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      const keys = this._getPartitionKeysPage(fullPrefix, offset, amount);
      this.emit('cl:GetKeysPage', keys, params);
      return keys;
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const safeAmount = Math.max(0, Math.trunc(amount));
    const safeOffset = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
      LIMIT ? OFFSET ?
    `);
    const rows = statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      safeAmount,
      safeOffset
    ) as Array<{ key: string }>;
    const keys = rows.map((row) => this._stripKeyPrefix(row.key));

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  async getFilteredObjectsPage(params: GetFilteredObjectsPageParams): Promise<Array<{ key: string; object: S3Object }>> {
    const { prefix, offset = 0, amount = 100, filters = [] } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const safeAmount = Math.max(0, Math.trunc(amount));
    const safeOffset = Math.max(0, Math.trunc(offset));

    const rows = this._prefixTargetsPartitionIndex(fullPrefix)
      ? this._getFilteredPartitionObjectRows(fullPrefix, filters, safeAmount, safeOffset)
      : this._getFilteredDataRows(fullPrefix, filters, safeAmount, safeOffset);

    const results = rows.map((row) => ({
      key: this._stripKeyPrefix(row.key),
      object: this._normalizeObject(row, false)
    }));

    this.emit('cl:GetFilteredObjectsPage', results, params);
    return results;
  }

  async getFilteredObjectsWindow(params: GetFilteredObjectsWindowParams): Promise<FilteredObjectsWindowResponse> {
    const {
      prefix,
      maxKeys = 100,
      continuationToken = null,
      filters = []
    } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const safeMaxKeys = Math.max(1, Math.trunc(maxKeys));
    const queryLimit = safeMaxKeys + 1;
    const startAfter = continuationToken
      ? this._decodeContinuationToken(continuationToken)
      : null;

    const rows = this._prefixTargetsPartitionIndex(fullPrefix)
      ? this._getFilteredPartitionObjectRowsAfter(fullPrefix, filters, queryLimit, startAfter)
      : this._getFilteredDataRowsAfter(fullPrefix, filters, queryLimit, startAfter);

    const hasMore = rows.length > safeMaxKeys;
    const visibleRows = hasMore ? rows.slice(0, safeMaxKeys) : rows;
    const lastVisibleRow = visibleRows.at(-1) || null;
    const response: FilteredObjectsWindowResponse = {
      Contents: visibleRows.map((row) => ({
        key: this._stripKeyPrefix(row.key),
        object: this._normalizeObject(row, false)
      })),
      IsTruncated: hasMore,
      NextContinuationToken: hasMore && lastVisibleRow ? this._encodeContinuationToken(lastVisibleRow.key) : null
    };

    this.emit('cl:GetFilteredObjectsWindow', response, params);
    return response;
  }

  async getAllKeys(params: { prefix?: string } = {}): Promise<string[]> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      return this._getAllPartitionKeys(fullPrefix);
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
    `);
    const keys: string[] = [];

    for (const row of statement.iterate(
      this.bucket,
      rangeStart,
      rangeEnd
    ) as IterableIterator<{ key: string }>) {
      keys.push(this._stripKeyPrefix(row.key));
    }

    return keys;
  }

  async count(params: { prefix?: string } = {}): Promise<number> {
    const { prefix = '' } = params;
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      const count = this._countPartitionKeys(fullPrefix);
      this.emit('cl:Count', count, { prefix });
      return count;
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT COALESCE(COUNT(key), 0) AS total
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd
    ) as DbCountRow | undefined;
    const count = Number(row?.total || 0);

    this.emit('cl:Count', count, { prefix });
    return count;
  }

  async deleteAll(params: { prefix?: string } = {}): Promise<number> {
    return this._runWriteTask(async () => {
      const { prefix = '' } = params;
      const fullPrefix = this._applyKeyPrefix(prefix || '');
      if (this._prefixTargetsPartitionIndex(fullPrefix)) {
        const totalDeleted = this._deleteAllPartitionKeys(fullPrefix);

        this.emit('deleteAll', {
          prefix,
          batch: totalDeleted,
          total: totalDeleted
        });

        this.emit('deleteAllComplete', {
          prefix,
          totalDeleted
        });
        return totalDeleted;
      }

      const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
      const totalDeleted = this._withWriteTransaction(() => {
        const summaryStatement = this._prepareCached(`
          SELECT
            COALESCE(COUNT(*), 0) AS total_objects,
            COALESCE(SUM(content_length), 0) AS total_content_length
          FROM objects
          WHERE bucket = ? AND key >= ? AND key < ?
        `);
        const deleteStatement = this._prepareCached(`
          DELETE FROM objects
          WHERE bucket = ? AND key >= ? AND key < ?
        `);
        const summary = summaryStatement.get(
          this.bucket,
          rangeStart,
          rangeEnd
        ) as DbDeleteSummaryRow | undefined;
        const totalObjects = Number(summary?.total_objects || 0);
        const reclaimedBytes = Number(summary?.total_content_length || 0);

        if (totalObjects === 0) {
          return 0;
        }

        deleteStatement.run(this.bucket, rangeStart, rangeEnd);
        if (reclaimedBytes > 0) {
          this._adjustBucketSize(-reclaimedBytes);
        }

        return totalObjects;
      });

      this.emit('deleteAll', {
        prefix,
        batch: totalDeleted,
        total: totalDeleted
      });

      this.emit('deleteAllComplete', {
        prefix,
        totalDeleted
      });
      return totalDeleted;
    });
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix = '', offset = 1000 } = params;
    if (offset === 0) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    const fullPrefix = this._applyKeyPrefix(prefix || '');
    if (this._prefixTargetsPartitionIndex(fullPrefix)) {
      const token = this._getPartitionContinuationTokenAfterOffset(fullPrefix, offset);
      this.emit('cl:GetContinuationTokenAfterOffset', token, { prefix, offset });
      return token;
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const offsetValue = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
      LIMIT 1 OFFSET ?
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd,
      offsetValue
    ) as { key: string } | undefined;

    if (!row) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    const token = this._encodeContinuationToken(row.key);

    this.emit('cl:GetContinuationTokenAfterOffset', token, { prefix, offset });
    return token;
  }

  async moveObject(params: { from: string; to: string }): Promise<boolean> {
    const { from, to } = params;
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from, to, metadataDirective: 'COPY' });
      await this.deleteObject(from);
    });

    if (!ok) {
      throw new DatabaseError('Unexpected error in moveObject', {
        bucket: this.bucket,
        from,
        to,
        original: err
      });
    }

    return true;
  }

  async moveAllObjects(params: { prefixFrom: string; prefixTo: string }): Promise<Array<{ from: string; to: string }>> {
    const { prefixFrom, prefixTo } = params;
    const allResults: Array<{ from: string; to: string }> = [];
    const allErrors: Array<{ error: Error; index: number; item?: unknown }> = [];
    let continuationToken: string | undefined;
    let truncated = true;

    while (truncated) {
      const listResult = await this.listObjects({
        prefix: prefixFrom,
        continuationToken,
        maxKeys: Math.max(this.taskManager.concurrency || 1000, 1)
      });
      const keys = listResult.Contents.map(x => x.Key);

      if (keys.length === 0) {
        break;
      }

      const { results, errors } = await this.taskManager.process(
        keys,
        async (key) => {
          const to = key.replace(prefixFrom, prefixTo);
          await this.moveObject({ from: key, to });
          return { from: key, to };
        }
      );

      allResults.push(...results);
      allErrors.push(...errors);

      truncated = listResult.IsTruncated || false;
      continuationToken = listResult.NextContinuationToken || undefined;
    }

    const errors = allErrors;
    const results = allResults;

    this.emit('moveAllObjects', { results, errors });

    if (errors.length > 0) {
      const error = new Error('Some objects could not be moved') as Error & { context: unknown };
      error.context = {
        bucket: this.bucket,
        operation: 'moveAllObjects',
        prefixFrom,
        prefixTo,
        totalKeys: results.length + errors.length,
        failedCount: errors.length,
        successCount: results.length,
        errors
      };
      throw error;
    }

    return results;
  }
}
