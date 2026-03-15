import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, RaffelClient } from 'recker';
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

describe('API Plugin — RaffelClient full mode with channels + recker HTTP', () => {
  let db: any;
  let apiPlugin: ApiPlugin | null = null;
  let port: number;
  let client: InstanceType<typeof Client>;
  let raffelClients: RaffelClient[] = [];

  beforeEach(async () => {
    port = randomPort();
    db = createMemoryDatabaseForTest(`api-ws-channels-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
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
      resources: ['tasks'],
      listeners: [{
        bind: { host: '127.0.0.1', port },
        websocket: {
          enabled: true,
          channels: {
            authorize: async () => true,
            presenceData: () => ({ name: 'test-user' })
          },
          compression: false,
          onConnection: (socketId: string, send: (msg: unknown) => void) => {
            send({ type: 'welcome', socketId });
          }
        }
      }]
    } as any);

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    client = new Client({ baseUrl: `http://127.0.0.1:${port}` });
  });

  afterEach(async () => {
    raffelClients.forEach(c => c.close());
    raffelClients = [];
    if (apiPlugin) { await apiPlugin.stop(); apiPlugin = null; }
    if (db) { await db.disconnect(); db = null; }
  });

  it('RaffelClient full mode: subscribe to channel + 5 HTTP requests via recker', async () => {
    const rc = new RaffelClient(`ws://127.0.0.1:${port}`, {
      mode: 'full',
      ws: { reconnect: false }
    });
    raffelClients.push(rc);
    await rc.connect();

    // The server sends a welcome message via onConnection — it has no channel/procedure
    // so it goes to raffel:unknown. waitFor works in both modes.
    const welcome = await rc.waitFor((msg: any) => msg.type === 'welcome');
    expect(welcome.socketId).toBeTruthy();

    // Subscribe to a channel using RaffelClient's full mode subscribe()
    const subscribedPromise = new Promise<void>((resolve) => {
      rc.once('raffel:channel:subscribed', () => resolve());
    });
    rc.subscribe('tasks-feed');
    await subscribedPromise;

    // 5 HTTP requests via recker
    const res1 = await client.post('/tasks', {
      body: JSON.stringify({ title: 'Task 1', status: 'pending', priority: 1 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res1.status).toBe(201);

    const res2 = await client.post('/tasks', {
      body: JSON.stringify({ title: 'Task 2', status: 'active', priority: 2 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res2.status).toBe(201);

    const res3 = await client.post('/tasks', {
      body: JSON.stringify({ title: 'Task 3', status: 'done', priority: 3 }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res3.status).toBe(201);

    const res4 = await client.get('/tasks');
    expect(res4.status).toBe(200);
    const listBody = await res4.json();
    expect(listBody.data.length).toBe(3);

    const body1 = await res1.json();
    const res5 = await client.get(`/tasks/${body1.data.id}`);
    expect(res5.status).toBe(200);
    const getBody = await res5.json();
    expect(getBody.data.title).toBe('Task 1');
  });

  it('RaffelClient full mode: two clients pub/sub via channels + 5 HTTP requests', async () => {
    const rc1 = new RaffelClient(`ws://127.0.0.1:${port}`, { mode: 'full', ws: { reconnect: false } });
    const rc2 = new RaffelClient(`ws://127.0.0.1:${port}`, { mode: 'full', ws: { reconnect: false } });
    raffelClients.push(rc1, rc2);

    await Promise.all([rc1.connect(), rc2.connect()]);
    await Promise.all([
      rc1.waitFor((msg: any) => msg.type === 'welcome'),
      rc2.waitFor((msg: any) => msg.type === 'welcome')
    ]);

    // Both subscribe to 'chat-room' via RaffelClient API
    const sub1 = new Promise<void>(r => rc1.once('raffel:channel:subscribed', () => r()));
    const sub2 = new Promise<void>(r => rc2.once('raffel:channel:subscribed', () => r()));

    const rc2Events: any[] = [];
    rc2.on('raffel:channel:event', (channel: string, event: string, data: unknown) => {
      rc2Events.push({ channel, event, data });
    });

    const rc1Events: any[] = [];
    rc1.on('raffel:channel:event', (channel: string, event: string, data: unknown) => {
      rc1Events.push({ channel, event, data });
    });

    rc1.subscribe('chat-room');
    rc2.subscribe('chat-room');
    await Promise.all([sub1, sub2]);

    // rc1 publishes, rc2 should receive via channel event
    const rc2EventPromise = new Promise<any>((resolve) => {
      const handler = (channel: string, event: string, data: unknown) => {
        if (channel === 'chat-room' && event === 'message') {
          rc2.off('raffel:channel:event', handler);
          resolve({ channel, event, data });
        }
      };
      rc2.on('raffel:channel:event', handler);
    });

    rc1.publish('chat-room', 'message', { text: 'Hello from rc1!' });
    const received = await rc2EventPromise;
    expect(received.channel).toBe('chat-room');
    expect(received.event).toBe('message');
    expect((received.data as any).text).toBe('Hello from rc1!');

    // rc2 publishes back, rc1 receives
    const rc1EventPromise = new Promise<any>((resolve) => {
      const handler = (channel: string, event: string, data: unknown) => {
        if (channel === 'chat-room' && event === 'reply') {
          rc1.off('raffel:channel:event', handler);
          resolve({ channel, event, data });
        }
      };
      rc1.on('raffel:channel:event', handler);
    });

    rc2.publish('chat-room', 'reply', { text: 'Reply from rc2!' });
    const reply = await rc1EventPromise;
    expect((reply.data as any).text).toBe('Reply from rc2!');

    // 5 HTTP requests in parallel via recker
    const results = await Promise.all([
      client.post('/tasks', { body: JSON.stringify({ title: 'T1', status: 'a', priority: 1 }), headers: { 'Content-Type': 'application/json' } }),
      client.post('/tasks', { body: JSON.stringify({ title: 'T2', status: 'b', priority: 2 }), headers: { 'Content-Type': 'application/json' } }),
      client.post('/tasks', { body: JSON.stringify({ title: 'T3', status: 'c', priority: 3 }), headers: { 'Content-Type': 'application/json' } }),
      client.post('/tasks', { body: JSON.stringify({ title: 'T4', status: 'd', priority: 4 }), headers: { 'Content-Type': 'application/json' } }),
      client.post('/tasks', { body: JSON.stringify({ title: 'T5', status: 'e', priority: 5 }), headers: { 'Content-Type': 'application/json' } }),
    ]);

    for (const r of results) {
      expect(r.status).toBe(201);
    }

    const listRes = await client.get('/tasks');
    const listBody = await listRes.json();
    expect(listBody.data.length).toBe(5);
  });

  it('RaffelClient full mode: presence channel with member tracking + 5 HTTP requests', async () => {
    const rc1 = new RaffelClient(`ws://127.0.0.1:${port}`, { mode: 'full', ws: { reconnect: false } });
    const rc2 = new RaffelClient(`ws://127.0.0.1:${port}`, { mode: 'full', ws: { reconnect: false } });
    raffelClients.push(rc1, rc2);

    await Promise.all([rc1.connect(), rc2.connect()]);
    await Promise.all([
      rc1.waitFor((msg: any) => msg.type === 'welcome'),
      rc2.waitFor((msg: any) => msg.type === 'welcome')
    ]);

    // rc1 joins presence channel
    const sub1 = new Promise<void>(r => rc1.once('raffel:channel:subscribed', () => r()));
    rc1.subscribe('presence-lobby');
    await sub1;

    // rc2 joins — rc1 should get member_added via channel event
    const memberAddedPromise = new Promise<any>((resolve) => {
      const handler = (channel: string, event: string, data: unknown) => {
        if (channel === 'presence-lobby' && event === 'member_added') {
          rc1.off('raffel:channel:event', handler);
          resolve({ channel, event, data });
        }
      };
      rc1.on('raffel:channel:event', handler);
    });

    const sub2 = new Promise<void>(r => rc2.once('raffel:channel:subscribed', () => r()));
    rc2.subscribe('presence-lobby');
    await sub2;

    const memberAdded = await memberAddedPromise;
    expect(memberAdded.channel).toBe('presence-lobby');
    expect(memberAdded.event).toBe('member_added');

    // rc2 leaves — rc1 should get member_removed
    const memberRemovedPromise = new Promise<any>((resolve) => {
      const handler = (channel: string, event: string, data: unknown) => {
        if (channel === 'presence-lobby' && event === 'member_removed') {
          rc1.off('raffel:channel:event', handler);
          resolve({ channel, event, data });
        }
      };
      rc1.on('raffel:channel:event', handler);
    });
    rc2.unsubscribe('presence-lobby');
    const memberRemoved = await memberRemovedPromise;
    expect(memberRemoved.channel).toBe('presence-lobby');
    expect(memberRemoved.event).toBe('member_removed');

    // 5 HTTP requests via recker
    for (let i = 1; i <= 5; i++) {
      const res = await client.post('/tasks', {
        body: JSON.stringify({ title: `Task ${i}`, status: 'active', priority: i }),
        headers: { 'Content-Type': 'application/json' }
      });
      expect(res.status).toBe(201);
    }

    const listRes = await client.get('/tasks');
    const listBody = await listRes.json();
    expect(listBody.data.length).toBe(5);
  });
});
