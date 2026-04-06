/**
 * SQS CrawlQueue Driver
 *
 * AWS SQS-backed queue. Visited set is in-memory (limitation for distributed use).
 * Peer dependency: @aws-sdk/client-sqs
 */

import type { CrawlQueueItem, CrawlQueueAdapter } from 'recker/scrape/crawl-queue';
import type { AdapterContext } from '../index.js';

export class SqsCrawlQueue implements CrawlQueueAdapter {
  private sqsClient: any;
  private queueUrl: string;
  private visited = new Set<string>();

  constructor(config: Record<string, any>) {
    this.queueUrl = config.queueUrl;
    if (!this.queueUrl) throw new Error('sqs crawl queue driver requires config.queueUrl');
  }

  private async _ensureClient(): Promise<void> {
    if (this.sqsClient) return;
    const { SQSClient } = await import('@aws-sdk/client-sqs');
    this.sqsClient = new SQSClient({});
  }

  async push(item: CrawlQueueItem): Promise<void> {
    await this._ensureClient();
    const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
    await this.sqsClient.send(new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(item),
    }));
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    await this._ensureClient();
    const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
    const entries = items.slice(0, 10).map((item, i) => ({
      Id: String(i),
      MessageBody: JSON.stringify(item),
    }));
    await this.sqsClient.send(new SendMessageBatchCommand({
      QueueUrl: this.queueUrl,
      Entries: entries,
    }));
    if (items.length > 10) {
      await this.pushBatch(items.slice(10));
    }
  }

  async pop(): Promise<CrawlQueueItem | null> {
    await this._ensureClient();
    const { ReceiveMessageCommand, DeleteMessageCommand } = await import('@aws-sdk/client-sqs');
    const res = await this.sqsClient.send(new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    }));
    const msg = res.Messages?.[0];
    if (!msg) return null;

    await this.sqsClient.send(new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: msg.ReceiptHandle,
    }));

    return JSON.parse(msg.Body!);
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
    await this._ensureClient();
    const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
    const res = await this.sqsClient.send(new GetQueueAttributesCommand({
      QueueUrl: this.queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    }));
    return parseInt(res.Attributes?.ApproximateNumberOfMessages || '0');
  }

  async clear(): Promise<void> {
    await this._ensureClient();
    const { PurgeQueueCommand } = await import('@aws-sdk/client-sqs');
    await this.sqsClient.send(new PurgeQueueCommand({ QueueUrl: this.queueUrl }));
    this.visited.clear();
  }

  async close(): Promise<void> {
    this.sqsClient?.destroy?.();
    this.sqsClient = null;
  }
}

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  return new SqsCrawlQueue(config);
}
