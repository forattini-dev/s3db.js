/**
 * BullMQ CrawlStorage Driver
 *
 * Uses BullMQ completed/failed jobs as crawl storage.
 * Results stored as completed jobs, errors as failed jobs.
 * Peer dependency: bullmq
 */

import type { CrawlStorageAdapter } from 'recker/scrape/crawl-storage';
import type { AdapterContext } from '../index.js';

export class BullmqCrawlStorage implements CrawlStorageAdapter {
  private queue: any = null;
  private queueName: string;
  private connection: Record<string, any>;

  constructor(config: Record<string, any>) {
    this.queueName = config.queue || 'spider-crawl-results';
    this.connection = config.connection || { host: 'localhost', port: 6379 };
  }

  private async _ensureQueue(): Promise<void> {
    if (this.queue) return;
    const bullmq: any = await import('bullmq');
    const Queue = bullmq.Queue || bullmq.default?.Queue;
    this.queue = new Queue(this.queueName, { connection: this.connection });
  }

  async saveResult(result: any): Promise<void> {
    await this._ensureQueue();
    const job = await this.queue.add('result', result);
    await job.moveToCompleted(result, job.token || '0', false);
  }

  async saveError(error: { url: string; error: string }): Promise<void> {
    await this._ensureQueue();
    const job = await this.queue.add('error', error);
    await job.moveToFailed(new Error(error.error), job.token || '0', false);
  }

  async getResultCount(): Promise<number> {
    await this._ensureQueue();
    const counts = await this.queue.getJobCounts('completed');
    return counts.completed || 0;
  }

  async getResults(): Promise<any[]> {
    await this._ensureQueue();
    const jobs = await this.queue.getCompleted();
    return jobs.map((j: any) => j.data);
  }

  async getErrors(): Promise<Array<{ url: string; error: string }>> {
    await this._ensureQueue();
    const jobs = await this.queue.getFailed();
    return jobs.map((j: any) => j.data);
  }

  async clear(): Promise<void> {
    await this._ensureQueue();
    await this.queue.obliterate({ force: true });
  }

  async close(): Promise<void> {
    await this.queue?.close();
    this.queue = null;
  }
}

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  return new BullmqCrawlStorage(config);
}
