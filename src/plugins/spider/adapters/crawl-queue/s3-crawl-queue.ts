/**
 * S3 CrawlQueue Driver
 *
 * s3db resource-backed queue with visited URL tracking.
 * Uses two resources: queue items and visited set.
 */

import type { CrawlQueueItem, CrawlQueueAdapter } from 'recker/scrape/crawl-queue';
import type { AdapterContext } from '../index.js';

export class S3CrawlQueue implements CrawlQueueAdapter {
  private database: any;
  private namespace: string;
  private queueResourceName: string;
  private visitedResourceName: string;
  private queueResource: any = null;
  private visitedResource: any = null;

  constructor(config: Record<string, any>, context: AdapterContext) {
    this.database = context.database;
    this.namespace = context.namespace || 'spider';
    this.queueResourceName = config.queueResourceName || `${this.namespace}_crawl_queue`;
    this.visitedResourceName = config.visitedResourceName || `${this.namespace}_crawl_visited`;
  }

  private async _ensureResources(): Promise<void> {
    if (this.queueResource && this.visitedResource) return;

    this.queueResource = await this.database.createResource({
      name: this.queueResourceName,
      attributes: {
        url: 'string|required',
        depth: 'number',
        priority: 'number',
        discoveredFrom: 'string',
        status: 'string',
      },
      timestamps: true,
    }).catch(() => this.database.getResource(this.queueResourceName));

    this.visitedResource = await this.database.createResource({
      name: this.visitedResourceName,
      attributes: {
        url: 'string|required',
      },
    }).catch(() => this.database.getResource(this.visitedResourceName));
  }

  private _urlHash(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  async push(item: CrawlQueueItem): Promise<void> {
    await this._ensureResources();
    await this.queueResource.insert({
      url: item.url,
      depth: item.depth,
      priority: item.priority || 0,
      discoveredFrom: item.discoveredFrom || '',
      status: 'pending',
    });
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    for (const item of items) {
      await this.push(item);
    }
  }

  async pop(): Promise<CrawlQueueItem | null> {
    await this._ensureResources();

    const results = await this.queueResource.query({ status: 'pending' });
    if (!results || results.length === 0) return null;

    const sorted = results.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
    const item = sorted[0];

    try {
      await this.queueResource.update(item.id, { status: 'processing' });
    } catch {
      return null;
    }

    return {
      url: item.url,
      depth: item.depth || 0,
      priority: item.priority,
      discoveredFrom: item.discoveredFrom || undefined,
    };
  }

  async hasVisited(url: string): Promise<boolean> {
    await this._ensureResources();
    try {
      await this.visitedResource.get(this._urlHash(url));
      return true;
    } catch {
      return false;
    }
  }

  async hasVisitedBatch(urls: string[]): Promise<Set<string>> {
    const visited = new Set<string>();
    const checks = urls.map(async (url) => {
      if (await this.hasVisited(url)) visited.add(url);
    });
    await Promise.all(checks);
    return visited;
  }

  async markVisited(url: string): Promise<void> {
    await this._ensureResources();
    try {
      await this.visitedResource.insert({ id: this._urlHash(url), url });
    } catch {
      // already visited
    }
  }

  async size(): Promise<number> {
    await this._ensureResources();
    const results = await this.queueResource.query({ status: 'pending' });
    return results?.length || 0;
  }

  async clear(): Promise<void> {
    await this._ensureResources();
    const items = await this.queueResource.list();
    for (const item of items || []) {
      await this.queueResource.delete(item.id);
    }
    const visited = await this.visitedResource.list();
    for (const item of visited || []) {
      await this.visitedResource.delete(item.id);
    }
  }

  async close(): Promise<void> {
    // no-op
  }
}

export async function create(config: Record<string, any> = {}, context?: AdapterContext) {
  if (!context?.database) {
    throw new Error('s3 crawl queue driver requires context.database');
  }
  const queue = new S3CrawlQueue(config, context);
  return queue;
}
