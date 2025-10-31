import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { PuppeteerPlugin } from '../../src/plugins/puppeteer.plugin.js';

describe('PuppeteerPlugin', () => {
  let db;
  let puppeteerPlugin;

  beforeAll(async () => {
    db = new Database({
      connectionString: 'http://test:test@localhost:4566/bucket',
      paranoid: false
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

  describe('Plugin Installation', () => {
    it('should install plugin with default config', async () => {
      puppeteerPlugin = new PuppeteerPlugin();

      await db.installPlugin(puppeteerPlugin);

      expect(puppeteerPlugin.name).toBe('PuppeteerPlugin');
      expect(puppeteerPlugin.slug).toBe('puppeteer');
      expect(puppeteerPlugin.database).toBe(db);
    });

    it('should create cookie storage resource when enabled', async () => {
      puppeteerPlugin = new PuppeteerPlugin({
        cookies: {
          enabled: true,
          storage: {
            resource: 'test_puppeteer_cookies'
          }
        }
      });

      await db.installPlugin(puppeteerPlugin);

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

      await db.installPlugin(puppeteerPlugin);

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

      await db.installPlugin(puppeteerPlugin);

      expect(events).toContain('beforeInstall');
      expect(events).toContain('afterInstall');
    });

    it('should emit puppeteer-specific events', async () => {
      puppeteerPlugin = new PuppeteerPlugin();

      const events = [];
      puppeteerPlugin.on('puppeteer.installed', () => events.push('installed'));

      await db.installPlugin(puppeteerPlugin);

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

      await db.installPlugin(puppeteerPlugin);
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

      await db.installPlugin(puppeteerPlugin);
      await db.start();

      expect(puppeteerPlugin.cookieManager).toBeNull();

      await db.stop();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on stop', async () => {
      puppeteerPlugin = new PuppeteerPlugin();

      await db.installPlugin(puppeteerPlugin);
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

      await db.installPlugin(puppeteerPlugin);
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
        'Plugin must be installed before accessing storage'
      );
    });
  });
});
