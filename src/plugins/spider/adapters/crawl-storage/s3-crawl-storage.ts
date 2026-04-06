/**
 * S3 CrawlStorage Driver
 *
 * s3db resource-backed storage for crawl results and errors.
 */

import type { CrawlStorageAdapter } from 'recker/scrape/crawl-storage';
import type { AdapterContext } from '../index.js';

export class S3CrawlStorage implements CrawlStorageAdapter {
  private database: any;
  private namespace: string;
  private resultsResourceName: string;
  private errorsResourceName: string;
  private resultsResource: any = null;
  private errorsResource: any = null;

  constructor(config: Record<string, any>, context: AdapterContext) {
    this.database = context.database;
    this.namespace = context.namespace || 'spider';
    this.resultsResourceName = config.resultsResourceName || `${this.namespace}_crawl_results`;
    this.errorsResourceName = config.errorsResourceName || `${this.namespace}_crawl_errors`;
  }

  private async _ensureResources(): Promise<void> {
    if (this.resultsResource && this.errorsResource) return;

    this.resultsResource = await this.database.createResource({
      name: this.resultsResourceName,
      attributes: {
        url: 'string|required',
        status: 'number',
        title: 'string',
        depth: 'number',
        duration: 'number',
        data: 'json',
      },
      behavior: 'body-only',
      timestamps: true,
    }).catch(() => this.database.getResource(this.resultsResourceName));

    this.errorsResource = await this.database.createResource({
      name: this.errorsResourceName,
      attributes: {
        url: 'string|required',
        error: 'string|required',
      },
      timestamps: true,
    }).catch(() => this.database.getResource(this.errorsResourceName));
  }

  async saveResult(result: any): Promise<void> {
    await this._ensureResources();
    await this.resultsResource.insert({
      url: result.url,
      status: result.status,
      title: result.title,
      depth: result.depth,
      duration: result.duration,
      data: result,
    });
  }

  async saveError(error: { url: string; error: string }): Promise<void> {
    await this._ensureResources();
    await this.errorsResource.insert({
      url: error.url,
      error: error.error,
    });
  }

  async getResultCount(): Promise<number> {
    await this._ensureResources();
    const results = await this.resultsResource.list();
    return results?.length || 0;
  }

  async getResults(): Promise<any[]> {
    await this._ensureResources();
    const results = await this.resultsResource.list();
    return (results || []).map((r: any) => r.data || r);
  }

  async getErrors(): Promise<Array<{ url: string; error: string }>> {
    await this._ensureResources();
    const errors = await this.errorsResource.list();
    return (errors || []).map((e: any) => ({ url: e.url, error: e.error }));
  }

  async clear(): Promise<void> {
    await this._ensureResources();
    const results = await this.resultsResource.list();
    for (const item of results || []) {
      await this.resultsResource.delete(item.id);
    }
    const errors = await this.errorsResource.list();
    for (const item of errors || []) {
      await this.errorsResource.delete(item.id);
    }
  }

  async close(): Promise<void> {
    // no-op
  }
}

export async function create(config: Record<string, any> = {}, context?: AdapterContext) {
  if (!context?.database) {
    throw new Error('s3 crawl storage driver requires context.database');
  }
  return new S3CrawlStorage(config, context);
}
