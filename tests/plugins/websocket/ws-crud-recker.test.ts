import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, RaffelClient } from 'recker';
import { WebSocketPlugin } from '../../../src/plugins/websocket/index.js';
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
  throw new Error(`Server on port ${port} did not become ready in time`);
}

describe('WebSocket Plugin — RaffelClient raw mode + recker HTTP', () => {
  let db: any;
  let wsPlugin: WebSocketPlugin | null = null;
  let apiPlugin: ApiPlugin | null = null;
  let wsPort: number;
  let apiPort: number;
  let rc: RaffelClient | null = null;
  let client: InstanceType<typeof Client>;

  beforeEach(async () => {
    wsPort = randomPort();
    apiPort = wsPort + 1;

    db = createMemoryDatabaseForTest(`ws-crud-recker-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
      logLevel: 'silent'
    });
    await db.connect();

    await db.createResource({
      name: 'items',
      attributes: {
        name: 'string|required',
        category: 'string',
        price: 'number'
      }
    });

    wsPlugin = new WebSocketPlugin({
      port: wsPort,
      host: '127.0.0.1',
      startupBanner: false,
      logLevel: 'silent',
      resources: { items: {} }
    });
    await db.usePlugin(wsPlugin, 'ws-test');

    apiPlugin = new ApiPlugin({
      port: apiPort,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['items']
    });
    await db.usePlugin(apiPlugin, 'api-test');

    await waitForServer(apiPort);
    await waitForServer(wsPort);

    client = new Client({ baseUrl: `http://127.0.0.1:${apiPort}` });
  });

  afterEach(async () => {
    if (rc) { rc.close(); rc = null; }
    if (apiPlugin) { await apiPlugin.stop(); apiPlugin = null; }
    if (wsPlugin) { await wsPlugin.onStop(); wsPlugin = null; }
    if (db) { await db.disconnect(); db = null; }
  });

  it('connects with RaffelClient raw mode, makes 5 HTTP requests via recker, verifies WS reads', async () => {
    rc = new RaffelClient(`ws://127.0.0.1:${wsPort}`, { mode: 'raw', ws: { reconnect: false } });
    await rc.connect();

    // Server sends { type: 'connected' } on connection
    const connected = await rc.waitFor((msg: any) => msg.type === 'connected');
    expect(connected.clientId).toBeTruthy();

    // Subscribe to items resource via raw WS message
    rc.sendRaw({ type: 'subscribe', resource: 'items' });
    const subResult = await rc.waitFor((msg: any) => msg.type === 'subscribed');
    expect(subResult.resource).toBe('items');

    // 5 HTTP requests via recker
    const res1 = await client.post('/items', {
      body: JSON.stringify({ name: 'Item A', category: 'electronics', price: 100 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.data.name).toBe('Item A');

    const res2 = await client.post('/items', {
      body: JSON.stringify({ name: 'Item B', category: 'books', price: 25 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res2.status).toBe(201);

    const res3 = await client.post('/items', {
      body: JSON.stringify({ name: 'Item C', category: 'clothing', price: 50 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res3.status).toBe(201);

    const res4 = await client.get('/items');
    expect(res4.status).toBe(200);
    const listBody = await res4.json();
    expect(listBody.data.length).toBe(3);

    const res5 = await client.get(`/items/${body1.data.id}`);
    expect(res5.status).toBe(200);
    const getBody = await res5.json();
    expect(getBody.data.name).toBe('Item A');

    // Verify data is also accessible via WS
    rc.sendRaw({ type: 'list', resource: 'items', requestId: 'ws-list-1' });
    const wsListResult = await rc.waitFor((msg: any) => msg.requestId === 'ws-list-1');
    expect(wsListResult.type).toBe('data');
    expect(wsListResult.data.length).toBe(3);
  });

  it('performs 5 CRUD operations over WS via RaffelClient raw mode', async () => {
    rc = new RaffelClient(`ws://127.0.0.1:${wsPort}`, { mode: 'raw', ws: { reconnect: false } });
    await rc.connect();

    await rc.waitFor((msg: any) => msg.type === 'connected');

    // WS Request 1: Insert
    rc.sendRaw({ type: 'insert', requestId: 'req-1', resource: 'items', data: { name: 'WS Item 1', category: 'tools', price: 75 } });
    const inserted1 = await rc.waitFor((msg: any) => msg.requestId === 'req-1');
    expect(inserted1.type).toBe('inserted');
    expect(inserted1.data.name).toBe('WS Item 1');
    const wsId1 = inserted1.data.id;

    // WS Request 2: Insert
    rc.sendRaw({ type: 'insert', requestId: 'req-2', resource: 'items', data: { name: 'WS Item 2', category: 'food', price: 15 } });
    const inserted2 = await rc.waitFor((msg: any) => msg.requestId === 'req-2');
    expect(inserted2.type).toBe('inserted');

    // WS Request 3: Get by ID
    rc.sendRaw({ type: 'get', requestId: 'req-3', resource: 'items', id: wsId1 });
    const getResult = await rc.waitFor((msg: any) => msg.requestId === 'req-3');
    expect(getResult.type).toBe('data');
    expect(getResult.data.name).toBe('WS Item 1');

    // WS Request 4: List
    rc.sendRaw({ type: 'list', requestId: 'req-4', resource: 'items' });
    const listResult = await rc.waitFor((msg: any) => msg.requestId === 'req-4');
    expect(listResult.type).toBe('data');
    expect(listResult.data.length).toBe(2);

    // WS Request 5: Delete
    rc.sendRaw({ type: 'delete', requestId: 'req-5', resource: 'items', id: wsId1 });
    const deleteResult = await rc.waitFor((msg: any) => msg.requestId === 'req-5');
    expect(deleteResult.type).toBe('deleted');
    expect(deleteResult.id).toBe(wsId1);

    // Verify via recker HTTP
    const httpRes = await client.get('/items');
    const httpBody = await httpRes.json();
    expect(httpBody.data.length).toBe(1);
    expect(httpBody.data[0].name).toBe('WS Item 2');
  });
});
