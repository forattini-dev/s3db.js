import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { createMockDatabase } from './helpers/mock-database.js';

jest.unstable_mockModule('../../src/plugins/concerns/plugin-dependencies.js', () => ({
  requirePluginDependency: jest.fn()
}));

const { PuppeteerPlugin } = await import('../../src/plugins/puppeteer.plugin.js');
const { CookieManager } = await import('../../src/plugins/puppeteer/cookie-manager.js');

describe('PuppeteerPlugin - CookieManager', () => {
  let db;
  let puppeteerPlugin;
  let cookieManager;

  beforeAll(async () => {
    db = createMockDatabase();
    await db.connect();
    puppeteerPlugin = new PuppeteerPlugin({
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
            timePerPage: { min: 1000, max: 2000 }
          },
          rotation: {
            enabled: true,
            requestsPerCookie: 10,
            maxAge: 60000, // 1 minute
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

    puppeteerPlugin._importDependencies = jest.fn().mockResolvedValue();
    puppeteerPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

    await db.installPlugin(puppeteerPlugin);
    await db.start();

    cookieManager = puppeteerPlugin.cookieManager;
  });

  afterAll(async () => {
    await db.stop();
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clear cookie pool before each test
    cookieManager.cookiePool.clear();

    // Clear storage
    const storage = await db.getResource('test_cookie_manager');
    const cookies = await storage.list({ limit: 100 });
    for (const cookie of cookies) {
      await storage.remove(cookie.id);
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct storage', () => {
      expect(cookieManager.storage).toBeDefined();
      expect(cookieManager.storage.name).toBe('test_cookie_manager');
    });

    it('should have empty cookie pool initially', () => {
      expect(cookieManager.cookiePool.size).toBe(0);
    });

    it('should have correct config', () => {
      expect(cookieManager.config.enabled).toBe(true);
      expect(cookieManager.config.farming.enabled).toBe(true);
      expect(cookieManager.config.farming.reputation.enabled).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should create new session when saving', async () => {
      const sessionId = 'test_session_1';

      // Mock page object
      const mockPage = {
        cookies: jest.fn().mockResolvedValue([
          { name: 'cookie1', value: 'value1', domain: '.example.com' },
          { name: 'cookie2', value: 'value2', domain: '.example.com' }
        ]),
        _userAgent: 'Mozilla/5.0 Test',
        _viewport: { width: 1920, height: 1080 }
      };

      await cookieManager.saveSession(mockPage, sessionId, { success: true });

      // Check pool
      expect(cookieManager.cookiePool.has(sessionId)).toBe(true);
      const session = cookieManager.cookiePool.get(sessionId);

      expect(session.sessionId).toBe(sessionId);
      expect(session.cookies.length).toBe(2);
      expect(session.userAgent).toBe('Mozilla/5.0 Test');
      expect(session.reputation.successCount).toBe(1);
      expect(session.reputation.failCount).toBe(0);
    });

    it('should update existing session', async () => {
      const sessionId = 'test_session_2';

      // Create initial session
      const mockPage1 = {
        cookies: jest.fn().mockResolvedValue([
          { name: 'cookie1', value: 'value1' }
        ]),
        _userAgent: 'Test UA',
        _viewport: { width: 1920, height: 1080 }
      };

      await cookieManager.saveSession(mockPage1, sessionId, { success: true });

      // Update with new cookies
      const mockPage2 = {
        cookies: jest.fn().mockResolvedValue([
          { name: 'cookie1', value: 'value1' },
          { name: 'cookie2', value: 'value2' }
        ]),
        _userAgent: 'Test UA',
        _viewport: { width: 1920, height: 1080 }
      };

      await cookieManager.saveSession(mockPage2, sessionId, { success: true });

      const session = cookieManager.cookiePool.get(sessionId);
      expect(session.cookies.length).toBe(2);
      expect(session.reputation.successCount).toBe(2);
    });

    it('should track reputation correctly', async () => {
      const sessionId = 'test_session_3';

      const mockPage = {
        cookies: jest.fn().mockResolvedValue([]),
        _userAgent: 'Test',
        _viewport: {}
      };

      // 3 successes
      await cookieManager.saveSession(mockPage, sessionId, { success: true });
      await cookieManager.saveSession(mockPage, sessionId, { success: true });
      await cookieManager.saveSession(mockPage, sessionId, { success: true });

      // 1 failure
      await cookieManager.saveSession(mockPage, sessionId, { success: false });

      const session = cookieManager.cookiePool.get(sessionId);

      expect(session.reputation.successCount).toBe(3);
      expect(session.reputation.failCount).toBe(1);
      expect(session.reputation.successRate).toBe(0.75);
    });
  });

  describe('Cookie Rotation', () => {
    it('should remove expired cookies', async () => {
      const sessionId = 'expired_session';

      const mockPage = {
        cookies: jest.fn().mockResolvedValue([]),
        _userAgent: 'Test',
        _viewport: {}
      };

      await cookieManager.saveSession(mockPage, sessionId);

      // Manually set expiration to past
      const session = cookieManager.cookiePool.get(sessionId);
      session.metadata.expiresAt = Date.now() - 1000;

      const removed = await cookieManager.rotateCookies();

      expect(removed).toBe(1);
      expect(cookieManager.cookiePool.has(sessionId)).toBe(false);
    });

    it('should remove overused cookies', async () => {
      const sessionId = 'overused_session';

      const mockPage = {
        cookies: jest.fn().mockResolvedValue([]),
        _userAgent: 'Test',
        _viewport: {}
      };

      await cookieManager.saveSession(mockPage, sessionId);

      // Manually set request count to max
      const session = cookieManager.cookiePool.get(sessionId);
      session.metadata.requestCount = cookieManager.config.farming.rotation.requestsPerCookie;

      const removed = await cookieManager.rotateCookies();

      expect(removed).toBe(1);
      expect(cookieManager.cookiePool.has(sessionId)).toBe(false);
    });

    it('should remove low reputation cookies', async () => {
      const sessionId = 'bad_session';

      const mockPage = {
        cookies: jest.fn().mockResolvedValue([]),
        _userAgent: 'Test',
        _viewport: {}
      };

      await cookieManager.saveSession(mockPage, sessionId);

      // Manually set low reputation
      const session = cookieManager.cookiePool.get(sessionId);
      session.reputation.successRate = 0.3; // Below 0.5 threshold

      const removed = await cookieManager.rotateCookies();

      expect(removed).toBe(1);
      expect(cookieManager.cookiePool.has(sessionId)).toBe(false);
    });

    it('should keep healthy cookies', async () => {
      const sessionId = 'healthy_session';

      const mockPage = {
        cookies: jest.fn().mockResolvedValue([]),
        _userAgent: 'Test',
        _viewport: {}
      };

      await cookieManager.saveSession(mockPage, sessionId, { success: true });

      const removed = await cookieManager.rotateCookies();

      expect(removed).toBe(0);
      expect(cookieManager.cookiePool.has(sessionId)).toBe(true);
    });
  });

  describe('Best Cookie Selection', () => {
    beforeEach(async () => {
      // Create 3 sessions with different reputations
      const mockPage = {
        cookies: jest.fn().mockResolvedValue([]),
        _userAgent: 'Test',
        _viewport: {}
      };

      // Session 1: 100% success rate, new
      await cookieManager.saveSession(mockPage, 'session_1', { success: true });
      await cookieManager.saveSession(mockPage, 'session_1', { success: true });

      // Session 2: 75% success rate, older
      await cookieManager.saveSession(mockPage, 'session_2', { success: true });
      await cookieManager.saveSession(mockPage, 'session_2', { success: true });
      await cookieManager.saveSession(mockPage, 'session_2', { success: true });
      await cookieManager.saveSession(mockPage, 'session_2', { success: false });
      const session2 = cookieManager.cookiePool.get('session_2');
      session2.metadata.age = 3600000; // 1 hour old

      // Session 3: 50% success rate, newest
      await cookieManager.saveSession(mockPage, 'session_3', { success: true });
      await cookieManager.saveSession(mockPage, 'session_3', { success: false });
    });

    it('should select cookie with best score', async () => {
      const bestCookie = await cookieManager.getBestCookie();

      expect(bestCookie).toBeDefined();
      // Session 2 should win due to age boost despite lower success rate
      expect(['session_1', 'session_2']).toContain(bestCookie.sessionId);
    });

    it('should exclude expired cookies', async () => {
      // Expire all sessions except one
      const session1 = cookieManager.cookiePool.get('session_1');
      session1.metadata.expiresAt = Date.now() - 1000;

      const session2 = cookieManager.cookiePool.get('session_2');
      session2.metadata.expiresAt = Date.now() - 1000;

      const bestCookie = await cookieManager.getBestCookie();

      expect(bestCookie).toBeDefined();
      expect(bestCookie.sessionId).toBe('session_3');
    });

    it('should return null when no healthy cookies', async () => {
      // Expire all sessions
      for (const [sessionId, session] of cookieManager.cookiePool) {
        session.metadata.expiresAt = Date.now() - 1000;
      }

      const bestCookie = await cookieManager.getBestCookie();

      expect(bestCookie).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should return empty stats when no cookies', async () => {
      const stats = await cookieManager.getStats();

      expect(stats.total).toBe(0);
      expect(stats.healthy).toBe(0);
      expect(stats.averageAge).toBe(0);
      expect(stats.averageSuccessRate).toBe(0);
    });

    it('should calculate stats correctly', async () => {
      const mockPage = {
        cookies: jest.fn().mockResolvedValue([]),
        _userAgent: 'Test',
        _viewport: {}
      };

      // Create 2 healthy sessions
      await cookieManager.saveSession(mockPage, 'session_1', { success: true });
      await cookieManager.saveSession(mockPage, 'session_2', { success: true });
      await cookieManager.saveSession(mockPage, 'session_2', { success: false });

      // Create 1 expired session
      await cookieManager.saveSession(mockPage, 'expired_session');
      const expired = cookieManager.cookiePool.get('expired_session');
      expired.metadata.expiresAt = Date.now() - 1000;

      const stats = await cookieManager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.healthy).toBe(2);
      expect(stats.expired).toBe(1);
      expect(stats.averageSuccessRate).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when farming is disabled', async () => {
      const disabledPlugin = new PuppeteerPlugin({
        cookies: {
          enabled: true,
          farming: {
            enabled: false
          }
        }
      });

      disabledPlugin._importDependencies = jest.fn().mockResolvedValue();
      disabledPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.installPlugin(disabledPlugin);

      await db.start();

      await expect(disabledPlugin.farmCookies('test')).rejects.toThrow(
        'Cookie farming is not enabled'
      );

      await db.stop();
    });

    it('should throw error when getting best cookie with farming disabled', async () => {
      const disabledPlugin = new PuppeteerPlugin({
        cookies: {
          enabled: true,
          farming: {
            enabled: false
          }
        }
      });

      disabledPlugin._importDependencies = jest.fn().mockResolvedValue();
      disabledPlugin._warmupBrowserPool = jest.fn().mockResolvedValue();

      await db.installPlugin(disabledPlugin);
      await db.start();

      await expect(disabledPlugin.cookieManager.getBestCookie()).rejects.toThrow(
        'Cookie farming and reputation must be enabled'
      );

      await db.stop();
    });
  });
});
