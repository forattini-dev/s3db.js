import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

vi.mock('../../src/plugins/concerns/plugin-dependencies.js', () => ({
  requirePluginDependency: vi.fn()
}));

import { PuppeteerPlugin } from '../../src/plugins/puppeteer.plugin.js';

const createMockPage = (options: {
  cookies?: Array<Record<string, unknown>>;
  url?: string;
  setCookie?: ReturnType<typeof vi.fn>;
  goto?: ReturnType<typeof vi.fn>;
  evaluate?: ReturnType<typeof vi.fn>;
  $$?: ReturnType<typeof vi.fn>;
  userAgent?: string;
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
  proxyId?: string;
} = {}) => ({
  cookies: vi.fn().mockResolvedValue(options.cookies ?? []),
  setCookie: options.setCookie ?? vi.fn().mockResolvedValue(undefined),
  url: vi.fn().mockReturnValue(options.url ?? 'https://example.com/path'),
  goto: options.goto ?? vi.fn().mockResolvedValue(undefined),
  evaluate: options.evaluate ?? vi.fn().mockResolvedValue(undefined),
  $$: options.$$ ?? vi.fn().mockResolvedValue([]),
  _userAgent: options.userAgent ?? 'Mozilla/5.0 Test',
  _viewport: options.viewport ?? { width: 1920, height: 1080, deviceScaleFactor: 1 },
  _proxyId: options.proxyId
});

describe('PuppeteerPlugin - CookieManager', () => {
  let db;
  let puppeteerPlugin;
  let cookieManager;

  beforeAll(async () => {
    db = new Database({
      client: new MemoryClient()
    });
    await db.connect();

    puppeteerPlugin = new PuppeteerPlugin({
      logLevel: 'silent',
      namespace: null,
      cookies: {
        enabled: true,
        storage: {
          resource: 'test_cookie_manager'
        },
        farming: {
          enabled: true,
          warmup: {
            enabled: true,
            pages: ['https://www.google.com'],
            timePerPage: { min: 10, max: 20 }
          },
          rotation: {
            enabled: true,
            requestsPerCookie: 10,
            maxAge: 60000,
            poolSize: 5
          },
          reputation: {
            enabled: true,
            trackSuccess: true,
            retireThreshold: 0.5,
            ageBoost: true
          }
        }
      }
    });

    puppeteerPlugin._importDependencies = vi.fn().mockResolvedValue();
    puppeteerPlugin._warmupBrowserPool = vi.fn().mockResolvedValue();

    await db.usePlugin(puppeteerPlugin);
    cookieManager = puppeteerPlugin.cookieManager;
  });

  afterAll(async () => {
    if (puppeteerPlugin && typeof puppeteerPlugin.stop === 'function') {
      await puppeteerPlugin.stop().catch(() => {});
    }
    await db.disconnect();
  });

  beforeEach(async () => {
    cookieManager.sessions.clear();

    try {
      const storage = await db.getResource('test_cookie_manager');
      const sessions = await storage.list({ limit: 100 });
      for (const session of sessions) {
        await storage.remove(session.id);
      }
    } catch {
      // Resource not available yet
    }
  });

  it('initializes cookie storage and starts with no sessions', () => {
    expect(cookieManager.storage).toBeDefined();
    expect(cookieManager.storage.name).toMatch(/test_cookie_manager/);
    expect(cookieManager.sessions.size).toBe(0);
  });

  it('saves sessions with datetime/dateonly fields in storage', async () => {
    const sessionId = 'test_session_1';
    const page = createMockPage({
      cookies: [
        { name: 'cookie1', value: 'value1', domain: '.example.com' },
        { name: 'cookie2', value: 'value2', domain: '.example.com' }
      ]
    });

    const session = await cookieManager.saveSession(page, sessionId, { success: true });

    expect(cookieManager.hasSession(sessionId)).toBe(true);
    expect(session.sessionId).toBe(sessionId);
    expect(session.cookies).toHaveLength(2);
    expect(session.domain).toBe('example.com');
    expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof session.reputation.lastUsed).toBe('string');
    expect(typeof session.metadata.createdAt).toBe('string');
    expect(typeof session.metadata.expiresAt).toBe('string');

    const stored = (await cookieManager.storage.list({ limit: 10 }))
      .find(entry => entry.sessionId === sessionId);

    expect(stored).toBeDefined();
    expect(stored.date).toBe(session.date);
    expect(typeof stored.reputation.lastUsed).toBe('string');
    expect(typeof stored.metadata.createdAt).toBe('string');
    expect(typeof stored.metadata.expiresAt).toBe('string');
  });

  it('updates an existing session and keeps age/request metadata numeric', async () => {
    const sessionId = 'test_session_2';
    const firstPage = createMockPage({
      cookies: [{ name: 'cookie1', value: 'value1' }]
    });
    const secondPage = createMockPage({
      cookies: [
        { name: 'cookie1', value: 'value1' },
        { name: 'cookie2', value: 'value2' }
      ]
    });

    await cookieManager.saveSession(firstPage, sessionId, { success: true });
    const session = await cookieManager.saveSession(secondPage, sessionId, { success: false });

    expect(session.cookies).toHaveLength(2);
    expect(session.reputation.successCount).toBe(1);
    expect(session.reputation.failCount).toBe(1);
    expect(session.reputation.successRate).toBe(0.5);
    expect(typeof session.metadata.age).toBe('number');
    expect(session.metadata.age).toBeGreaterThanOrEqual(0);
  });

  it('loads an existing session into a page and increments request count', async () => {
    const sessionId = 'test_session_3';
    const savePage = createMockPage({
      cookies: [
        { name: 'cookie1', value: 'value1', domain: '.example.com' }
      ]
    });
    const setCookie = vi.fn().mockResolvedValue(undefined);
    const loadPage = createMockPage({ setCookie });

    await cookieManager.saveSession(savePage, sessionId, { success: true });

    const loaded = await cookieManager.loadSession(loadPage, sessionId);
    const session = cookieManager.getSession(sessionId);

    expect(loaded).toBe(true);
    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(session.metadata.requestCount).toBe(2);
    expect(typeof session.reputation.lastUsed).toBe('string');
  });

  it('reports cookie stats through the plugin API', async () => {
    await cookieManager.saveSession(createMockPage({
      url: 'https://example.com/a'
    }), 'session_1', { success: true });

    await cookieManager.saveSession(createMockPage({
      url: 'https://api.example.com/b'
    }), 'session_2', { success: false });

    const stats = await puppeteerPlugin.getCookieStats();

    expect(stats.total).toBe(2);
    expect(stats.healthy).toBe(1);
    expect(stats.unhealthy).toBe(1);
    expect(stats.averageSuccessRate).toBeGreaterThanOrEqual(0);
    expect(stats.byDomain['example.com']).toBe(1);
    expect(stats.byDomain['api.example.com']).toBe(1);
  });

  it('rotates a session and resets reputation counters on the new session', async () => {
    const sessionId = 'test_session_4';
    await cookieManager.saveSession(createMockPage(), sessionId, { success: true });

    const newSessionId = await cookieManager.rotateSession(sessionId);
    const rotated = cookieManager.getSession(newSessionId);

    expect(newSessionId).not.toBe(sessionId);
    expect(rotated).toBeDefined();
    expect(rotated.sessionId).toBe(newSessionId);
    expect(rotated.reputation.successCount).toBe(0);
    expect(rotated.reputation.failCount).toBe(0);
    expect(rotated.reputation.successRate).toBe(1);
    expect(typeof rotated.reputation.lastUsed).toBe('string');
    expect(typeof rotated.metadata.createdAt).toBe('string');
  });

  it('throws when farming is disabled', async () => {
    const disabledPlugin = new PuppeteerPlugin({
      logLevel: 'silent',
      cookies: {
        enabled: true,
        farming: {
          enabled: false
        }
      }
    });

    disabledPlugin._importDependencies = vi.fn().mockResolvedValue();
    disabledPlugin._warmupBrowserPool = vi.fn().mockResolvedValue();

    await db.usePlugin(disabledPlugin);

    await expect(disabledPlugin.farmCookies('test')).rejects.toThrow(
      'Cookie farming is not enabled'
    );
  });
});
