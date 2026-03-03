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

  test('should expose curl-impersonate helper methods', async () => {
    const spider = new SpiderPlugin();

    expect(typeof spider.getCurlImpersonateStatus).toBe('function');
    expect(typeof spider.installCurlImpersonate).toBe('function');
    expect(typeof spider.ensureCurlImpersonate).toBe('function');

    const status = await spider.getCurlImpersonateStatus();
    expect(typeof status.available).toBe('boolean');
  });
});
