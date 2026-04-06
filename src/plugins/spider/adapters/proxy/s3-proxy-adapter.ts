/**
 * S3 Proxy Adapter Driver
 *
 * s3db resource-backed proxy list with health tracking.
 * Round-robin among healthy proxies, with success/failure counters.
 */

import type { ProxyAdapter } from 'recker/scrape/proxy-adapter';
import type { AdapterContext } from '../index.js';

export class S3ProxyAdapter implements ProxyAdapter {
  private database: any;
  private namespace: string;
  private resourceName: string;
  private resource: any = null;
  private index = 0;
  private failureThreshold: number;
  private proxies: string[];

  constructor(config: Record<string, any>, context: AdapterContext) {
    this.database = context.database;
    this.namespace = context.namespace || 'spider';
    this.resourceName = config.resourceName || `${this.namespace}_proxies`;
    this.failureThreshold = config.failureThreshold || 5;
    this.proxies = config.proxies || [];
  }

  private async _ensureResource(): Promise<void> {
    if (this.resource) return;

    this.resource = await this.database.createResource({
      name: this.resourceName,
      attributes: {
        url: 'string|required',
        successCount: 'number',
        failureCount: 'number',
        isHealthy: 'boolean',
        lastUsed: 'datetime',
        lastSuccess: 'datetime',
        lastFailure: 'datetime',
      },
      timestamps: true,
    }).catch(() => this.database.getResource(this.resourceName));

    if (this.proxies.length > 0) {
      await this._seedProxies();
    }
  }

  private async _seedProxies(): Promise<void> {
    for (const url of this.proxies) {
      try {
        await this.resource.insert({
          url,
          successCount: 0,
          failureCount: 0,
          isHealthy: true,
        });
      } catch {
        // already exists
      }
    }
  }

  async getProxy(): Promise<string | null> {
    await this._ensureResource();

    const all = await this.resource.list();
    if (!all || all.length === 0) return null;

    const healthy = all.filter((p: any) => p.isHealthy !== false);
    const pool = healthy.length > 0 ? healthy : all;

    const proxy = pool[this.index % pool.length];
    this.index++;

    await this.resource.update(proxy.id, { lastUsed: new Date().toISOString() });

    return proxy.url;
  }

  async reportResult(proxy: string, success: boolean): Promise<void> {
    await this._ensureResource();

    const all = await this.resource.list();
    const record = (all || []).find((p: any) => p.url === proxy);
    if (!record) return;

    const now = new Date().toISOString();
    const updates: Record<string, any> = {};

    if (success) {
      updates.successCount = (record.successCount || 0) + 1;
      updates.lastSuccess = now;
      updates.failureCount = 0;
      updates.isHealthy = true;
    } else {
      updates.failureCount = (record.failureCount || 0) + 1;
      updates.lastFailure = now;
      if (updates.failureCount >= this.failureThreshold) {
        updates.isHealthy = false;
      }
    }

    await this.resource.update(record.id, updates);
  }

  async close(): Promise<void> {
    // no-op
  }
}

export async function create(config: Record<string, any> = {}, context?: AdapterContext) {
  if (!context?.database) {
    throw new Error('s3 proxy driver requires context.database');
  }
  return new S3ProxyAdapter(config, context);
}
