import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

vi.mock('../../src/plugins/concerns/plugin-dependencies.js', () => ({
  requirePluginDependency: vi.fn()
}));

import { PuppeteerPlugin } from '../../src/plugins/puppeteer.plugin.js';

describe('PuppeteerPlugin - NetworkMonitor', () => {
  let db;
  let puppeteerPlugin;
  let networkMonitor;

  beforeAll(async () => {
    db = new Database({
      logLevel: 'silent',
      client: new MemoryClient()
    });
    await db.connect();
  });

  afterAll(async () => {
    if (puppeteerPlugin && typeof puppeteerPlugin.stop === 'function') {
      await puppeteerPlugin.stop().catch(() => {});
    }
    await db.disconnect();
  });

  beforeEach(async () => {
    puppeteerPlugin = new PuppeteerPlugin({
      logLevel: 'silent',
      cookies: { enabled: false },
      proxy: { enabled: false },
      networkMonitor: {
        enabled: true,
        persist: true
      },
      resourceNames: {
        networkSessions: 'test_network_sessions',
        networkRequests: 'test_network_requests',
        networkErrors: 'test_network_errors'
      }
    });

    puppeteerPlugin._importDependencies = vi.fn().mockResolvedValue();
    puppeteerPlugin._warmupBrowserPool = vi.fn().mockResolvedValue();

    await db.usePlugin(puppeteerPlugin);
    networkMonitor = puppeteerPlugin.networkMonitor;

    for (const resourceName of ['test_network_sessions', 'test_network_requests', 'test_network_errors']) {
      const resource = await db.getResource(resourceName);
      const items = await resource.list({ limit: 100 });
      for (const item of items) {
        await resource.remove(item.id);
      }
    }
  });

  it('stores semantic network timestamps as datetime strings', async () => {
    const sessionsResource = await db.getResource('test_network_sessions');
    const requestsResource = await db.getResource('test_network_requests');
    const errorsResource = await db.getResource('test_network_errors');

    expect(sessionsResource.attributes.startTime).toBe('datetime|required');
    expect(sessionsResource.attributes.endTime).toBe('datetime');
    expect(requestsResource.attributes.requestTimestamp).toBe('datetime');
    expect(requestsResource.attributes.responseTimestamp).toBe('datetime');
    expect(errorsResource.attributes.timestamp).toBe('datetime|required');

    const session = networkMonitor.startSession('session_1');
    expect(typeof session.startTime).toBe('string');

    const startedAt = Date.parse(session.startTime);
    networkMonitor.requests.get('session_1').set('req_1', {
      requestId: 'req_1',
      url: 'https://example.com/data',
      method: 'GET',
      resourceType: 'xhr',
      timestamp: startedAt,
      requestHeaders: { accept: 'application/json' }
    });

    networkMonitor.responses.get('session_1').set('req_1', {
      requestId: 'req_1',
      url: 'https://example.com/data',
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      mimeType: 'application/json',
      timestamp: startedAt + 25,
      responseTime: 25,
      size: 128,
      body: '{"ok":true}',
      compressed: false
    });

    const endedSession = await networkMonitor.endSession('session_1');
    expect(typeof endedSession?.endTime).toBe('string');

    const storedSessions = await sessionsResource.list({ limit: 10 });
    const storedRequests = await requestsResource.list({ limit: 10 });

    expect(storedSessions).toHaveLength(1);
    expect(storedRequests).toHaveLength(1);
    expect(typeof storedSessions[0].startTime).toBe('string');
    expect(typeof storedSessions[0].endTime).toBe('string');
    expect(typeof storedRequests[0].requestTimestamp).toBe('string');
    expect(typeof storedRequests[0].responseTimestamp).toBe('string');
  });
});
