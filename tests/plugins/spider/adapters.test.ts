import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { createCrawlQueue, createCrawlStorage, createProxyAdapter } from '#src/plugins/spider/adapters/index.js';

describe('Spider Adapters', () => {

  describe('CrawlQueue Factories', () => {
    test('creates memory crawl queue', async () => {
      const queue = await createCrawlQueue('memory');
      expect(queue).toBeDefined();
      expect(typeof queue.push).toBe('function');
      expect(typeof queue.pop).toBe('function');
      expect(typeof queue.hasVisited).toBe('function');
      expect(typeof queue.markVisited).toBe('function');
      expect(typeof queue.size).toBe('function');
      expect(typeof queue.clear).toBe('function');
    });

    test('throws on unknown driver', async () => {
      await expect(createCrawlQueue('nope')).rejects.toThrow(/Unknown crawl queue driver/);
    });
  });

  describe('CrawlStorage Factories', () => {
    test('creates memory crawl storage', async () => {
      const storage = await createCrawlStorage('memory');
      expect(storage).toBeDefined();
      expect(typeof storage.saveResult).toBe('function');
      expect(typeof storage.saveError).toBe('function');
      expect(typeof storage.getResultCount).toBe('function');
      expect(typeof storage.getResults).toBe('function');
      expect(typeof storage.getErrors).toBe('function');
      expect(typeof storage.clear).toBe('function');
    });

    test('throws on unknown driver', async () => {
      await expect(createCrawlStorage('nope')).rejects.toThrow(/Unknown crawl storage driver/);
    });
  });

  describe('ProxyAdapter Factories', () => {
    test('creates memory proxy adapter', async () => {
      const proxy = await createProxyAdapter('memory', { proxies: ['http://p1:8080', 'http://p2:8080'] });
      expect(proxy).toBeDefined();
      expect(typeof proxy.getProxy).toBe('function');
    });

    test('memory proxy requires proxies array', async () => {
      await expect(createProxyAdapter('memory', {})).rejects.toThrow(/proxies/);
    });

    test('throws on unknown driver', async () => {
      await expect(createProxyAdapter('nope')).rejects.toThrow(/Unknown proxy driver/);
    });
  });

  describe('Memory CrawlQueue - round trip', () => {
    let queue: any;

    beforeEach(async () => {
      queue = await createCrawlQueue('memory');
    });

    test('push and pop items', async () => {
      await queue.push({ url: 'https://a.com', depth: 0 });
      await queue.push({ url: 'https://b.com', depth: 1 });

      expect(await queue.size()).toBe(2);

      const item = await queue.pop();
      expect(item).not.toBeNull();
      expect(item.url).toBe('https://a.com');
      expect(await queue.size()).toBe(1);
    });

    test('pop returns null when empty', async () => {
      expect(await queue.pop()).toBeNull();
    });

    test('visited tracking', async () => {
      expect(await queue.hasVisited('https://a.com')).toBe(false);
      await queue.markVisited('https://a.com');
      expect(await queue.hasVisited('https://a.com')).toBe(true);
    });

    test('pushBatch and hasVisitedBatch', async () => {
      if (!queue.pushBatch) return;

      await queue.pushBatch([
        { url: 'https://a.com', depth: 0 },
        { url: 'https://b.com', depth: 0 },
      ]);
      expect(await queue.size()).toBe(2);

      await queue.markVisited('https://a.com');

      if (queue.hasVisitedBatch) {
        const visited = await queue.hasVisitedBatch(['https://a.com', 'https://b.com', 'https://c.com']);
        expect(visited.has('https://a.com')).toBe(true);
        expect(visited.has('https://b.com')).toBe(false);
        expect(visited.has('https://c.com')).toBe(false);
      }
    });

    test('clear resets queue and visited', async () => {
      await queue.push({ url: 'https://a.com', depth: 0 });
      await queue.markVisited('https://a.com');

      await queue.clear();
      expect(await queue.size()).toBe(0);
      expect(await queue.hasVisited('https://a.com')).toBe(false);
    });
  });

  describe('Memory CrawlStorage - round trip', () => {
    let storage: any;

    beforeEach(async () => {
      storage = await createCrawlStorage('memory');
    });

    test('save and retrieve results', async () => {
      await storage.saveResult({ url: 'https://a.com', status: 200, title: 'A', depth: 0, links: [], duration: 100 });
      await storage.saveResult({ url: 'https://b.com', status: 200, title: 'B', depth: 1, links: [], duration: 200 });

      expect(await storage.getResultCount()).toBe(2);

      const results = await storage.getResults();
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://a.com');
    });

    test('save and retrieve errors', async () => {
      await storage.saveError({ url: 'https://err.com', error: 'timeout' });

      const errors = await storage.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].url).toBe('https://err.com');
      expect(errors[0].error).toBe('timeout');
    });

    test('clear resets everything', async () => {
      await storage.saveResult({ url: 'https://a.com', status: 200, title: 'A', depth: 0, links: [], duration: 100 });
      await storage.saveError({ url: 'https://err.com', error: 'timeout' });

      await storage.clear();
      expect(await storage.getResultCount()).toBe(0);
      expect(await storage.getErrors()).toHaveLength(0);
    });
  });

  describe('Memory ProxyAdapter - rotation', () => {
    test('rotates through proxies round-robin', async () => {
      const proxy = await createProxyAdapter('memory', {
        proxies: ['http://p1:8080', 'http://p2:8080', 'http://p3:8080']
      });

      const first = await proxy.getProxy();
      const second = await proxy.getProxy();
      const third = await proxy.getProxy();
      const fourth = await proxy.getProxy();

      expect(first).toBe('http://p1:8080');
      expect(second).toBe('http://p2:8080');
      expect(third).toBe('http://p3:8080');
      expect(fourth).toBe('http://p1:8080');
    });
  });

  describe('Filesystem CrawlStorage', () => {
    const testDir = path.join(os.tmpdir(), `s3db-spider-fs-test-${Date.now()}`);

    afterAll(async () => {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    test('json format: save and retrieve results', async () => {
      const dir = path.join(testDir, 'json');
      const storage = await createCrawlStorage('filesystem', { directory: dir, format: 'json' });

      await storage.saveResult({ url: 'https://a.com', status: 200, title: 'A', depth: 0, links: [], duration: 100 });
      await storage.saveResult({ url: 'https://b.com', status: 200, title: 'B', depth: 0, links: [], duration: 200 });

      expect(await storage.getResultCount()).toBe(2);
      const results = await storage.getResults();
      expect(results).toHaveLength(2);
    });

    test('json format: save and retrieve errors', async () => {
      const dir = path.join(testDir, 'json-errors');
      const storage = await createCrawlStorage('filesystem', { directory: dir, format: 'json' });

      await storage.saveError({ url: 'https://err.com', error: 'failed' });
      const errors = await storage.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBe('failed');
    });

    test('jsonl format: save and retrieve', async () => {
      const dir = path.join(testDir, 'jsonl');
      const storage = await createCrawlStorage('filesystem', { directory: dir, format: 'jsonl' });

      await storage.saveResult({ url: 'https://a.com', status: 200, title: 'A', depth: 0, links: [], duration: 100 });
      await storage.saveResult({ url: 'https://b.com', status: 200, title: 'B', depth: 0, links: [], duration: 200 });

      expect(await storage.getResultCount()).toBe(2);
      const results = await storage.getResults();
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://a.com');
    });

    test('clear removes all data', async () => {
      const dir = path.join(testDir, 'clear');
      const storage = await createCrawlStorage('filesystem', { directory: dir, format: 'json' });

      await storage.saveResult({ url: 'https://a.com', status: 200, title: 'A', depth: 0, links: [], duration: 100 });
      await storage.clear();
      expect(await storage.getResultCount()).toBe(0);
    });
  });
});
