import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

jest.unstable_mockModule('../../src/plugins/concerns/plugin-dependencies.js', () => ({
  requirePluginDependency: jest.fn()
}));

const { PuppeteerPlugin } = await import('../../src/plugins/puppeteer.plugin.js');
const { ProxyManager } = await import('../../src/plugins/puppeteer/proxy-manager.js');

describe('PuppeteerPlugin - Proxy Pool & Binding', () => {
  let db;
  let puppeteerPlugin;

  beforeAll(async () => {
    // Use real Database with MemoryClient - obliterating MockDatabase!
    db = new Database({
      client: new MemoryClient()
    });
    await db.connect();
  });

  afterAll(async () => {
    if (puppeteerPlugin) {
      await db.stop();
    }
    await db.disconnect();
  });

  beforeEach(() => {
    puppeteerPlugin = null;
  });

  describe('Proxy Configuration', () => {
    it('should accept proxy list as strings', () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: [
            'http://user1:pass1@proxy1.com:8080',
            'http://user2:pass2@proxy2.com:8080'
          ]
        }
      });

      expect(puppeteerPlugin.config.proxy.enabled).toBe(true);
      expect(puppeteerPlugin.config.proxy.list.length).toBe(2);
    });

    it('should accept proxy list as objects', () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: [
            {
              protocol: 'http',
              host: 'proxy1.com',
              port: 8080,
              username: 'user1',
              password: 'pass1'
            }
          ]
        }
      });

      expect(puppeteerPlugin.config.proxy.list.length).toBe(1);
      expect(puppeteerPlugin.config.proxy.list[0].host).toBe('proxy1.com');
    });

    it('should have correct default selection strategy', () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: ['http://proxy1.com:8080']
        }
      });

      expect(puppeteerPlugin.config.proxy.selectionStrategy).toBe('round-robin');
    });

    it('should accept custom selection strategies', () => {
      const strategies = ['round-robin', 'random', 'least-used', 'best-performance'];

      strategies.forEach(strategy => {
        const plugin = new PuppeteerPlugin({
          proxy: {
            enabled: true,
            list: ['http://proxy1.com:8080'],
            selectionStrategy: strategy
          }
        });

        expect(plugin.config.proxy.selectionStrategy).toBe(strategy);
      });
    });
  });

  describe('ProxyManager Initialization', () => {
    it('should initialize ProxyManager when proxy enabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: ['http://proxy1.com:8080', 'http://proxy2.com:8080']
        },
        cookies: { enabled: false }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      expect(puppeteerPlugin.proxyManager).toBeDefined();
      expect(puppeteerPlugin.proxyManager).toBeInstanceOf(ProxyManager);

      await db.stop();
    });

    it('should not initialize ProxyManager when proxy disabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: false
        }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      expect(puppeteerPlugin.proxyManager).toBeNull();

      await db.stop();
    });
  });

  describe('Proxy Pool Management', () => {
    beforeEach(async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: [
            'http://proxy1.com:8080',
            'http://proxy2.com:8080',
            'http://proxy3.com:8080'
          ],
          selectionStrategy: 'round-robin'
        },
        cookies: { enabled: false }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();
    });

    afterEach(async () => {
      await db.stop();
    });

    it('should parse proxy list on initialization', () => {
      const proxies = puppeteerPlugin.proxyManager.proxies;

      expect(proxies.length).toBe(3);
      expect(proxies[0].host).toBe('proxy1.com');
      expect(proxies[0].port).toBe(8080);
      expect(proxies[0].id).toBeDefined();
    });

    it('should initialize stats for each proxy', () => {
      const stats = puppeteerPlugin.proxyManager.proxyStats;

      expect(stats.size).toBe(3);

      for (const [proxyId, stat] of stats) {
        expect(stat.requests).toBe(0);
        expect(stat.failures).toBe(0);
        expect(stat.successRate).toBe(1.0);
        expect(stat.healthy).toBe(true);
      }
    });

    it('should get proxy statistics', () => {
      const stats = puppeteerPlugin.getProxyStats();

      expect(stats.length).toBe(3);
      expect(stats[0]).toHaveProperty('proxyId');
      expect(stats[0]).toHaveProperty('url');
      expect(stats[0]).toHaveProperty('requests');
      expect(stats[0]).toHaveProperty('successRate');
      expect(stats[0]).toHaveProperty('healthy');
      expect(stats[0]).toHaveProperty('boundSessions');
    });
  });

  describe('Session-Proxy Binding (IMMUTABLE)', () => {
    beforeEach(async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: [
            'http://proxy1.com:8080',
            'http://proxy2.com:8080'
          ],
          selectionStrategy: 'round-robin'
        },
        cookies: { enabled: false }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();
    });

    afterEach(async () => {
      await db.stop();
    });

    it('should assign proxy to new session automatically', () => {
      const sessionId = 'test_session_1';

      const proxy = puppeteerPlugin.proxyManager.getProxyForSession(sessionId, true);

      expect(proxy).toBeDefined();
      expect(proxy.id).toBeDefined();

      // Check binding was created
      expect(puppeteerPlugin.proxyManager.sessionProxyMap.has(sessionId)).toBe(true);
    });

    it('should return same proxy for existing session (IMMUTABLE)', () => {
      const sessionId = 'test_session_2';

      // First call - assigns proxy
      const proxy1 = puppeteerPlugin.proxyManager.getProxyForSession(sessionId, true);
      const proxyId1 = proxy1.id;

      // Second call - should return SAME proxy
      const proxy2 = puppeteerPlugin.proxyManager.getProxyForSession(sessionId, true);
      const proxyId2 = proxy2.id;

      expect(proxyId1).toBe(proxyId2);
      expect(proxy1.host).toBe(proxy2.host);
    });

    it('should distribute sessions across proxies (round-robin)', () => {
      const session1 = 'session_1';
      const session2 = 'session_2';
      const session3 = 'session_3';

      const proxy1 = puppeteerPlugin.proxyManager.getProxyForSession(session1, true);
      const proxy2 = puppeteerPlugin.proxyManager.getProxyForSession(session2, true);
      const proxy3 = puppeteerPlugin.proxyManager.getProxyForSession(session3, true);

      // Should alternate between proxies
      expect(proxy1.id).not.toBe(proxy2.id);
      expect(proxy2.id).not.toBe(proxy3.id);

      // Third should loop back to first (only 2 proxies)
      expect(proxy1.id).toBe(proxy3.id);
    });

    it('should get session-proxy bindings', () => {
      const session1 = 'session_1';
      const session2 = 'session_2';

      puppeteerPlugin.proxyManager.getProxyForSession(session1, true);
      puppeteerPlugin.proxyManager.getProxyForSession(session2, true);

      const bindings = puppeteerPlugin.getSessionProxyBindings();

      expect(bindings.length).toBe(2);
      expect(bindings[0]).toHaveProperty('sessionId');
      expect(bindings[0]).toHaveProperty('proxyId');
      expect(bindings[0]).toHaveProperty('proxyUrl');
    });

    it('should verify binding integrity', () => {
      const sessionId = 'test_session';

      const proxy = puppeteerPlugin.proxyManager.getProxyForSession(sessionId, true);

      // Correct binding
      expect(puppeteerPlugin.proxyManager.verifyBinding(sessionId, proxy.id)).toBe(true);

      // Wrong proxy
      expect(puppeteerPlugin.proxyManager.verifyBinding(sessionId, 'wrong_proxy')).toBe(false);

      // Non-existent session
      expect(puppeteerPlugin.proxyManager.verifyBinding('nonexistent', proxy.id)).toBe(false);
    });

    it('should throw error if trying to use unhealthy proxy', () => {
      const sessionId = 'test_session';

      const proxy = puppeteerPlugin.proxyManager.getProxyForSession(sessionId, true);

      // Mark proxy as unhealthy
      const stats = puppeteerPlugin.proxyManager.proxyStats.get(proxy.id);
      stats.healthy = false;

      // Should throw when trying to use unhealthy bound proxy
      expect(() => {
        puppeteerPlugin.proxyManager.getProxyForSession(sessionId, true);
      }).toThrow();
    });
  });

  describe('Proxy Usage Recording', () => {
    beforeEach(async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: ['http://proxy1.com:8080'],
          healthCheck: {
            successRateThreshold: 0.5
          }
        },
        cookies: { enabled: false }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();
    });

    afterEach(async () => {
      await db.stop();
    });

    it('should record successful proxy usage', () => {
      const proxyId = puppeteerPlugin.proxyManager.proxies[0].id;

      puppeteerPlugin.proxyManager.recordProxyUsage(proxyId, true);

      const stats = puppeteerPlugin.proxyManager.proxyStats.get(proxyId);

      expect(stats.requests).toBe(1);
      expect(stats.failures).toBe(0);
      expect(stats.successRate).toBeGreaterThan(0.9);
    });

    it('should record failed proxy usage', () => {
      const proxyId = puppeteerPlugin.proxyManager.proxies[0].id;

      puppeteerPlugin.proxyManager.recordProxyUsage(proxyId, false);

      const stats = puppeteerPlugin.proxyManager.proxyStats.get(proxyId);

      expect(stats.requests).toBe(1);
      expect(stats.failures).toBe(1);
      expect(stats.successRate).toBeLessThan(1.0);
    });

    it('should mark proxy unhealthy after threshold', () => {
      const proxyId = puppeteerPlugin.proxyManager.proxies[0].id;

      // Record multiple failures
      for (let i = 0; i < 10; i++) {
        puppeteerPlugin.proxyManager.recordProxyUsage(proxyId, false);
      }

      const stats = puppeteerPlugin.proxyManager.proxyStats.get(proxyId);

      expect(stats.healthy).toBe(false);
      expect(stats.successRate).toBeLessThan(0.5);
    });
  });

  describe('Proxy Launch Args', () => {
    beforeEach(async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: ['http://user:pass@proxy1.com:8080'],
          bypassList: ['localhost', '127.0.0.1']
        },
        cookies: { enabled: false }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();
    });

    afterEach(async () => {
      await db.stop();
    });

    it('should generate correct proxy launch args', () => {
      const proxy = puppeteerPlugin.proxyManager.proxies[0];
      const args = puppeteerPlugin.proxyManager.getProxyLaunchArgs(proxy);

      expect(args.length).toBeGreaterThan(0);
      expect(args[0]).toContain('--proxy-server=');
      expect(args[0]).toContain('proxy1.com:8080');
    });

    it('should include bypass list in launch args', () => {
      const proxy = puppeteerPlugin.proxyManager.proxies[0];
      const args = puppeteerPlugin.proxyManager.getProxyLaunchArgs(proxy);

      const bypassArg = args.find(arg => arg.includes('--proxy-bypass-list='));
      expect(bypassArg).toBeDefined();
      expect(bypassArg).toContain('localhost');
      expect(bypassArg).toContain('127.0.0.1');
    });
  });

  describe('Proxy URL Masking', () => {
    it('should mask credentials in proxy URL', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: ['http://secretuser:secretpass@proxy1.com:8080']
        },
        cookies: { enabled: false }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      const stats = puppeteerPlugin.getProxyStats();

      expect(stats[0].url).toContain('***');
      expect(stats[0].url).not.toContain('secretpass');
      expect(stats[0].url).toContain('secretuser');

      await db.stop();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when proxy methods called without initialization', () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: { enabled: false }
      });

      expect(() => puppeteerPlugin.getProxyStats()).toThrow(
        'Proxy manager not initialized'
      );

      expect(() => puppeteerPlugin.getSessionProxyBindings()).toThrow(
        'Proxy manager not initialized'
      );
    });

    it('should throw error when no healthy proxies available', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        proxy: {
          enabled: true,
          list: ['http://proxy1.com:8080']
        },
        cookies: { enabled: false }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      // Mark all proxies as unhealthy
      for (const proxy of puppeteerPlugin.proxyManager.proxies) {
        const stats = puppeteerPlugin.proxyManager.proxyStats.get(proxy.id);
        stats.healthy = false;
      }

      expect(() => {
        puppeteerPlugin.proxyManager.getProxyForSession('test_session', true);
      }).toThrow('No healthy proxies available');

      await db.stop();
    });
  });
});
