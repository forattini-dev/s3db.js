import path from 'path';
import { rm } from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Database } from '../../../src/database.class.js';
import { isNodeSqliteAvailable } from '../../../src/clients/sqlite-runtime.js';
import { clearValidatorCache } from '../../../src/concerns/validator-cache.js';
import { createTemporaryPathForTest } from '#tests/config.js';

const describeIfSqlite = isNodeSqliteAvailable() ? describe : describe.skip;

describeIfSqlite('Resource SQLite bulk reads', () => {
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

  it('uses bulk reads for list() and getMany() while preserving afterGet hooks', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-bulk-list');
    const resource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        status: 'string|required'
      },
      behavior: 'user-managed'
    });

    await resource.insert({ id: 'u1', name: 'Ada', status: 'active' });
    await resource.insert({ id: 'u2', name: 'Grace', status: 'active' });
    await resource.insert({ id: 'u3', name: 'Linus', status: 'pending' });

    const afterGet = vi.fn((data) => data);
    resource.addHook('afterGet', afterGet);

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const bulkSpy = vi.spyOn(resource.client as any, 'getObjects');
    const singleSpy = vi.spyOn(resource.client as any, 'getObject');

    const listed = await resource.list({ limit: 3 });

    expect(listed.map((item) => item.id)).toEqual(['u1', 'u2', 'u3']);
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(bulkSpy).not.toHaveBeenCalled();
    expect(singleSpy).not.toHaveBeenCalled();
    expect(afterGet).toHaveBeenCalledTimes(3);

    filteredPageSpy.mockClear();
    bulkSpy.mockClear();
    singleSpy.mockClear();
    afterGet.mockClear();

    const many = await resource.getMany(['u3', 'u1']);

    expect(many.map((item) => item.id)).toEqual(['u3', 'u1']);
    expect(filteredPageSpy).not.toHaveBeenCalled();
    expect(bulkSpy).toHaveBeenCalledTimes(1);
    expect(singleSpy).not.toHaveBeenCalled();
    expect(afterGet).toHaveBeenCalledTimes(2);
  });

  it('uses bulk reads for getAll() on sqlite resources', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-get-all-bulk');
    const resource = await database.createResource({
      name: 'logs',
      attributes: {
        id: 'string|optional',
        level: 'string|required',
        message: 'string|required'
      },
      behavior: 'user-managed'
    });

    await resource.insertMany(Array.from({ length: 120 }, (_value, index) => ({
      id: `l${String(index + 1).padStart(3, '0')}`,
      level: index % 2 === 0 ? 'info' : 'warn',
      message: `log-${index + 1}`
    })));

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const bulkSpy = vi.spyOn(resource.client as any, 'getObjects');
    const getKeysPageSpy = vi.spyOn(resource.client as any, 'getKeysPage');
    const singleSpy = vi.spyOn(resource.client as any, 'getObject');

    const results = await resource.getAll();

    expect(results).toHaveLength(120);
    expect(results[0]?.id).toBe('l001');
    expect(results.at(-1)?.id).toBe('l120');
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(bulkSpy).not.toHaveBeenCalled();
    expect(getKeysPageSpy).not.toHaveBeenCalled();
    expect(singleSpy).not.toHaveBeenCalled();
  });

  it('uses bulk reads for partition-backed query() on sqlite resources', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-bulk-query');
    const resource = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|optional',
        customer: 'string|required',
        status: 'string|required'
      },
      behavior: 'user-managed',
      asyncPartitions: false,
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        }
      }
    });

    await resource.insert({ id: 'o1', customer: 'Ada', status: 'pending' });
    await resource.insert({ id: 'o2', customer: 'Grace', status: 'pending' });
    await resource.insert({ id: 'o3', customer: 'Linus', status: 'completed' });

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const bulkSpy = vi.spyOn(resource.client as any, 'getObjects');
    const singleSpy = vi.spyOn(resource.client as any, 'getObject');

    const pending = await resource.query({ status: 'pending' }, { limit: 10 });

    expect(pending.map((item) => item.id)).toEqual(['o1', 'o2']);
    expect(pending.every((item) => item.status === 'pending')).toBe(true);
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(bulkSpy).not.toHaveBeenCalled();
    expect(singleSpy).not.toHaveBeenCalled();
  });

  it('short-circuits fully partition-covered query() to a single sqlite page fetch', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-query-covered-filter');
    const resource = await database.createResource({
      name: 'jobs',
      attributes: {
        id: 'string|optional',
        worker: 'string|required',
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

    await resource.insertMany(Array.from({ length: 80 }, (_value, index) => ({
      id: `j${String(index + 1).padStart(3, '0')}`,
      worker: `worker-${index + 1}`,
      status: 'pending'
    })));

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const getKeysPageSpy = vi.spyOn(resource.client as any, 'getKeysPage');

    const pending = await resource.query({ status: 'pending' }, { limit: 80 });

    expect(pending).toHaveLength(80);
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(filteredPageSpy).toHaveBeenCalledWith({
      prefix: 'resource=jobs/partition=byStatus/status=pending',
      offset: 0,
      amount: 80,
      filters: []
    });
    expect(getKeysPageSpy).not.toHaveBeenCalled();
  });

  it('enriches explicit partitionValues from filter to narrow sqlite partition scans', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-query-enriched-partition');
    const resource = await database.createResource({
      name: 'deliveries',
      attributes: {
        id: 'string|optional',
        customer: 'string|required',
        region: 'string|required',
        status: 'string|required'
      },
      behavior: 'user-managed',
      partitions: {
        byRegionStatus: {
          fields: {
            region: 'string',
            status: 'string'
          }
        }
      }
    });

    const records = [
      ...Array.from({ length: 60 }, (_value, index) => ({
        id: `u${String(index + 1).padStart(3, '0')}`,
        customer: `us-${index + 1}`,
        region: 'us',
        status: 'pending'
      })),
      ...Array.from({ length: 30 }, (_value, index) => ({
        id: `e${String(index + 1).padStart(3, '0')}`,
        customer: `eu-${index + 1}`,
        region: 'eu',
        status: 'pending'
      })),
      ...Array.from({ length: 10 }, (_value, index) => ({
        id: `c${String(index + 1).padStart(3, '0')}`,
        customer: `closed-${index + 1}`,
        region: 'us',
        status: 'completed'
      }))
    ];

    await resource.insertMany(records);

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const getKeysPageSpy = vi.spyOn(resource.client as any, 'getKeysPage');

    const pendingUs = await resource.query(
      { region: 'us', status: 'pending' },
      {
        partition: 'byRegionStatus',
        partitionValues: { status: 'pending' },
        limit: 60
      }
    );

    expect(pendingUs).toHaveLength(60);
    expect(pendingUs.every((item) => item.region === 'us' && item.status === 'pending')).toBe(true);
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(filteredPageSpy).toHaveBeenCalledWith({
      prefix: 'resource=deliveries/partition=byRegionStatus/region=us/status=pending',
      offset: 0,
      amount: 60,
      filters: []
    });
    expect(getKeysPageSpy).not.toHaveBeenCalled();
  });

  it('pushes residual partition filters into sqlite without iterative key paging', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-query-residual-pushdown');
    const resource = await database.createResource({
      name: 'tickets',
      attributes: {
        id: 'string|optional',
        owner: 'string|required',
        priority: 'string|required',
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

    await resource.insertMany([
      { id: 't1', owner: 'Ada', priority: 'high', status: 'pending' },
      { id: 't2', owner: 'Grace', priority: 'low', status: 'pending' },
      { id: 't3', owner: 'Ada', priority: 'low', status: 'completed' },
      { id: 't4', owner: 'Ada', priority: 'high', status: 'pending' }
    ]);

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const getKeysPageSpy = vi.spyOn(resource.client as any, 'getKeysPage');

    const results = await resource.query({ status: 'pending', owner: 'Ada' }, { limit: 10 });

    expect(results.map((item) => item.id)).toEqual(['t1', 't4']);
    expect(results.every((item) => item.status === 'pending' && item.owner === 'Ada')).toBe(true);
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(getKeysPageSpy).not.toHaveBeenCalled();
  });

  it('pushes main-data filters into sqlite for body-only resources', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-main-filter-pushdown');
    const resource = await database.createResource({
      name: 'profiles',
      attributes: {
        id: 'string|optional',
        email: 'string|required',
        status: 'string|required'
      },
      behavior: 'body-only'
    });

    await resource.insertMany([
      { id: 'p1', email: 'ada@example.com', status: 'active' },
      { id: 'p2', email: 'grace@example.com', status: 'inactive' },
      { id: 'p3', email: 'linus@example.com', status: 'active' }
    ]);

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const getKeysPageSpy = vi.spyOn(resource.client as any, 'getKeysPage');

    const results = await resource.query({ status: 'active' }, { limit: 10 });

    expect(results.map((item) => item.id)).toEqual(['p1', 'p3']);
    expect(results.every((item) => item.status === 'active')).toBe(true);
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(getKeysPageSpy).not.toHaveBeenCalled();
  });

  it('uses sqlite object-page fetch for page-number pagination', async () => {
    const database = await createSqliteDatabase('s3db-sqlite-page-number-prefetch');
    const resource = await database.createResource({
      name: 'reports',
      attributes: {
        id: 'string|optional',
        name: 'string|required'
      },
      behavior: 'user-managed'
    });

    await resource.insertMany(Array.from({ length: 12 }, (_value, index) => ({
      id: `r${String(index + 1).padStart(2, '0')}`,
      name: `Report ${index + 1}`
    })));

    const filteredPageSpy = vi.spyOn(resource.client as any, 'getFilteredObjectsPage');
    const listObjectsSpy = vi.spyOn(resource.client as any, 'listObjects');
    const continuationSpy = vi.spyOn(resource.client as any, 'getContinuationTokenAfterOffset');

    const page = await resource.page({ size: 5, page: 2, skipCount: true });

    expect(page.page).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual(['r06', 'r07', 'r08', 'r09', 'r10']);
    expect(page.hasMore).toBe(true);
    expect(typeof page.nextCursor).toBe('string');
    expect(filteredPageSpy).toHaveBeenCalledTimes(1);
    expect(filteredPageSpy).toHaveBeenCalledWith({
      prefix: 'resource=reports/data',
      offset: 5,
      amount: 6,
      filters: []
    });
    expect(continuationSpy).toHaveBeenCalledTimes(1);
    expect(continuationSpy).toHaveBeenCalledWith({
      prefix: 'resource=reports/data',
      offset: 9
    });
    expect(listObjectsSpy).not.toHaveBeenCalled();
  });
});
