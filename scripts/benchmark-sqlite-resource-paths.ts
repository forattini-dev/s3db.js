import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { Database } from '../src/database.class.js';
import { isNodeSqliteAvailable } from '../src/clients/sqlite-runtime.js';

const RECORDS = Number.parseInt(process.env.S3DB_SQLITE_BENCH_RECORDS || '2000', 10);
const ITERATIONS = Number.parseInt(process.env.S3DB_SQLITE_BENCH_ITERATIONS || '5', 10);
const PAGE_SIZE = Number.parseInt(process.env.S3DB_SQLITE_BENCH_PAGE_SIZE || '100', 10);
const WRITE_BATCH = Number.parseInt(process.env.S3DB_SQLITE_BENCH_WRITE_BATCH || '500', 10);
const JSON_OUTPUT = process.argv.includes('--json');
const SHOULD_ASSERT = process.argv.includes('--assert') || process.env.S3DB_SQLITE_BENCH_ASSERT === 'true';

type BudgetContext = {
  records: number;
  pageSize: number;
  writeBatch: number;
};

type BudgetFactory = (context: BudgetContext) => number;

const DEFAULT_P95_BUDGETS: Record<string, BudgetFactory> = {
  'list:first-page': ({ pageSize }) => 40 + (pageSize * 0.5),
  'getAll': ({ records }) => 40 + (records * 0.35),
  'query:partition-covered': ({ pageSize }) => 40 + (pageSize * 0.4),
  'query:partition-residual': ({ pageSize }) => 30 + (pageSize * 0.2),
  'query:body-only-filter': ({ pageSize }) => 50 + (pageSize * 0.6),
  'page:number': ({ pageSize }) => 45 + (pageSize * 0.4),
  'page:cursor': ({ pageSize }) => 55 + (pageSize * 0.6),
  'insertMany:fresh-resource': ({ writeBatch }) => 80 + (writeBatch * 0.9)
};

interface MeasurementSummary {
  name: string;
  iterations: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p95BudgetMs?: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index] || 0;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function budgetEnvKey(name: string): string {
  return `S3DB_SQLITE_BENCH_BUDGET_${name.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_P95_MS`;
}

function getBudget(name: string): number | null {
  const overrideKey = budgetEnvKey(name);
  const overrideRaw = process.env[overrideKey];

  if (overrideRaw !== undefined) {
    const parsed = Number.parseFloat(overrideRaw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const factory = DEFAULT_P95_BUDGETS[name];
  if (!factory) {
    return null;
  }

  return round(factory({
    records: RECORDS,
    pageSize: PAGE_SIZE,
    writeBatch: WRITE_BATCH
  }));
}

async function measure(name: string, iterations: number, fn: () => Promise<void>): Promise<MeasurementSummary> {
  const samples: number[] = [];

  await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }

  return {
    name,
    iterations,
    avgMs: round(samples.reduce((sum, value) => sum + value, 0) / Math.max(samples.length, 1)),
    minMs: round(Math.min(...samples)),
    maxMs: round(Math.max(...samples)),
    p50Ms: round(percentile(samples, 0.5)),
    p95Ms: round(percentile(samples, 0.95)),
    ...(SHOULD_ASSERT ? { p95BudgetMs: getBudget(name) ?? undefined } : {})
  };
}

function buildUsers(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_value, index) => ({
    id: `u${String(index + 1).padStart(5, '0')}`,
    name: `User ${index + 1}`,
    status: index % 3 === 0 ? 'active' : 'pending',
    region: index % 2 === 0 ? 'us' : 'eu',
    priority: index % 5 === 0 ? 'high' : 'low'
  }));
}

function buildOrders(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_value, index) => ({
    id: `o${String(index + 1).padStart(5, '0')}`,
    owner: `owner-${index % 25}`,
    region: index % 2 === 0 ? 'us' : 'eu',
    status: index % 3 === 0 ? 'pending' : 'completed',
    total: index + 1
  }));
}

function buildProfiles(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_value, index) => ({
    id: `p${String(index + 1).padStart(5, '0')}`,
    email: `user-${index + 1}@example.com`,
    status: index % 2 === 0 ? 'active' : 'inactive'
  }));
}

function assertSummaries(summaries: MeasurementSummary[]): void {
  if (!SHOULD_ASSERT) {
    return;
  }

  const failures = summaries.flatMap((summary) => {
    if (summary.p95BudgetMs === undefined) {
      return [];
    }

    if (summary.p95Ms <= summary.p95BudgetMs) {
      return [];
    }

    return [
      `${summary.name}: p95 ${summary.p95Ms}ms > budget ${summary.p95BudgetMs}ms`
    ];
  });

  if (failures.length === 0) {
    return;
  }

  console.error('SQLite benchmark regression detected:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}

function printAssertionStatus(summaries: MeasurementSummary[]): void {
  if (!SHOULD_ASSERT) {
    return;
  }

  console.log('\nSQLite Benchmark Budgets\n');
  console.table(summaries.map((summary) => ({
    name: summary.name,
    p95Ms: summary.p95Ms,
    p95BudgetMs: summary.p95BudgetMs ?? 'n/a'
  })));
}

async function main(): Promise<void> {
  if (!isNodeSqliteAvailable()) {
    console.error('SQLite runtime is not available in this Node build.');
    process.exitCode = 0;
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 's3db-sqlite-bench-'));
  const dbPath = path.join(tempDir, 'benchmark.sqlite');
  const database = new Database({
    connectionString: `sqlite://${dbPath}`,
    logLevel: 'silent',
    deferMetadataWrites: false
  });

  try {
    await database.connect();

    const users = await database.createResource({
      name: 'bench_users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        status: 'string|required',
        region: 'string|required',
        priority: 'string|required'
      },
      behavior: 'user-managed'
    });

    const orders = await database.createResource({
      name: 'bench_orders',
      attributes: {
        id: 'string|optional',
        owner: 'string|required',
        region: 'string|required',
        status: 'string|required',
        total: 'number|required'
      },
      behavior: 'user-managed',
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        },
        byRegionStatus: {
          fields: {
            region: 'string',
            status: 'string'
          }
        }
      }
    });

    const profiles = await database.createResource({
      name: 'bench_profiles',
      attributes: {
        id: 'string|optional',
        email: 'string|required',
        status: 'string|required'
      },
      behavior: 'body-only'
    });

    await users.insertMany(buildUsers(RECORDS));
    await orders.insertMany(buildOrders(RECORDS));
    await profiles.insertMany(buildProfiles(RECORDS));

    const summaries: MeasurementSummary[] = [];

    summaries.push(await measure('list:first-page', ITERATIONS, async () => {
      const result = await users.list({ limit: PAGE_SIZE });
      if (result.length === 0) throw new Error('list:first-page returned no rows');
    }));

    summaries.push(await measure('getAll', ITERATIONS, async () => {
      const result = await users.getAll();
      if (result.length !== RECORDS) throw new Error(`getAll returned ${result.length} rows`);
    }));

    summaries.push(await measure('query:partition-covered', ITERATIONS, async () => {
      const result = await orders.query({ status: 'pending' }, { limit: PAGE_SIZE });
      if (result.length === 0) throw new Error('query:partition-covered returned no rows');
    }));

    summaries.push(await measure('query:partition-residual', ITERATIONS, async () => {
      const result = await orders.query({ status: 'pending', owner: 'owner-3' }, { limit: PAGE_SIZE });
      if (result.length === 0) throw new Error('query:partition-residual returned no rows');
    }));

    summaries.push(await measure('query:body-only-filter', ITERATIONS, async () => {
      const result = await profiles.query({ status: 'active' }, { limit: PAGE_SIZE });
      if (result.length === 0) throw new Error('query:body-only-filter returned no rows');
    }));

    summaries.push(await measure('page:number', ITERATIONS, async () => {
      const result = await users.page({ size: PAGE_SIZE, page: 2, skipCount: true });
      if (result.items.length === 0) throw new Error('page:number returned no rows');
    }));

    summaries.push(await measure('page:cursor', ITERATIONS, async () => {
      const firstPage = await users.page({ size: PAGE_SIZE, cursor: null, skipCount: true });
      if (!firstPage.nextCursor) throw new Error('page:cursor first page missing cursor');
      const secondPage = await users.page({ size: PAGE_SIZE, cursor: firstPage.nextCursor, skipCount: true });
      if (secondPage.items.length === 0) throw new Error('page:cursor second page returned no rows');
    }));

    summaries.push(await measure('insertMany:fresh-resource', ITERATIONS, async () => {
      const resourceName = `bench_write_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const writeResource = await database.createResource({
        name: resourceName,
        attributes: {
          id: 'string|optional',
          status: 'string|required',
          owner: 'string|required'
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

      const payload = Array.from({ length: WRITE_BATCH }, (_value, index) => ({
        id: `${resourceName}-${index + 1}`,
        status: index % 2 === 0 ? 'active' : 'inactive',
        owner: `owner-${index % 20}`
      }));

      const inserted = await writeResource.insertMany(payload);
      if (inserted.length !== WRITE_BATCH) {
        throw new Error(`insertMany inserted ${inserted.length}/${WRITE_BATCH}`);
      }
    }));

    const report = {
      engine: 'sqlite',
      records: RECORDS,
      iterations: ITERATIONS,
      pageSize: PAGE_SIZE,
      writeBatch: WRITE_BATCH,
      summaries
    };

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(report, null, 2));
      assertSummaries(summaries);
      return;
    }

    console.log('\nSQLite Resource Benchmark');
    console.log(`records=${RECORDS} iterations=${ITERATIONS} pageSize=${PAGE_SIZE} writeBatch=${WRITE_BATCH}\n`);
    console.table(summaries.map((summary) => ({
      name: summary.name,
      avgMs: summary.avgMs,
      p50Ms: summary.p50Ms,
      p95Ms: summary.p95Ms,
      minMs: summary.minMs,
      maxMs: summary.maxMs
    })));
    printAssertionStatus(summaries);
    assertSummaries(summaries);
  } finally {
    await database.disconnect().catch(() => {});
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
