import path from 'path';
import { rm } from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { Database } from '../../../src/database.class.js';
import { VectorPlugin } from '../../../src/plugins/vector.plugin.js';
import { isNodeSqliteAvailable } from '../../../src/clients/sqlite-runtime.js';
import { clearValidatorCache } from '../../../src/concerns/validator-cache.js';
import { createTemporaryPathForTest } from '#tests/config.js';

const describeIfSqlite = isNodeSqliteAvailable() ? describe : describe.skip;

describeIfSqlite('VectorPlugin + SqliteClient integration', () => {
  const databases: Database[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db?.isConnected()) await db.disconnect().catch(() => {});
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    clearValidatorCache();
  });

  async function createDb(scope: string, pluginOptions = {}): Promise<Database> {
    const tempDir = await createTemporaryPathForTest(scope);
    tempDirs.push(tempDir);
    const dbPath = path.join(tempDir, 's3db.sqlite');
    const db = new Database({
      connectionString: `sqlite://${dbPath}`,
      logLevel: 'silent',
      deferMetadataWrites: false,
      plugins: [new VectorPlugin({ dimensions: 4, logLevel: 'silent', ...pluginOptions })]
    });
    databases.push(db);
    await db.connect();
    return db;
  }

  it('installs vector search methods on a resource with embedding field', async () => {
    const db = await createDb('vec-install');
    const resource = await db.createResource({
      name: 'items',
      attributes: {
        label: 'string',
        vec: 'embedding:4'
      },
      behavior: 'body-overflow'
    });

    expect(typeof (resource as any).similarTo).toBe('function');
    expect(typeof (resource as any).findSimilar).toBe('function');
    expect(typeof (resource as any).cluster).toBe('function');
    expect(typeof (resource as any).vectorDistance).toBe('function');
  });

  it('installs vector methods on all resources and returns empty results for non-embedding resources', async () => {
    const db = await createDb('vec-no-field');
    const resource = await db.createResource({
      name: 'plain',
      attributes: { label: 'string' }
    });

    // VectorPlugin installs methods on ALL resources (not just embedding ones)
    expect(typeof (resource as any).similarTo).toBe('function');
    expect(typeof (resource as any).findSimilar).toBe('function');

    // Searching a resource with no vectors returns empty
    const results = await (resource as any).similarTo([1, 0, 0, 0], { limit: 10 });
    expect(results).toEqual([]);
  });

  it('inserts records with vectors and retrieves them', async () => {
    const db = await createDb('vec-insert');
    const resource = await db.createResource({
      name: 'docs',
      attributes: { title: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    const a = await resource.insert({ title: 'alpha', vec: [1, 0, 0, 0] });
    const b = await resource.insert({ title: 'beta',  vec: [0, 1, 0, 0] });

    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();

    const fetched = await resource.get(a.id);
    expect(fetched.title).toBe('alpha');
    expect(Array.isArray(fetched.vec)).toBe(true);
    expect(fetched.vec).toHaveLength(4);
  });

  it('similarTo (JS brute-force fallback) returns nearest neighbours sorted by distance', async () => {
    const db = await createDb('vec-search');
    const resource = await db.createResource({
      name: 'vecs',
      attributes: { label: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    await resource.insert({ label: 'close',  vec: [1, 0.1, 0, 0] });
    await resource.insert({ label: 'medium', vec: [0.5, 0.5, 0, 0] });
    await resource.insert({ label: 'far',    vec: [0, 0, 1, 0] });

    // similarTo returns VectorSearchResult[] (plain array), not {results, stats}
    const results = await (resource as any).similarTo([1, 0, 0, 0], { limit: 3 });

    expect(results).toHaveLength(3);
    expect(results[0].record.label).toBe('close');
    expect(results[0].distance).toBeLessThan(results[1].distance);
    expect(results[1].distance).toBeLessThan(results[2].distance);
  });

  it('similarTo respects limit option', async () => {
    const db = await createDb('vec-limit');
    const resource = await db.createResource({
      name: 'limited',
      attributes: { n: 'number', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    for (let i = 0; i < 6; i++) {
      await resource.insert({ n: i, vec: [i * 0.1, 0, 0, 0] });
    }

    const results = await (resource as any).similarTo([0, 0, 0, 0], { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('similarTo respects distance threshold', async () => {
    const db = await createDb('vec-threshold');
    const resource = await db.createResource({
      name: 'thresh',
      attributes: { label: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    await resource.insert({ label: 'near', vec: [1, 0, 0, 0] });
    await resource.insert({ label: 'far',  vec: [0, 0, 0, 1] });

    const results = await (resource as any).similarTo([1, 0, 0, 0], {
      limit: 10,
      threshold: 0.1,
      distanceMetric: 'cosine'
    });

    const labels = results.map((r: any) => r.record.label);
    expect(labels).toContain('near');
    expect(labels).not.toContain('far');
  });

  it('similarTo works across euclidean, cosine and manhattan metrics', async () => {
    const db = await createDb('vec-metrics');
    const resource = await db.createResource({
      name: 'metrics',
      attributes: { label: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    await resource.insert({ label: 'a', vec: [1, 0, 0, 0] });
    await resource.insert({ label: 'b', vec: [0, 1, 0, 0] });

    for (const metric of ['cosine', 'euclidean', 'manhattan'] as const) {
      const result = await (resource as any).similarTo([1, 0, 0, 0], {
        limit: 2,
        distanceMetric: metric
      });
      expect(result).toHaveLength(2);
      expect(result[0].record.label).toBe('a');
    }
  });

  it('_setupSqliteVec runs without throwing even when sqlite-vec is absent', async () => {
    // sqlite-vec is not installed in the test environment — _setupSqliteVec must
    // call tryLoadSqliteVec(), get false, and return without registering hooks.
    const db = await createDb('vec-graceful-fallback');
    const resource = await db.createResource({
      name: 'graceful',
      attributes: { label: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    const client = (resource as any).client;
    const loaded = await client.tryLoadSqliteVec();
    expect(loaded).toBe(false);
    expect(client.hasSqliteVec).toBe(false);

    // Insert + search still works via JS fallback
    await resource.insert({ label: 'ok', vec: [1, 0, 0, 0] });
    const results = await (resource as any).similarTo([1, 0, 0, 0], { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].record.label).toBe('ok');
  });

  it('vectorDistance method computes distance between two raw vectors', async () => {
    const db = await createDb('vec-distance');
    const resource = await db.createResource({
      name: 'dist',
      attributes: { label: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    // vectorDistance takes two raw number[] vectors, not record IDs
    const dist = (resource as any).vectorDistance([1, 0, 0, 0], [0, 1, 0, 0]);
    expect(typeof dist).toBe('number');
    expect(dist).toBeGreaterThan(0);

    // same vector → distance 0
    const same = (resource as any).vectorDistance([1, 0, 0, 0], [1, 0, 0, 0]);
    expect(same).toBe(0);
  });

  it('update keeps vector searchable after mutation', async () => {
    const db = await createDb('vec-update');
    const resource = await db.createResource({
      name: 'updatable',
      attributes: { label: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    const rec = await resource.insert({ label: 'original', vec: [1, 0, 0, 0] });
    await resource.update(rec.id, { label: 'updated', vec: [0, 0, 0, 1] });

    const results = await (resource as any).similarTo([0, 0, 0, 1], { limit: 1 });
    expect(results[0].record.label).toBe('updated');
  });

  it('delete removes record from search results', async () => {
    const db = await createDb('vec-delete');
    const resource = await db.createResource({
      name: 'deletable',
      attributes: { label: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    const a = await resource.insert({ label: 'keep', vec: [1, 0, 0, 0] });
    const b = await resource.insert({ label: 'remove', vec: [1, 0.01, 0, 0] });

    await resource.delete(b.id);

    const results = await (resource as any).similarTo([1, 0, 0, 0], { limit: 10 });
    const labels = results.map((r: any) => r.record.label);
    expect(labels).toContain('keep');
    expect(labels).not.toContain('remove');
  });

  it('cluster method groups records by vector similarity', async () => {
    const db = await createDb('vec-cluster');
    const resource = await db.createResource({
      name: 'clusterable',
      attributes: { group: 'string', vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    // Group A: near [1,0,0,0]
    await resource.insert({ group: 'A', vec: [1, 0.1, 0, 0] });
    await resource.insert({ group: 'A', vec: [0.9, 0.1, 0, 0] });
    // Group B: near [0,0,1,0]
    await resource.insert({ group: 'B', vec: [0, 0, 1, 0.1] });
    await resource.insert({ group: 'B', vec: [0, 0, 0.9, 0.1] });

    const result = await (resource as any).cluster({ k: 2 });
    expect(result.clusters).toHaveLength(2);
    expect(result.centroids).toHaveLength(2);
    const totalItems = result.clusters.reduce((s: number, c: any[]) => s + c.length, 0);
    expect(totalItems).toBe(4);
  });

  it('vectorSearchPaged returns stats with every call', async () => {
    const db = await createDb('vec-stats');
    const resource = await db.createResource({
      name: 'stats',
      attributes: { vec: 'embedding:4' },
      behavior: 'body-overflow'
    });

    await resource.insert({ vec: [1, 0, 0, 0] });

    // vectorSearchPaged (not similarTo) returns {results, stats}
    const result = await (resource as any).vectorSearchPaged([1, 0, 0, 0], { limit: 1 });
    expect(result.results).toBeDefined();
    expect(result.stats).toBeDefined();
    expect(typeof result.stats.durationMs).toBe('number');
    expect(typeof result.stats.scannedRecords).toBe('number');
    expect(typeof result.stats.processedRecords).toBe('number');
  });
});
