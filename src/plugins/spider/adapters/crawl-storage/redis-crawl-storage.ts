/**
 * Redis CrawlStorage Driver
 *
 * Uses Redis hashes for results and errors storage.
 * Peer dependency: ioredis
 */

import type { CrawlStorageAdapter } from 'recker/scrape/crawl-storage';
import type { AdapterContext } from '../index.js';

export class RedisCrawlStorage implements CrawlStorageAdapter {
  private client: any = null;
  private resultsKey: string;
  private errorsKey: string;
  private redisConfig: Record<string, any>;

  constructor(config: Record<string, any>) {
    this.resultsKey = config.resultsKey || 'spider:crawl:results';
    this.errorsKey = config.errorsKey || 'spider:crawl:errors';
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

  async saveResult(result: any): Promise<void> {
    await this._ensureClient();
    const key = result.url || result.id || String(Date.now());
    await this.client.hset(this.resultsKey, key, JSON.stringify(result));
  }

  async saveError(error: { url: string; error: string }): Promise<void> {
    await this._ensureClient();
    await this.client.hset(this.errorsKey, error.url, JSON.stringify(error));
  }

  async getResultCount(): Promise<number> {
    await this._ensureClient();
    return await this.client.hlen(this.resultsKey);
  }

  async getResults(): Promise<any[]> {
    await this._ensureClient();
    const all = await this.client.hgetall(this.resultsKey);
    return Object.values(all).map((v: any) => JSON.parse(v));
  }

  async getErrors(): Promise<Array<{ url: string; error: string }>> {
    await this._ensureClient();
    const all = await this.client.hgetall(this.errorsKey);
    return Object.values(all).map((v: any) => JSON.parse(v));
  }

  async clear(): Promise<void> {
    await this._ensureClient();
    await this.client.del(this.resultsKey, this.errorsKey);
  }

  async close(): Promise<void> {
    await this.client?.quit();
    this.client = null;
  }
}

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  return new RedisCrawlStorage(config);
}
