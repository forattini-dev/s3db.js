import { tryFn } from '../../concerns/try-fn.js';
import { DatabaseError } from '../../errors.js';
import type {
  ListObjectsResponse,
  FilteredObjectsPageFilter
} from '../types.js';
import type {
  DbRow,
  DbListRow,
  DbCountRow,
  DbBucketStatsRow,
  DbPartitionRow,
  DbCopySourceRow
} from './types.js';
import { SqliteClientUtils } from './utils.js';

export class SqliteClientPartitions extends SqliteClientUtils {
  protected _shouldMaterializePartitionWrite(key: string, body: Buffer): boolean {
    return body.length === 0 && this._isPartitionIndexKey(key);
  }

  protected _prefixTargetsPartitionIndex(prefix: string): boolean {
    if (!prefix) {
      return false;
    }

    return prefix.split('/').some((segment) => segment.startsWith('partition='));
  }

  protected _isPartitionIndexKey(key: string): boolean {
    return this._parsePartitionIndexKey(key) !== null;
  }

  protected _parsePartitionIndexKey(key: string): { resourceName: string; partitionName: string; recordId: string } | null {
    const segments = String(key || '').split('/');

    if (segments.includes('data')) {
      return null;
    }

    const resourceSegment = segments.find((segment) => segment.startsWith('resource='));
    const partitionSegment = segments.find((segment) => segment.startsWith('partition='));
    const idSegment = segments.find((segment) => segment.startsWith('id='));

    if (!resourceSegment || !partitionSegment || !idSegment) {
      return null;
    }

    const resourceName = resourceSegment.slice('resource='.length);
    const partitionName = partitionSegment.slice('partition='.length);
    const recordId = idSegment.slice('id='.length);

    if (!resourceName || !partitionName || !recordId) {
      return null;
    }

    return {
      resourceName,
      partitionName,
      recordId
    };
  }

  protected _getPartitionIndexRow(key: string): DbPartitionRow | null {
    const statement = this._prepareCached(`
      SELECT key, metadata, content_type, etag, last_modified
      FROM partition_index
      WHERE bucket = ? AND key = ?
    `);
    const row = statement.get(this.bucket, key) as DbPartitionRow | undefined;
    return row || null;
  }

  protected _hasPartitionIndexKey(key: string): boolean {
    const statement = this._prepareCached(`
      SELECT 1
      FROM partition_index
      WHERE bucket = ? AND key = ?
      LIMIT 1
    `);
    return Boolean(statement.get(this.bucket, key));
  }

  protected _getCopySourceRow(key: string): DbCopySourceRow | null {
    const partitionRow = this._isPartitionIndexKey(key)
      ? this._getPartitionIndexRow(key)
      : null;

    if (partitionRow) {
      return {
        key: partitionRow.key,
        metadata: partitionRow.metadata,
        content_type: partitionRow.content_type,
        content_encoding: null,
        content_length: 0,
        etag: partitionRow.etag,
        last_modified: partitionRow.last_modified,
        body: Buffer.alloc(0),
        source: 'partition'
      };
    }

    const row = this._getRow(key);
    if (!row) {
      return null;
    }

    return {
      ...row,
      source: 'object'
    };
  }

  protected _listPartitionObjects({
    prefix,
    fullPrefix,
    delimiter,
    maxKeys,
    continuationToken,
    startAfter
  }: {
    prefix: string;
    fullPrefix: string;
    delimiter: string | null;
    maxKeys: number;
    continuationToken: string | null;
    startAfter: string | null;
  }): ListObjectsResponse {
    const startFilter = continuationToken
      ? this._decodeContinuationToken(continuationToken)
      : startAfter;
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const maxKeysValue = Number.isFinite(maxKeys) ? Math.trunc(maxKeys) : 1000;
    const safeMaxKeys = Math.max(1, maxKeysValue);
    const queryLimit = safeMaxKeys === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : safeMaxKeys + 1;
    const params: Array<string | number> = [
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd
    ];

    const outerWhereClause = startFilter ? 'WHERE key > ?' : '';
    if (startFilter) {
      params.push(startFilter);
    }

    const statement = this._prepareCached(`
      SELECT key, content_length, etag, last_modified, content_type, content_encoding
      FROM (
        SELECT key, 0 AS content_length, etag, last_modified, content_type, NULL AS content_encoding
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION ALL
        SELECT o.key, o.content_length, o.etag, o.last_modified, o.content_type, o.content_encoding
        FROM objects o
        WHERE o.bucket = ? AND o.key >= ? AND o.key < ?
          AND NOT EXISTS (
            SELECT 1
            FROM partition_index p
            WHERE p.bucket = o.bucket AND p.key = o.key
          )
      )
      ${outerWhereClause}
      ORDER BY key ASC
      LIMIT ?
    `);
    const rows = statement.all(...params, queryLimit) as unknown as DbListRow[];
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

    return {
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
  }

  protected _getPartitionKeysPage(fullPrefix: string, offset: number, amount: number): string[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const safeAmount = Math.max(0, Math.trunc(amount));
    const safeOffset = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
      ORDER BY key ASC
      LIMIT ? OFFSET ?
    `);
    const rows = statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      safeAmount,
      safeOffset
    ) as Array<{ key: string }>;

    return rows.map((row) => this._stripKeyPrefix(row.key));
  }

  protected _buildFilteredObjectClause(
    alias: string,
    filters: FilteredObjectsPageFilter[]
  ): { sql: string; params: string[] } {
    if (!Array.isArray(filters) || filters.length === 0) {
      return { sql: '', params: [] };
    }

    const clauses: string[] = [];
    const params: string[] = [];

    for (const filter of filters) {
      const branchClauses: string[] = [
        `CAST(json_extract(${alias}.metadata, ?) AS TEXT) = ?`
      ];
      params.push(filter.metadataPath, filter.metadataValue);

      if (filter.mappedBodyPath && filter.mappedBodyValue !== undefined && filter.mappedBodyValue !== null) {
        branchClauses.push(`
          (
            json_valid(CAST(${alias}.body AS TEXT))
            AND CAST(json_extract(CAST(${alias}.body AS TEXT), ?) AS TEXT) = ?
          )
        `);
        params.push(filter.mappedBodyPath, filter.mappedBodyValue);
      }

      if (filter.rawBodyPath && filter.rawBodyValue !== undefined && filter.rawBodyValue !== null) {
        branchClauses.push(`
          (
            json_valid(CAST(${alias}.body AS TEXT))
            AND CAST(json_extract(CAST(${alias}.body AS TEXT), ?) AS TEXT) = ?
          )
        `);
        params.push(filter.rawBodyPath, filter.rawBodyValue);
      }

      clauses.push(`(${branchClauses.join(' OR ')})`);
    }

    return {
      sql: ` AND ${clauses.join(' AND ')}`,
      params
    };
  }

  protected _buildDataKeyPrefixFromPartitionPrefix(fullPrefix: string): string | null {
    const segments = String(fullPrefix || '').split('/');
    const partitionIndex = segments.findIndex((segment) => segment.startsWith('partition='));

    if (partitionIndex <= 0) {
      return null;
    }

    return [...segments.slice(0, partitionIndex), 'data', 'id='].join('/');
  }

  protected _getFilteredDataRows(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    offset: number
  ): DbRow[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const statement = this._prepareCached(`
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM objects o
      WHERE o.bucket = ? AND o.key >= ? AND o.key < ?${filterSql}
      ORDER BY o.key ASC
      LIMIT ? OFFSET ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      ...filterParams,
      amount,
      offset
    ) as unknown as DbRow[];
  }

  protected _getFilteredDataRowsAfter(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    startAfter: string | null
  ): DbRow[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const afterSql = startAfter ? ' AND o.key > ?' : '';
    const statement = this._prepareCached(`
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM objects o
      WHERE o.bucket = ? AND o.key >= ? AND o.key < ?${afterSql}${filterSql}
      ORDER BY o.key ASC
      LIMIT ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      ...(startAfter ? [startAfter] : []),
      ...filterParams,
      amount
    ) as unknown as DbRow[];
  }

  protected _getFilteredPartitionObjectRows(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    offset: number
  ): DbRow[] {
    const dataKeyPrefix = this._buildDataKeyPrefixFromPartitionPrefix(fullPrefix);
    if (!dataKeyPrefix) {
      return [];
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const statement = this._prepareCached(`
      WITH matched_record_ids AS (
        SELECT record_id
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT substr(legacy.key, instr(legacy.key, '/id=') + 4) AS record_id
        FROM objects legacy
        WHERE legacy.bucket = ? AND legacy.key >= ? AND legacy.key < ?
          AND instr(legacy.key, '/id=') > 0
          AND NOT EXISTS (
            SELECT 1
            FROM partition_index p
            WHERE p.bucket = legacy.bucket AND p.key = legacy.key
          )
      )
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM matched_record_ids m
      JOIN objects o
        ON o.bucket = ? AND o.key = ? || m.record_id
      WHERE 1 = 1${filterSql}
      ORDER BY o.key ASC
      LIMIT ? OFFSET ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      dataKeyPrefix,
      ...filterParams,
      amount,
      offset
    ) as unknown as DbRow[];
  }

  protected _getFilteredPartitionObjectRowsAfter(
    fullPrefix: string,
    filters: FilteredObjectsPageFilter[],
    amount: number,
    startAfter: string | null
  ): DbRow[] {
    const dataKeyPrefix = this._buildDataKeyPrefixFromPartitionPrefix(fullPrefix);
    if (!dataKeyPrefix) {
      return [];
    }

    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const { sql: filterSql, params: filterParams } = this._buildFilteredObjectClause('o', filters);
    const afterSql = startAfter ? ' AND o.key > ?' : '';
    const statement = this._prepareCached(`
      WITH matched_record_ids AS (
        SELECT record_id
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT substr(legacy.key, instr(legacy.key, '/id=') + 4) AS record_id
        FROM objects legacy
        WHERE legacy.bucket = ? AND legacy.key >= ? AND legacy.key < ?
          AND instr(legacy.key, '/id=') > 0
          AND NOT EXISTS (
            SELECT 1
            FROM partition_index p
            WHERE p.bucket = legacy.bucket AND p.key = legacy.key
          )
      )
      SELECT o.key, o.metadata, o.content_type, o.content_encoding, o.content_length, o.etag, o.last_modified, o.body
      FROM matched_record_ids m
      JOIN objects o
        ON o.bucket = ? AND o.key = ? || m.record_id
      WHERE 1 = 1${afterSql}${filterSql}
      ORDER BY o.key ASC
      LIMIT ?
    `);

    return statement.all(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      dataKeyPrefix,
      ...(startAfter ? [startAfter] : []),
      ...filterParams,
      amount
    ) as unknown as DbRow[];
  }

  protected _getAllPartitionKeys(fullPrefix: string): string[] {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT key
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
      ORDER BY key ASC
    `);
    const keys: string[] = [];

    for (const row of statement.iterate(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd
    ) as IterableIterator<{ key: string }>) {
      keys.push(this._stripKeyPrefix(row.key));
    }

    return keys;
  }

  protected _countPartitionKeys(fullPrefix: string): number {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const statement = this._prepareCached(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd
    ) as DbCountRow | undefined;

    return Number(row?.total || 0);
  }

  protected _deleteAllPartitionKeys(fullPrefix: string): number {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);

    return this._withWriteTransaction(() => {
      const countStatement = this._prepareCached(`
        SELECT COUNT(*) AS total
        FROM (
          SELECT key
          FROM partition_index
          WHERE bucket = ? AND key >= ? AND key < ?
          UNION
          SELECT key
          FROM objects
          WHERE bucket = ? AND key >= ? AND key < ?
        )
      `);
      const objectSummaryStatement = this._prepareCached(`
        SELECT COALESCE(SUM(content_length), 0) AS total_content_length
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      `);
      const partitionDeleteStatement = this._prepareCached(`
        DELETE FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
      `);
      const objectDeleteStatement = this._prepareCached(`
        DELETE FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      `);

      const countRow = countStatement.get(
        this.bucket,
        rangeStart,
        rangeEnd,
        this.bucket,
        rangeStart,
        rangeEnd
      ) as DbCountRow | undefined;
      const objectSummary = objectSummaryStatement.get(
        this.bucket,
        rangeStart,
        rangeEnd
      ) as DbBucketStatsRow | undefined;
      const totalObjects = Number(countRow?.total || 0);
      const reclaimedBytes = Number(objectSummary?.total_content_length || 0);

      if (totalObjects === 0) {
        return 0;
      }

      partitionDeleteStatement.run(this.bucket, rangeStart, rangeEnd);
      objectDeleteStatement.run(this.bucket, rangeStart, rangeEnd);

      if (reclaimedBytes > 0) {
        this._adjustBucketSize(-reclaimedBytes);
      }

      return totalObjects;
    });
  }

  protected _getPartitionContinuationTokenAfterOffset(fullPrefix: string, offset: number): string | null {
    const { start: rangeStart, end: rangeEnd } = this._getKeyRange(fullPrefix);
    const offsetValue = Math.max(0, Math.trunc(offset));
    const statement = this._prepareCached(`
      SELECT key
      FROM (
        SELECT key
        FROM partition_index
        WHERE bucket = ? AND key >= ? AND key < ?
        UNION
        SELECT key
        FROM objects
        WHERE bucket = ? AND key >= ? AND key < ?
      )
      ORDER BY key ASC
      LIMIT 1 OFFSET ?
    `);
    const row = statement.get(
      this.bucket,
      rangeStart,
      rangeEnd,
      this.bucket,
      rangeStart,
      rangeEnd,
      offsetValue
    ) as { key: string } | undefined;

    return row ? this._encodeContinuationToken(row.key) : null;
  }

  public ensureResourceIndexes(
    resourceName: string,
    partitions: Record<string, { fields?: Record<string, string> }>
  ): void {
    if (!partitions || typeof partitions !== 'object') return;

    const fieldPaths = new Set<string>();
    for (const partition of Object.values(partitions)) {
      if (partition?.fields && typeof partition.fields === 'object') {
        for (const fieldName of Object.keys(partition.fields)) {
          fieldPaths.add(fieldName);
        }
      }
    }

    if (fieldPaths.size === 0) return;

    const tableInfo = this.db.prepare('PRAGMA table_info(objects)').all() as Array<{ name: string }>;
    const existingColumns = new Set(tableInfo.map((row) => row.name));

    for (const fieldPath of fieldPaths) {
      const colSuffix = fieldPath.replace(/\./g, '__').replace(/[^a-zA-Z0-9_]/g, '_');
      const colName = `_idx_${colSuffix}`;
      const jsonPath = `$.${fieldPath}`;
      const indexName = `idx_obj_${colSuffix}`;

      if (!existingColumns.has(colName)) {
        tryFn(() =>
          this.db.exec(
            `ALTER TABLE objects ADD COLUMN ${colName} TEXT GENERATED ALWAYS AS (json_extract(metadata, '${jsonPath}')) VIRTUAL`
          )
        );
      }

      tryFn(() =>
        this.db.exec(
          `CREATE INDEX IF NOT EXISTS ${indexName} ON objects (${colName}, bucket, key) WHERE ${colName} IS NOT NULL`
        )
      );
    }
  }
}
