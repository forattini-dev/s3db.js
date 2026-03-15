import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'recker';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

function randomPort() {
  return 7400 + Math.floor(Math.random() * 2000);
}

async function waitForServer(port: number, maxAttempts = 200): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) return;
    } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server on port ${port} did not become ready in time`);
}

describe('API Plugin — 5 CRUD requests via recker', () => {
  let db: any;
  let apiPlugin: ApiPlugin | null = null;
  let port: number;
  let client: InstanceType<typeof Client>;

  beforeEach(async () => {
    port = randomPort();
    db = createMemoryDatabaseForTest(`api-crud-recker-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
      logLevel: 'silent'
    });
    await db.connect();

    await db.createResource({
      name: 'tasks',
      attributes: {
        title: 'string|required',
        status: 'string',
        priority: 'number'
      }
    });

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['tasks']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    client = new Client({ baseUrl: `http://127.0.0.1:${port}` });
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

  it('performs 5 HTTP requests (insert x3, list, get) via recker and all succeed', async () => {
    // Request 1: Insert first record
    const res1 = await client.post('/tasks', {
      body: JSON.stringify({ title: 'Task 1', status: 'pending', priority: 1 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.data.title).toBe('Task 1');
    const id1 = body1.data.id;

    // Request 2: Insert second record
    const res2 = await client.post('/tasks', {
      body: JSON.stringify({ title: 'Task 2', status: 'active', priority: 2 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.data.title).toBe('Task 2');

    // Request 3: Insert third record
    const res3 = await client.post('/tasks', {
      body: JSON.stringify({ title: 'Task 3', status: 'done', priority: 3 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res3.status).toBe(201);
    const body3 = await res3.json();
    expect(body3.success).toBe(true);
    expect(body3.data.title).toBe('Task 3');

    // Request 4: List all records
    const res4 = await client.get('/tasks');
    expect(res4.status).toBe(200);
    const body4 = await res4.json();
    expect(body4.success).toBe(true);
    expect(body4.data.length).toBe(3);

    // Request 5: Get single record by id
    const res5 = await client.get(`/tasks/${id1}`);
    expect(res5.status).toBe(200);
    const body5 = await res5.json();
    expect(body5.success).toBe(true);
    expect(body5.data.id).toBe(id1);
    expect(body5.data.title).toBe('Task 1');
  });
});
