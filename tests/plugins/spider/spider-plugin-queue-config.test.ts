import { describe, expect, test, vi } from 'vitest';
import { SpiderPlugin } from '../../../src/plugins/spider.plugin.js';

describe('SpiderPlugin queue backend configuration', () => {
  test('should default queue backend to s3', () => {
    const spider = new SpiderPlugin();
    expect(spider.queueBackend).toBe('s3');
  });

  test('should normalize queue consumer aliases', () => {
    const spider = new SpiderPlugin({ queue: { backend: 'consumer' } });
    expect(spider._resolveQueueBackend('consumer')).toBe('queue-consumer');
    expect(spider._resolveQueueBackend('queueconsumer')).toBe('queue-consumer');
    expect(spider._resolveQueueBackend('queue-consumer')).toBe('queue-consumer');
  });

  test('should enqueue through queue helpers when backend is s3', async () => {
    const spider = new SpiderPlugin();
    spider.queueBackend = 's3';

    const enqueue = vi.fn().mockResolvedValue({ id: 'queue-record' });
    const insert = vi.fn().mockResolvedValue({ id: 'insert-record' });

    (spider as any).database = {
      getResource: vi.fn().mockResolvedValue({ enqueue, insert })
    };

    const result = await spider.enqueueTarget({ url: 'https://example.com' });

    expect(enqueue).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(result.id).toBe('queue-record');
  });

  test('should fallback to insert when backend is queue-consumer', async () => {
    const spider = new SpiderPlugin({ queue: { backend: 'queue-consumer' } });
    spider.queueBackend = 'queue-consumer';

    const enqueue = vi.fn().mockResolvedValue({ id: 'queue-record' });
    const insert = vi.fn().mockResolvedValue({ id: 'insert-record' });

    (spider as any).database = {
      getResource: vi.fn().mockResolvedValue({ enqueue, insert })
    };

    const result = await spider.enqueueTarget({ url: 'https://example.com' });

    expect(insert).toHaveBeenCalled();
    expect(result.id).toBe('insert-record');
  });

  test('should expose typed activity catalog helpers', () => {
    const spider = new SpiderPlugin();

    const activities = spider.getAvailableActivities();
    const categories = spider.getActivityCategories();
    const presets = spider.getActivityPresets();
    const preset = spider.getPresetByName('security');
    const validation = spider.validateActivityList(['security_headers', 'missing_activity']);

    expect(Array.isArray(activities)).toBe(true);
    expect(activities[0]).toMatchObject({
      name: expect.any(String),
      category: expect.any(String),
      enabled: expect.any(Boolean)
    });

    expect(categories).toHaveProperty('security');
    expect(categories.security).toMatchObject({
      name: expect.any(String),
      activities: expect.any(Array)
    });

    expect(presets.security).toMatchObject({
      name: 'security',
      activities: expect.any(Array)
    });
    expect(preset).toEqual(presets.security);

    expect(validation.valid).toBe(false);
    expect(validation.invalid).toContain('missing_activity');
  });

  test('should expose discovery and persistence helper shapes without any', () => {
    const spider = new SpiderPlugin({
      persistence: {
        enabled: true,
        saveResults: true,
        saveSEOAnalysis: false,
        saveTechFingerprint: true,
        saveSecurityAnalysis: true,
        saveScreenshots: false,
        savePerformanceMetrics: true
      }
    });

    expect(spider.getDiscoveryStats()).toEqual({ enabled: false });
    expect(spider.getPersistenceConfig()).toEqual({
      enabled: true,
      saveResults: true,
      saveSEOAnalysis: false,
      saveTechFingerprint: true,
      saveSecurityAnalysis: true,
      saveScreenshots: false,
      savePerformanceMetrics: true
    });
  });

  test('should normalize s3 queue status to include backend and running', async () => {
    const spider = new SpiderPlugin();
    spider.queueBackend = 's3';
    spider.queuePlugin = {
      isRunning: true,
      getStats: vi.fn().mockResolvedValue({
        total: 4,
        pending: 2,
        processing: 1,
        completed: 1,
        failed: 0,
        dead: 0
      })
    } as any;

    const status = await spider.getQueueStatus();

    expect(status).toEqual({
      backend: 's3',
      running: true,
      total: 4,
      pending: 2,
      processing: 1,
      completed: 1,
      failed: 0,
      dead: 0
    });
  });

  test('should expose curl-impersonate helper methods', async () => {
    const spider = new SpiderPlugin();

    expect(typeof spider.getCurlImpersonateStatus).toBe('function');
    expect(typeof spider.installCurlImpersonate).toBe('function');
    expect(typeof spider.ensureCurlImpersonate).toBe('function');

    const status = await spider.getCurlImpersonateStatus();
    expect(typeof status.available).toBe('boolean');
  });
});
