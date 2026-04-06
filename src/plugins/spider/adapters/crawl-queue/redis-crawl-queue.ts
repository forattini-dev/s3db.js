/**
 * Redis List CrawlQueue Driver
 *
 * Uses ioredis LPUSH/BRPOP for FIFO queue. Visited set backed by Redis SET.
 * Peer dependency: ioredis
 */

import type { CrawlQueueItem, CrawlQueueAdapter } from 'recker/scrape/crawl-queue';
import type { AdapterContext } from '../index.js';

export class RedisCrawlQueue implements CrawlQueueAdapter {
  private client: any = null;
  private queueKey: string;
  private visitedKey: string;
  private redisConfig: Record<string, any>;

  constructor(config: Record<string, any>) {
    this.queueKey = config.key || 'spider:crawl:queue';
    this.visitedKey = config.visitedKey || 'spider:crawl:visited';
    this.redisConfig = config;
  }

  private async _ensureClient(): Promise<void> {
    if (this.client) return;
    const ioredis: any = await import('ioredis');
    const Redis = ioredis.default || ioredis;
    this.client = new Redis({
      host: this.redisConfig.host || 'localhost',
      port: this.redisConfig.port || 6379,
      password: this.redisConfig.password,
      db: this.redisConfig.db || 0,
      ...this.redisConfig.redisOptions,
    });
  }

  async push(item: CrawlQueueItem): Promise<void> {
    await this._ensureClient();
    await this.client.lpush(this.queueKey, JSON.stringify(item));
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    await this._ensureClient();
    if (items.length === 0) return;
    const pipeline = this.client.pipeline();
    for (const item of items) {
      pipeline.lpush(this.queueKey, JSON.stringify(item));
    }
    await pipeline.exec();
  }

  async pop(): Promise<CrawlQueueItem | null> {
    await this._ensureClient();
    const result = await this.client.rpop(this.queueKey);
    if (!result) return null;
    return JSON.parse(result);
  }

  async hasVisited(url: string): Promise<boolean> {
    await this._ensureClient();
    return (await this.client.sismember(this.visitedKey, url)) === 1;
  }

  async hasVisitedBatch(urls: string[]): Promise<Set<string>> {
    await this._ensureClient();
    if (urls.length === 0) return new Set();
    const pipeline = this.client.pipeline();
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
    await this._ensureClient();
    await this.client.sadd(this.visitedKey, url);
  }

  async size(): Promise<number> {
    await this._ensureClient();
    return await this.client.llen(this.queueKey);
  }

  async clear(): Promise<void> {
    await this._ensureClient();
    await this.client.del(this.queueKey, this.visitedKey);
  }

  async close(): Promise<void> {
    await this.client?.quit();
    this.client = null;
  }
}

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  return new RedisCrawlQueue(config);
}
