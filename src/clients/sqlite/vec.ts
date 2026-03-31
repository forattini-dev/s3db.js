import { tryFn } from '../../concerns/try-fn.js';
import { SqliteClientQuery } from './query.js';

export class SqliteClientVec extends SqliteClientQuery {
  /**
   * Attempts to dynamically load the sqlite-vec extension and bind it to this database connection.
   * Idempotent — subsequent calls return the cached result without re-loading.
   * Returns true if sqlite-vec is available and loaded, false otherwise.
   */
  async tryLoadSqliteVec(): Promise<boolean> {
    if (this._sqliteVecLoaded) return this._sqliteVecEnabled;
    this._sqliteVecLoaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — sqlite-vec is an optional peer dependency
      const mod = await import('sqlite-vec');
      (mod as unknown as { load: (db: unknown) => void }).load(this.db);
      this._sqliteVecEnabled = true;
    } catch {
      this._sqliteVecEnabled = false;
    }
    return this._sqliteVecEnabled;
  }

  get hasSqliteVec(): boolean {
    return this._sqliteVecEnabled;
  }

  /**
   * Creates a vec0 virtual table for storing vectors associated with a resource field.
   * Idempotent — does nothing if the table already exists.
   */
  ensureVecTable(tableName: string, dims: number): void {
    if (this._vecTables.has(tableName)) return;
    tryFn(() =>
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS "${tableName}" USING vec0(embedding FLOAT[${dims}])`
      )
    );
    this._vecTables.add(tableName);
  }

  /**
   * Inserts or replaces a vector for a given integer rowId in the specified vec0 table.
   */
  vecUpsert(tableName: string, rowId: number, vector: Float32Array): void {
    this._prepareCached(`INSERT OR REPLACE INTO "${tableName}"(rowid, embedding) VALUES (?, ?)`)
      .run(rowId, vector);
  }

  /**
   * Removes the vector entry for a given rowId from the vec0 table.
   */
  vecDelete(tableName: string, rowId: number): void {
    tryFn(() =>
      this._prepareCached(`DELETE FROM "${tableName}" WHERE rowid = ?`).run(rowId)
    );
  }

  /**
   * Performs a K-nearest-neighbour search in a vec0 table and returns the top-k results
   * sorted by ascending distance.
   */
  vecSearch(
    tableName: string,
    queryVector: Float32Array,
    k: number
  ): Array<{ rowId: number; distance: number }> {
    const rows = this._prepareCached(
      `SELECT rowid, distance FROM "${tableName}" WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
    ).all(queryVector, k) as Array<{ rowid: number; distance: number }>;
    return rows.map((r) => ({ rowId: Number(r.rowid), distance: r.distance }));
  }

  /**
   * Returns the string record key for a given integer rowId in the objects table.
   * The key prefix is stripped before returning.
   */
  getObjectKeyByRowId(rowId: number): string | null {
    const row = this._prepareCached('SELECT key FROM objects WHERE rowid = ?').get(
      rowId
    ) as { key: string } | undefined;
    return row ? this._stripKeyPrefix(row.key) : null;
  }

  /**
   * Returns the implicit integer rowId of the objects row for a given resource record.
   * Used to correlate between the objects table and vec0 virtual tables.
   */
  getRecordRowId(resourceName: string, recordId: string): number | null {
    const fullKey = this._applyKeyPrefix(`resource=${resourceName}/data/id=${recordId}`);
    const row = this._prepareCached(
      'SELECT rowid FROM objects WHERE bucket = ? AND key = ?'
    ).get(this.bucket, fullKey) as { rowid: number } | undefined;
    return row?.rowid ?? null;
  }
}
