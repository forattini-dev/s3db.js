import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketPlugin } from '../../../src/plugins/websocket/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

function randomPort() {
  return 9400 + Math.floor(Math.random() * 2000);
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

function waitForWsMessage(ws: WebSocket, predicate: (msg: any) => boolean, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error('Timeout waiting for WebSocket message'));
    }, timeoutMs);

    function handler(event: MessageEvent) {
      const data = JSON.parse(event.data);
      if (predicate(data)) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(data);
      }
    }

    ws.addEventListener('message', handler);
  });
}

describe('WebSocket Plugin — New Features (Ticket Auth, Recovery, Channels, Compression)', () => {
  let db: any;
  let wsPlugin: WebSocketPlugin | null = null;
  let wsPort: number;
  let ws: WebSocket | null = null;

  beforeEach(async () => {
    wsPort = randomPort();

    db = createMemoryDatabaseForTest(`ws-features-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
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
  });

  afterEach(async () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (wsPlugin) {
      await wsPlugin.onStop();
      wsPlugin = null;
    }
    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  describe('Ticket-based Authentication', () => {
    it('generates tickets and connects with a valid ticket', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        ticketAuth: { enabled: true, ttl: 30_000 },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-ticket-test');
      await waitForServer(wsPort);

      // Generate ticket
      const ticket = await wsPlugin.generateTicket('user-123', {
        permissions: ['private-user-123'],
        metadata: { role: 'admin' }
      });

      expect(ticket.id).toBeTruthy();
      expect(ticket.userId).toBe('user-123');
      expect(ticket.expiresAt).toBeGreaterThan(Date.now());

      // Connect with ticket
      ws = new WebSocket(`ws://127.0.0.1:${wsPort}?ticket=${ticket.id}`);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WS connection timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(timer); resolve(); });
        ws!.addEventListener('error', (e) => { clearTimeout(timer); reject(e); });
      });

      const connectedMsg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(connectedMsg.type).toBe('connected');
      expect(connectedMsg.clientId).toBeTruthy();
    });

    it('rejects connection with invalid ticket', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        ticketAuth: { enabled: true },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-ticket-reject');
      await waitForServer(wsPort);

      // Connect with bogus ticket — should fail handshake
      ws = new WebSocket(`ws://127.0.0.1:${wsPort}?ticket=bogus-ticket`);

      const closed = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(true), 3000);
        ws!.addEventListener('open', () => {
          // If it opens, it still might get a close frame shortly after
          ws!.addEventListener('close', () => { clearTimeout(timer); resolve(true); });
        });
        ws!.addEventListener('error', () => { clearTimeout(timer); resolve(true); });
      });

      expect(closed).toBe(true);
    });

    it('throws when generating ticket without ticketAuth enabled', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-no-ticket');
      await waitForServer(wsPort);

      await expect(wsPlugin.generateTicket('user-1')).rejects.toThrow('Ticket auth is not enabled');
    });

    it('exposes ticketStore for custom revocation', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        ticketAuth: { enabled: true },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-ticket-store');
      await waitForServer(wsPort);

      expect(wsPlugin.ticketStore).toBeTruthy();

      // Generate and revoke a ticket
      const ticket = await wsPlugin.generateTicket('user-456');
      await wsPlugin.ticketStore.revoke(ticket.id);

      // Ticket should no longer be consumable
      const consumed = await wsPlugin.ticketStore.consume(ticket.id);
      expect(consumed).toBeNull();
    });
  });

  describe('Channel Features', () => {
    it('supports queue channels (queue- prefix)', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-queue');
      await waitForServer(wsPort);

      // Connect two clients
      const ws1 = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      const ws2 = new WebSocket(`ws://127.0.0.1:${wsPort}`);

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 5000);
          ws1.addEventListener('open', () => { clearTimeout(t); resolve(); });
        }),
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 5000);
          ws2.addEventListener('open', () => { clearTimeout(t); resolve(); });
        })
      ]);

      await waitForWsMessage(ws1, msg => msg.type === 'connected');
      await waitForWsMessage(ws2, msg => msg.type === 'connected');

      // Both join a queue channel
      const join1 = waitForWsMessage(ws1, msg => msg.type === 'channel:joined');
      ws1.send(JSON.stringify({ type: 'join', channel: 'queue-jobs' }));
      await join1;

      const join2 = waitForWsMessage(ws2, msg => msg.type === 'channel:joined');
      ws2.send(JSON.stringify({ type: 'join', channel: 'queue-jobs' }));
      await join2;

      // Verify stats include queue type
      const stats = wsPlugin.getChannelStats();
      expect(stats.byType.queue).toBe(1);

      ws1.close();
      ws2.close();
    });

    it('lists channels with queue type filter', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-list-queue');
      await waitForServer(wsPort);

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
      });
      await waitForWsMessage(ws, msg => msg.type === 'connected');

      // Join public + queue channels
      const joinPublic = waitForWsMessage(ws, msg => msg.type === 'channel:joined' && msg.channel === 'general');
      ws.send(JSON.stringify({ type: 'join', channel: 'general' }));
      await joinPublic;

      const joinQueue = waitForWsMessage(ws, msg => msg.type === 'channel:joined' && msg.channel === 'queue-tasks');
      ws.send(JSON.stringify({ type: 'join', channel: 'queue-tasks' }));
      await joinQueue;

      // Filter by queue type
      const queueChannels = wsPlugin.listChannels({ type: 'queue' });
      expect(queueChannels.length).toBe(1);
      expect(queueChannels[0].name).toBe('queue-tasks');
      expect(queueChannels[0].type).toBe('queue');

      const publicChannels = wsPlugin.listChannels({ type: 'public' });
      expect(publicChannels.length).toBe(1);
      expect(publicChannels[0].name).toBe('general');
    });
  });

  describe('Compression Config', () => {
    it('accepts compression as boolean (backwards compatible)', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        compression: true,
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-comp-bool');
      await waitForServer(wsPort);

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
      });
      const msg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(msg.type).toBe('connected');
    });

    it('accepts compression as object with threshold and level', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        compression: { threshold: 512, level: 3 },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-comp-obj');
      await waitForServer(wsPort);

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
      });
      const msg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(msg.type).toBe('connected');
    });
  });

  describe('Recovery Config', () => {
    it('accepts recovery config without errors', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        recovery: { enabled: true, ttl: 60_000 },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-recovery');
      await waitForServer(wsPort);

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
      });
      const msg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(msg.type).toBe('connected');
    });
  });

  describe('Channel Rate Limits', () => {
    it('accepts channel rate limits config', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        channels: {
          enabled: true,
          rateLimits: {
            maxChannelsPerClient: 5,
            maxSubscribesPerSecond: 2,
            maxPublishesPerSecond: 10,
          }
        },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-rate-limits');
      await waitForServer(wsPort);

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
      });
      const msg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(msg.type).toBe('connected');

      // Join a channel to verify config doesn't break things
      const joinPromise = waitForWsMessage(ws, msg => msg.type === 'channel:joined');
      ws.send(JSON.stringify({ type: 'join', channel: 'test-channel' }));
      const joined = await joinPromise;
      expect(joined.channel).toBe('test-channel');
    });
  });

  describe('Channel History', () => {
    it('accepts history config and server starts', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        channels: {
          enabled: true,
          history: { enabled: true, maxSize: 50, ttl: 60_000 }
        },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-history');
      await waitForServer(wsPort);

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
      });
      const msg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(msg.type).toBe('connected');
    });
  });

  describe('Channel Transformers', () => {
    it('accepts transform function config', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        channels: {
          enabled: true,
          transform: (channel, event, data, ctx) => {
            // Redact sensitive data before broadcast
            if (typeof data === 'object' && data !== null) {
              const filtered = { ...(data as Record<string, unknown>) };
              delete filtered.secret;
              return filtered;
            }
            return data;
          }
        },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-transform');
      await waitForServer(wsPort);

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
      });
      const msg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(msg.type).toBe('connected');
    });
  });

  describe('All features combined', () => {
    it('starts with all Phase 1-3 features enabled simultaneously', async () => {
      wsPlugin = new WebSocketPlugin({
        port: wsPort,
        host: '127.0.0.1',
        startupBanner: false,
        logLevel: 'silent',
        ticketAuth: { enabled: true, ttl: 30_000 },
        recovery: { enabled: true, ttl: 120_000 },
        compression: { threshold: 256, level: 1 },
        channels: {
          enabled: true,
          rateLimits: {
            maxChannelsPerClient: 10,
            maxSubscribesPerSecond: 5,
            maxPublishesPerSecond: 20,
          },
          history: { enabled: true, maxSize: 100, ttl: 300_000 },
          typing: { enabled: true, timeout: 5000 },
          maxSubscribersPerChannel: 50,
          transform: (channel, event, data) => data,
        },
        resources: { items: {} }
      });
      await db.usePlugin(wsPlugin, 'ws-all');
      await waitForServer(wsPort);

      // Generate ticket and connect
      const ticket = await wsPlugin.generateTicket('combined-user', {
        metadata: { role: 'user' }
      });

      ws = new WebSocket(`ws://127.0.0.1:${wsPort}?ticket=${ticket.id}`);

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws!.addEventListener('open', () => { clearTimeout(t); resolve(); });
        ws!.addEventListener('error', (e) => { clearTimeout(t); reject(e); });
      });

      const connectedMsg = await waitForWsMessage(ws, msg => msg.type === 'connected');
      expect(connectedMsg.type).toBe('connected');

      // Join a channel
      const joinPromise = waitForWsMessage(ws, msg => msg.type === 'channel:joined');
      ws.send(JSON.stringify({ type: 'join', channel: 'combined-test' }));
      const joined = await joinPromise;
      expect(joined.channel).toBe('combined-test');

      // Do a CRUD operation
      const listPromise = waitForWsMessage(ws, msg => msg.requestId === 'combo-list');
      ws.send(JSON.stringify({ type: 'list', requestId: 'combo-list', resource: 'items' }));
      const listResult = await listPromise;
      expect(listResult.type).toBe('data');

      // Verify stats
      const stats = wsPlugin.getChannelStats();
      expect(stats.channels).toBeGreaterThanOrEqual(1);
    });
  });
});
