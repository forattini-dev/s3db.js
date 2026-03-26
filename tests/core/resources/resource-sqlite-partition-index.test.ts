import path from 'path';
import { rm } from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Database } from '../../../src/database.class.js';
import { isNodeSqliteAvailable } from '../../../src/clients/sqlite-runtime.js';
import { clearValidatorCache } from '../../../src/concerns/validator-cache.js';
import { createTemporaryPathForTest } from '#tests/config.js';

const describeIfSqlite = isNodeSqliteAvailable() ? describe : describe.skip;

describeIfSqlite('Resource SQLite partition index', () => {
  const databases: Database[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db?.isConnected()) {
        await db.disconnect();
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }

    clearValidatorCache();
  });

  async function createSqliteDatabase(scope: string): Promise<Database> {
    const tempDir = await createTemporaryPathForTest(scope);
    tempDirs.push(tempDir);

    const dbPath = path.join(tempDir, 's3db.sqlite');
    const connectionString = `sqlite://${dbPath}`;
    const database = new Database({
      connectionString,
      logLevel: 'silent',
      deferMetadataWrites: false
    });

    databases.push(database);
    await database.connect();
    return database;
  }

  it('defaults partitions to sync mode and updates references in a transaction', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-partition-index');
    const resource = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|optional',
        customer: 'string|required',
        status: 'string|required'
      },
      behavior: 'user-managed',
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        }
      }
    });

    expect(resource.config.asyncPartitions).toBe(false);

    const runInTransactionSpy = vi.spyOn(resource.client as any, 'runInTransaction');

    await resource.insert({ id: 'o1', customer: 'Ada', status: 'pending' });
    expect(runInTransactionSpy).toHaveBeenCalledTimes(1);

    const getAllKeysSpy = vi.spyOn(resource.client as any, 'getAllKeys');
    getAllKeysSpy.mockClear();
    runInTransactionSpy.mockClear();

    await resource.update('o1', { status: 'completed' });

    expect(runInTransactionSpy).toHaveBeenCalledTimes(1);
    expect(getAllKeysSpy).not.toHaveBeenCalled();

    const pending = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'pending' }
    });
    const completed = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'completed' }
    });

    expect(pending).toEqual([]);
    expect(completed).toEqual(['o1']);

    const partitionRows = ((resource.client as any).db.prepare(`
      SELECT key
      FROM partition_index
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
    `).all(
      resource.client.bucket,
      'resource=orders/partition=byStatus',
      'resource=orders/partition=byStatus\uffff'
    ) as Array<{ key: string }>).map((row) => row.key);
    const legacyRows = ((resource.client as any).db.prepare(`
      SELECT key
      FROM objects
      WHERE bucket = ? AND key >= ? AND key < ?
      ORDER BY key ASC
    `).all(
      resource.client.bucket,
      'resource=orders/partition=byStatus',
      'resource=orders/partition=byStatus\uffff'
    ) as Array<{ key: string }>).map((row) => row.key);

    expect(partitionRows).toEqual([
      'resource=orders/partition=byStatus/status=completed/id=o1'
    ]);
    expect(legacyRows).toEqual([]);

    runInTransactionSpy.mockClear();
    await resource.delete('o1');
    expect(runInTransactionSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit asyncPartitions=true when requested', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-partition-index-explicit-async');
    const resource = await database.createResource({
      name: 'events',
      attributes: {
        id: 'string|optional',
        title: 'string|required',
        status: 'string|required'
      },
      behavior: 'user-managed',
      asyncPartitions: true,
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        }
      }
    });

    expect(resource.config.asyncPartitions).toBe(true);
  });

  it('batches insertMany and deleteMany inside a single sqlite transaction', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-partition-index-bulk');
    const resource = await database.createResource({
      name: 'memberships',
      attributes: {
        id: 'string|optional',
        accountId: 'string|required',
        status: 'string|required'
      },
      behavior: 'user-managed',
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        }
      }
    });

    const runInTransactionSpy = vi.spyOn(resource.client as any, 'runInTransaction');

    const inserted = await resource.insertMany([
      { id: 'm1', accountId: 'a1', status: 'active' },
      { id: 'm2', accountId: 'a2', status: 'active' },
      { id: 'm3', accountId: 'a3', status: 'inactive' }
    ]);

    expect(runInTransactionSpy).toHaveBeenCalledTimes(1);
    expect(inserted.map((item) => item.id)).toEqual(['m1', 'm2', 'm3']);

    const activeIds = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'active' }
    });
    expect(activeIds).toEqual(['m1', 'm2']);

    runInTransactionSpy.mockClear();

    const deleted = await resource.deleteMany(['m1', 'm2', 'm3']);
    expect(runInTransactionSpy).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual({ deleted: 3, errors: 0 });

    const remainingActiveIds = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'active' }
    });
    const remainingInactiveIds = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'inactive' }
    });

    expect(remainingActiveIds).toEqual([]);
    expect(remainingInactiveIds).toEqual([]);
  });
});
