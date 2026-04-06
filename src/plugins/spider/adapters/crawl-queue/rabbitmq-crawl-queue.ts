/**
 * RabbitMQ CrawlQueue Driver
 *
 * RabbitMQ-backed queue. Visited set is in-memory (limitation for distributed use).
 * Peer dependency: amqplib
 */

import type { CrawlQueueItem, CrawlQueueAdapter } from 'recker/scrape/crawl-queue';
import type { AdapterContext } from '../index.js';

export class RabbitmqCrawlQueue implements CrawlQueueAdapter {
  private connection: any = null;
  private channel: any = null;
  private amqpUrl: string;
  private queueName: string;
  private prefetch: number;
  private visited = new Set<string>();

  constructor(config: Record<string, any>) {
    this.amqpUrl = config.amqpUrl || 'amqp://localhost';
    this.queueName = config.queue || 'spider_crawl_queue';
    this.prefetch = config.prefetch || 1;
  }

  private async _ensureChannel(): Promise<void> {
    if (this.channel) return;
    // @ts-ignore - amqplib does not have type definitions
    const amqplib: any = await import('amqplib');
    const connect = amqplib.connect || amqplib.default?.connect;
    this.connection = await connect(this.amqpUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue(this.queueName, { durable: true });
    await this.channel.prefetch(this.prefetch);
  }

  async push(item: CrawlQueueItem): Promise<void> {
    await this._ensureChannel();
    this.channel.sendToQueue(
      this.queueName,
      Buffer.from(JSON.stringify(item)),
      { persistent: true }
    );
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    for (const item of items) {
      await this.push(item);
    }
  }

  async pop(): Promise<CrawlQueueItem | null> {
    await this._ensureChannel();
    const msg = await this.channel.get(this.queueName, { noAck: true });
    if (!msg) return null;
    return JSON.parse(msg.content.toString());
  }

  async hasVisited(url: string): Promise<boolean> {
    return this.visited.has(url);
  }

  async hasVisitedBatch(urls: string[]): Promise<Set<string>> {
    return new Set(urls.filter(u => this.visited.has(u)));
  }

  async markVisited(url: string): Promise<void> {
    this.visited.add(url);
  }

  async size(): Promise<number> {
    await this._ensureChannel();
    const info = await this.channel.checkQueue(this.queueName);
    return info.messageCount;
  }

  async clear(): Promise<void> {
    await this._ensureChannel();
    await this.channel.purgeQueue(this.queueName);
    this.visited.clear();
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.channel = null;
    this.connection = null;
  }
}

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  return new RabbitmqCrawlQueue(config);
}
