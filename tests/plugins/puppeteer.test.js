import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

jest.unstable_mockModule('../../src/plugins/concerns/plugin-dependencies.js', () => ({
  requirePluginDependency: jest.fn()
}));

const { PuppeteerPlugin } = await import('../../src/plugins/puppeteer.plugin.js');

describe('PuppeteerPlugin', () => {
  let db;
  let puppeteerPlugin;

  beforeAll(async () => {
    // Use real Database with MemoryClient like all other plugin tests
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
    // Reset plugin instance for each test
    puppeteerPlugin = null;
  });

  afterEach(async () => {
    if (puppeteerPlugin && typeof puppeteerPlugin.stop === 'function') {
      await puppeteerPlugin.stop().catch(() => {});
    }
    if (db) {
      db.installedPlugins = [];
      db.resources.clear();
    }
  });

  describe('Plugin Installation', () => {
    it('should install plugin with default config', async () => {
      puppeteerPlugin = new PuppeteerPlugin();

      await db.usePlugin(puppeteerPlugin);

      expect(puppeteerPlugin.name).toBe('PuppeteerPlugin');
      expect(puppeteerPlugin.slug).toBe('puppeteer');
      expect(puppeteerPlugin.database).toBe(db);
    });

    it('should create cookie storage resource when enabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        namespace: null, // Disable namespace to use exact resource name
        cookies: {
          enabled: true,
          storage: {
            resource: 'test_puppeteer_cookies'
          }
        }
      });

      await db.usePlugin(puppeteerPlugin);

      const resource = await db.getResource('test_puppeteer_cookies');
      expect(resource).toBeDefined();
      expect(resource.name).toBe('test_puppeteer_cookies');
    });

    it('should not create cookie storage when disabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        cookies: {
          enabled: false
        }
      });

      await db.usePlugin(puppeteerPlugin);

      // Should not throw error, cookie resource should not exist
      await expect(db.getResource('puppeteer_cookies')).rejects.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should merge default config with custom options', () => {
      puppeteerPlugin = new PuppeteerPlugin({
        pool: {
          maxBrowsers: 10
        },
        stealth: {
          enabled: false
        }
      });

      expect(puppeteerPlugin.config.pool.maxBrowsers).toBe(10);
      expect(puppeteerPlugin.config.pool.enabled).toBe(true); // default
      expect(puppeteerPlugin.config.stealth.enabled).toBe(false);
      expect(puppeteerPlugin.config.humanBehavior.enabled).toBe(true); // default
    });

    it('should have correct default viewport presets', () => {
      puppeteerPlugin = new PuppeteerPlugin();

      expect(puppeteerPlugin.config.viewport.presets).toContain('desktop');
      expect(puppeteerPlugin.config.viewport.presets).toContain('laptop');
      expect(puppeteerPlugin.config.viewport.presets).toContain('tablet');
    });

    it('should have correct cookie farming defaults', () => {
      puppeteerPlugin = new PuppeteerPlugin();

      expect(puppeteerPlugin.config.cookies.farming.enabled).toBe(true);
      expect(puppeteerPlugin.config.cookies.farming.warmup.enabled).toBe(true);
      expect(puppeteerPlugin.config.cookies.farming.rotation.enabled).toBe(true);
      expect(puppeteerPlugin.config.cookies.farming.reputation.enabled).toBe(true);
    });
  });

  describe('Viewport Generation', () => {
    beforeEach(() => {
      puppeteerPlugin = new PuppeteerPlugin();
    });

    it('should generate fixed viewport when randomize is disabled', () => {
      puppeteerPlugin.config.viewport.randomize = false;
      puppeteerPlugin.config.viewport.width = 1024;
      puppeteerPlugin.config.viewport.height = 768;

      const viewport = puppeteerPlugin._generateViewport();

      expect(viewport.width).toBe(1024);
      expect(viewport.height).toBe(768);
    });

    it('should generate random viewport when randomize is enabled', () => {
      puppeteerPlugin.config.viewport.randomize = true;
      puppeteerPlugin.config.viewport.presets = ['desktop'];

      const viewport = puppeteerPlugin._generateViewport();

      expect(viewport).toHaveProperty('width');
      expect(viewport).toHaveProperty('height');
      expect(viewport).toHaveProperty('deviceScaleFactor');
      expect(viewport.width).toBeGreaterThan(0);
    });

    it('should select from specified presets only', () => {
      puppeteerPlugin.config.viewport.randomize = true;
      puppeteerPlugin.config.viewport.presets = ['tablet'];

      const viewport = puppeteerPlugin._generateViewport();

      // Tablet presets have width of 768 or 1024
      expect([768, 1024]).toContain(viewport.width);
    });
  });

  describe('User Agent Generation', () => {
    beforeEach(() => {
      puppeteerPlugin = new PuppeteerPlugin();
    });

    it('should return null when user agent is disabled', () => {
      puppeteerPlugin.config.userAgent.enabled = false;

      const userAgent = puppeteerPlugin._generateUserAgent();

      expect(userAgent).toBeNull();
    });

    it('should return custom user agent when provided', () => {
      puppeteerPlugin.config.userAgent.custom = 'Custom User Agent';

      const userAgent = puppeteerPlugin._generateUserAgent();

      expect(userAgent).toBe('Custom User Agent');
    });
  });

  describe('Events', () => {
    it('should emit plugin lifecycle events', async () => {
      puppeteerPlugin = new PuppeteerPlugin();

      const events = [];
      puppeteerPlugin.on('plugin.beforeInstall', () => events.push('beforeInstall'));
      puppeteerPlugin.on('plugin.afterInstall', () => events.push('afterInstall'));

      await db.usePlugin(puppeteerPlugin);

      expect(events).toContain('beforeInstall');
      expect(events).toContain('afterInstall');
    });

    it('should emit puppeteer-specific events', async () => {
      puppeteerPlugin = new PuppeteerPlugin();

      const events = [];
      puppeteerPlugin.on('puppeteer.installed', () => events.push('installed'));

      await db.usePlugin(puppeteerPlugin);

      expect(events).toContain('installed');
    });
  });

  describe('Cookie Manager', () => {
    it('should initialize cookie manager when enabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        cookies: {
          enabled: true
        }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      expect(puppeteerPlugin.cookieManager).toBeDefined();
      expect(puppeteerPlugin.cookieManager.storage).toBeDefined();

      await db.stop();
    });

    it('should not initialize cookie manager when disabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        cookies: {
          enabled: false
        }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      expect(puppeteerPlugin.cookieManager).toBeNull();

      await db.stop();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on stop', async () => {
      puppeteerPlugin = new PuppeteerPlugin();

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      expect(puppeteerPlugin.initialized).toBe(true);

      await db.stop();

      expect(puppeteerPlugin.initialized).toBe(false);
    });

    it('should close all browsers in pool on stop', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        pool: {
          enabled: true
        }
      });

      puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
      puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.usePlugin(puppeteerPlugin);
      await db.start();

      // Start with empty pool
      expect(puppeteerPlugin.browserPool.length).toBe(0);

      await db.stop();

      // Pool should be cleared
      expect(puppeteerPlugin.browserPool.length).toBe(0);
      expect(puppeteerPlugin.tabPool.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when accessing storage before install', () => {
      puppeteerPlugin = new PuppeteerPlugin();

      expect(() => puppeteerPlugin.getStorage()).toThrow(
        'Plugin storage unavailable until plugin is installed'
      );
    });
  });

  describe('Browser Management', () => {
    it('should not mutate launch args when adding proxy flags', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        pool: { enabled: false },
        launch: { args: ['--existing-flag'] }
      });

      const fakeBrowser = new EventEmitter();
      fakeBrowser.close = jest.fn().mockResolvedValue();

      puppeteerPlugin.puppeteer = {
        launch: jest.fn().mockResolvedValue(fakeBrowser)
      };

      puppeteerPlugin.proxyManager = {
        getProxyLaunchArgs: jest.fn().mockReturnValue(['--proxy-server=http://proxy:8000'])
      };

      const originalArgs = [...puppeteerPlugin.config.launch.args];

      await puppeteerPlugin._createBrowser({ id: 'proxy_1' });

      const launchOptions = puppeteerPlugin.puppeteer.launch.mock.calls[0][0];
      expect(launchOptions.args).toEqual(['--existing-flag', '--proxy-server=http://proxy:8000']);
      expect(puppeteerPlugin.config.launch.args).toEqual(originalArgs);
    });

    it('should track pooled tabs and save cookies before closing', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        performance: { blockResources: { enabled: false } },
        humanBehavior: { enabled: false },
        cookies: { enabled: true }
      });

      const fakeBrowser = new EventEmitter();
      fakeBrowser.close = jest.fn().mockResolvedValue();

      const page = new EventEmitter();
      page.setViewport = jest.fn().mockResolvedValue();
      page.setUserAgent = jest.fn().mockResolvedValue();
      page.goto = jest.fn().mockResolvedValue();
      page.setCookie = jest.fn().mockResolvedValue();
      page.close = jest.fn().mockResolvedValue();
      page.isClosed = jest.fn().mockReturnValue(false);
      page.screenshot = jest.fn().mockResolvedValue();

      fakeBrowser.newPage = jest.fn().mockResolvedValue(page);

      puppeteerPlugin.puppeteer = {
        launch: jest.fn().mockResolvedValue(fakeBrowser)
      };

      puppeteerPlugin.cookieManager = {
        loadSession: jest.fn().mockResolvedValue(),
        saveSession: jest.fn().mockResolvedValue()
      };

      const resultPage = await puppeteerPlugin.navigate('https://example.com', {
        useSession: 'session-1'
      });

      const tabs = puppeteerPlugin.tabPool.get(fakeBrowser);
      expect(tabs.has(page)).toBe(true);

      await resultPage.close();

      expect(puppeteerPlugin.cookieManager.saveSession).toHaveBeenCalledWith(
        page,
        'session-1',
        expect.objectContaining({ success: true })
      );
      expect(tabs.has(page)).toBe(false);
    });

    it('should persist cookies for pooled pages during shutdown', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        performance: { blockResources: { enabled: false } },
        humanBehavior: { enabled: false },
        cookies: { enabled: true }
      });

      const fakeBrowser = new EventEmitter();
      fakeBrowser.close = jest.fn().mockResolvedValue();

      const page = new EventEmitter();
      page.setViewport = jest.fn().mockResolvedValue();
      page.setUserAgent = jest.fn().mockResolvedValue();
      page.goto = jest.fn().mockResolvedValue();
      page.setCookie = jest.fn().mockResolvedValue();
      page.close = jest.fn().mockResolvedValue();
      page.isClosed = jest.fn().mockReturnValue(false);
      page.screenshot = jest.fn().mockResolvedValue();

      fakeBrowser.newPage = jest.fn().mockResolvedValue(page);

      puppeteerPlugin.puppeteer = {
        launch: jest.fn().mockResolvedValue(fakeBrowser)
      };

      puppeteerPlugin.cookieManager = {
        loadSession: jest.fn().mockResolvedValue(),
        saveSession: jest.fn().mockResolvedValue()
      };

      await puppeteerPlugin.navigate('https://example.com', {
        useSession: 'session-2'
      });

      await puppeteerPlugin._closeBrowserPool();

      expect(puppeteerPlugin.cookieManager.saveSession).toHaveBeenCalledWith(
        page,
        'session-2',
        expect.objectContaining({ success: true })
      );
      expect(fakeBrowser.close).toHaveBeenCalled();
    });

    it('should close dedicated browser when pool disabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        pool: { enabled: false },
        cookies: { enabled: false },
        performance: { blockResources: { enabled: false } },
        humanBehavior: { enabled: false }
      });

      const fakeBrowser = new EventEmitter();
      fakeBrowser.close = jest.fn().mockResolvedValue();

      const page = new EventEmitter();
      page.setViewport = jest.fn().mockResolvedValue();
      page.setUserAgent = jest.fn().mockResolvedValue();
      page.goto = jest.fn().mockResolvedValue();
      page.setCookie = jest.fn().mockResolvedValue();
      page.close = jest.fn().mockResolvedValue();
      page.isClosed = jest.fn().mockReturnValue(false);
      page.screenshot = jest.fn().mockResolvedValue();

      fakeBrowser.newPage = jest.fn().mockResolvedValue(page);

      puppeteerPlugin.puppeteer = {
        launch: jest.fn().mockResolvedValue(fakeBrowser)
      };

      const resultPage = await puppeteerPlugin.navigate('https://example.com');
      await resultPage.close();

      expect(fakeBrowser.close).toHaveBeenCalled();
    });
  });

  describe('Initialization Order', () => {
    it('initializes cookie manager before proxy manager', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        cookies: { enabled: true },
        proxy: { enabled: true, list: ['http://proxy:8000'] },
        pool: { enabled: false }
      });

      const order = [];

      puppeteerPlugin._importDependencies = jest.fn();
      puppeteerPlugin._initializeCookieManager = jest.fn().mockImplementation(async () => {
        order.push('cookie');
      });
      puppeteerPlugin._initializeProxyManager = jest.fn().mockImplementation(async () => {
        order.push('proxy');
      });

      await puppeteerPlugin.onStart();

      expect(order).toEqual(['cookie', 'proxy']);
    });
  });

  describe('withSession helper', () => {
    it('should navigate, run handler, and close page', async () => {
      puppeteerPlugin = new PuppeteerPlugin({ cookies: { enabled: false } });

      const page = {
        close: jest.fn().mockResolvedValue()
      };

      puppeteerPlugin.navigate = jest.fn().mockResolvedValue(page);

      const events = [];
      puppeteerPlugin.on('puppeteer.withSession.start', payload =>
        events.push({ type: 'start', sessionId: payload.sessionId })
      );
      puppeteerPlugin.on('puppeteer.withSession.finish', payload =>
        events.push({ type: 'finish', error: payload.error })
      );

      const result = await puppeteerPlugin.withSession(
        'session-1',
        async receivedPage => {
          expect(receivedPage).toBe(page);
          return 'ok';
        },
        { url: 'https://example.com', waitUntil: 'domcontentloaded' }
      );

      expect(result).toBe('ok');
      expect(page.close).toHaveBeenCalled();
      expect(puppeteerPlugin.navigate).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ useSession: 'session-1', waitUntil: 'domcontentloaded' })
      );
      expect(events).toEqual([
        { type: 'start', sessionId: 'session-1' },
        { type: 'finish', error: null }
      ]);
    });

    it('should close page even when handler throws', async () => {
      puppeteerPlugin = new PuppeteerPlugin({ cookies: { enabled: false } });

      const page = {
        close: jest.fn().mockResolvedValue()
      };

      puppeteerPlugin.navigate = jest.fn().mockResolvedValue(page);

      await expect(
        puppeteerPlugin.withSession(
          'session-err',
          async () => {
            throw new Error('handler failed');
          },
          { url: 'https://example.com' }
        )
      ).rejects.toThrow('handler failed');

      expect(page.close).toHaveBeenCalled();
    });
  });
});
