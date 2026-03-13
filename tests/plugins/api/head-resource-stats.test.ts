import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

async function waitForServer(port: number, maxAttempts = 100): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) return;
    } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server on port ${port} did not become ready in time`);
}

describe('HEAD /resource - enriched stats headers', () => {
  let db: any;
  let apiPlugin: ApiPlugin | null = null;
  let port: number;

  beforeEach(async () => {
    port = 6400 + Math.floor(Math.random() * 1000);
    db = createMemoryDatabaseForTest(`api-head-stats-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
      logLevel: 'silent'
    });
    await db.connect();
  });

  afterEach(async () => {
    if (apiPlugin) {
      await apiPlugin.stop();
      apiPlugin = null;
    }
    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  it('returns total count, total pages, page size, schema fields, version, and allowed methods', async () => {
    const resource = await db.createResource({
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'number',
        category: 'string'
      }
    });

    for (let i = 0; i < 25; i++) {
      await resource.insert({ name: `Product ${i}`, price: i * 10, category: i % 2 === 0 ? 'A' : 'B' });
    }

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['products']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const res = await fetch(`http://127.0.0.1:${port}/products`, { method: 'HEAD' });
    expect(res.status).toBe(200);

    expect(res.headers.get('X-Total-Count')).toBe('25');
    expect(res.headers.get('X-Total-Pages')).toBe('1');
    expect(res.headers.get('X-Page-Size')).toBe('100');
    expect(res.headers.get('X-Resource-Version')).toBeTruthy();
    expect(res.headers.get('X-Schema-Fields')).toBe('3');
    expect(res.headers.get('X-Allowed-Methods')).toContain('GET');
    expect(res.headers.get('X-Allowed-Methods')).toContain('HEAD');
  });

  it('calculates total pages based on custom limit query param', async () => {
    const resource = await db.createResource({
      name: 'items',
      attributes: { name: 'string|required' }
    });

    for (let i = 0; i < 25; i++) {
      await resource.insert({ name: `Item ${i}` });
    }

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['items']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const res = await fetch(`http://127.0.0.1:${port}/items?limit=10`, { method: 'HEAD' });
    expect(res.status).toBe(200);

    expect(res.headers.get('X-Total-Count')).toBe('25');
    expect(res.headers.get('X-Total-Pages')).toBe('3');
    expect(res.headers.get('X-Page-Size')).toBe('10');
  });

  it('returns X-Partitions header when resource has partitions', async () => {
    const resource = await db.createResource({
      name: 'orders',
      attributes: {
        status: 'string|required',
        amount: 'number'
      },
      partitions: {
        'by-status': { fields: { status: 'string' } }
      }
    });

    await resource.insert({ status: 'pending', amount: 100 });

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['orders']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const res = await fetch(`http://127.0.0.1:${port}/orders`, { method: 'HEAD' });
    expect(res.status).toBe(200);

    expect(res.headers.get('X-Partitions')).toBe('by-status');
  });

  it('does not include X-Partitions header when no partitions exist', async () => {
    await db.createResource({
      name: 'logs',
      attributes: { message: 'string' }
    });

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['logs']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const res = await fetch(`http://127.0.0.1:${port}/logs`, { method: 'HEAD' });
    expect(res.status).toBe(200);

    expect(res.headers.get('X-Partitions')).toBeNull();
  });

  it('returns zero counts for empty resource', async () => {
    await db.createResource({
      name: 'empty',
      attributes: { value: 'string' }
    });

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['empty']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const res = await fetch(`http://127.0.0.1:${port}/empty`, { method: 'HEAD' });
    expect(res.status).toBe(200);

    expect(res.headers.get('X-Total-Count')).toBe('0');
    expect(res.headers.get('X-Total-Pages')).toBe('0');
  });
});
