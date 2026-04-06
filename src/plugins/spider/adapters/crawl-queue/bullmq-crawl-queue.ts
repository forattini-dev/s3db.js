/**
 * BullMQ CrawlQueue Driver
 *
 * Uses BullMQ jobs as crawl queue items. Visited set backed by Redis SET.
 * Peer dependency: bullmq
 */

import type { CrawlQueueItem, CrawlQueueAdapter } from 'recker/scrape/crawl-queue';
import type { AdapterContext } from '../index.js';

export class BullmqCrawlQueue implements CrawlQueueAdapter {
  private queue: any = null;
  private worker: any = null;
  private pendingItems: CrawlQueueItem[] = [];
  private resolveNext: ((item: CrawlQueueItem) => void) | null = null;
  private queueName: string;
  private connection: Record<string, any>;
  private visitedKey: string;
  private redisClient: any = null;

  constructor(config: Record<string, any>) {
    this.queueName = config.queue || 'spider-crawl';
    this.visitedKey = config.visitedKey || `spider:crawl:visited:${this.queueName}`;
    this.connection = config.connection || { host: 'localhost', port: 6379 };
  }

  private async _ensureQueue(): Promise<void> {
    if (this.queue) return;
    const bullmq: any = await import('bullmq');
    const Queue = bullmq.Queue || bullmq.default?.Queue;
    const Worker = bullmq.Worker || bullmq.default?.Worker;

    this.queue = new Queue(this.queueName, { connection: this.connection });

    this.worker = new Worker(this.queueName, async (job: any) => {
      const item = job.data as CrawlQueueItem;
      if (this.resolveNext) {
        const resolve = this.resolveNext;
        this.resolveNext = null;
        resolve(item);
      } else {
        this.pendingItems.push(item);
      }
    }, { connection: this.connection, concurrency: 1 });
  }

  private async _ensureRedis(): Promise<void> {
    if (this.redisClient) return;
    const ioredis: any = await import('ioredis');
    const Redis = ioredis.default || ioredis;
    this.redisClient = new Redis(this.connection);
  }

  async push(item: CrawlQueueItem): Promise<void> {
    await this._ensureQueue();
    await this.queue.add('crawl', item);
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    await this._ensureQueue();
    await this.queue.addBulk(items.map(item => ({ name: 'crawl', data: item })));
  }

  async pop(): Promise<CrawlQueueItem | null> {
    await this._ensureQueue();
    if (this.pendingItems.length > 0) {
      return this.pendingItems.shift()!;
    }
    return new Promise<CrawlQueueItem | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.resolveNext = null;
        resolve(null);
      }, 2000);
      this.resolveNext = (item) => {
        clearTimeout(timeout);
        resolve(item);
      };
    });
  }

  async hasVisited(url: string): Promise<boolean> {
    await this._ensureRedis();
    return (await this.redisClient.sismember(this.visitedKey, url)) === 1;
  }

  async hasVisitedBatch(urls: string[]): Promise<Set<string>> {
    await this._ensureRedis();
    if (urls.length === 0) return new Set();
    const pipeline = this.redisClient.pipeline();
    for (const url of urls) {
      pipeline.sismember(this.visitedKey, url);
    }
    const results = await pipeline.exec();
    const visited = new Set<string>();
    results.forEach(([err, val]: [Error | null, number], i: number) => {
      if (!err && val === 1) visited.add(urls[i]!);
    });
    return visited;
  }

  async markVisited(url: string): Promise<void> {
    await this._ensureRedis();
    await this.redisClient.sadd(this.visitedKey, url);
  }

  async size(): Promise<number> {
    await this._ensureQueue();
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed');
    return (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);
  }

  async clear(): Promise<void> {
    await this._ensureQueue();
    await this.queue.obliterate({ force: true });
    if (this.redisClient) {
      await this.redisClient.del(this.visitedKey);
    }
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.redisClient?.quit();
    this.worker = null;
    this.queue = null;
    this.redisClient = null;
  }
}

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  return new BullmqCrawlQueue(config);
}
