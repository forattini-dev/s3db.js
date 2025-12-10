import zlib from "node:zlib";
import { PluginStorage, type PluginStorageSetOptions, type PluginClient } from "../../concerns/plugin-storage.js";
import { Cache, type CacheConfig } from "./cache.class.js";

export interface S3CacheConfig extends CacheConfig {
  client: unknown;
  keyPrefix?: string;
  ttl?: number;
  prefix?: string;
  enableCompression?: boolean;
  compressionThreshold?: number;
}

interface CompressedData {
  [index: string]: unknown;
  data: string;
  compressed: boolean;
  originalSize: number;
  compressedSize?: number;
  compressionRatio?: string;
}

export class S3Cache extends Cache {
  declare config: S3CacheConfig;
  client: PluginClient;
  keyPrefix: string;
  ttlMs: number;
  ttlSeconds: number;
  storage: PluginStorage;

  constructor({
    client,
    keyPrefix = 'cache',
    ttl = 0,
    prefix = undefined,
    enableCompression = true,
    compressionThreshold = 1024
  }: S3CacheConfig) {
    super();
    this.client = client as PluginClient;
    this.keyPrefix = keyPrefix;
    this.ttlMs = typeof ttl === 'number' && ttl > 0 ? ttl : 0;
    this.ttlSeconds = this.ttlMs > 0 ? Math.ceil(this.ttlMs / 1000) : 0;
    this.config.ttl = this.ttlMs;
    this.config.client = client;
    this.config.prefix = prefix !== undefined ? prefix : keyPrefix + (keyPrefix.endsWith('/') ? '' : '/');
    this.config.enableCompression = enableCompression;
    this.config.compressionThreshold = compressionThreshold;

    this.storage = new PluginStorage(client as PluginClient, 'cache');
  }

  private _compressData(data: unknown): CompressedData {
    const jsonString = JSON.stringify(data);

    if (!this.config.enableCompression || jsonString.length < (this.config.compressionThreshold ?? 1024)) {
      return {
        data: jsonString,
        compressed: false,
        originalSize: jsonString.length
      };
    }

    const compressed = zlib.gzipSync(jsonString).toString('base64');
    return {
      data: compressed,
      compressed: true,
      originalSize: jsonString.length,
      compressedSize: compressed.length,
      compressionRatio: (compressed.length / jsonString.length).toFixed(2)
    };
  }

  private _decompressData(storedData: CompressedData | null): unknown {
    if (!storedData || !storedData.compressed) {
      return storedData && storedData.data ? JSON.parse(storedData.data) : null;
    }

    const buffer = Buffer.from(storedData.data, 'base64');
    const decompressed = zlib.unzipSync(buffer).toString();
    return JSON.parse(decompressed);
  }

  protected override async _set(key: string, data: unknown): Promise<void> {
    const compressed = this._compressData(data);

    await this.storage.set(
      this.storage.getPluginKey(null, this.keyPrefix, key),
      compressed as unknown as Record<string, unknown>,
      {
        ttl: this.ttlSeconds,
        behavior: 'body-only',
        contentType: compressed.compressed ? 'application/gzip' : 'application/json'
      } as PluginStorageSetOptions
    );
  }

  protected override async _get(key: string): Promise<unknown> {
    const storedData = await this.storage.get(
      this.storage.getPluginKey(null, this.keyPrefix, key)
    ) as CompressedData | null;

    if (!storedData) return null;

    return this._decompressData(storedData);
  }

  protected override async _del(key: string): Promise<unknown> {
    await this.storage.delete(
      this.storage.getPluginKey(null, this.keyPrefix, key)
    );
    return true;
  }

  protected override async _clear(prefix?: string): Promise<unknown> {
    const basePrefix = `plugin=cache/${this.keyPrefix}`;
    const listPrefix = prefix
      ? `${basePrefix}/${prefix}`
      : basePrefix;

    const allKeys = await (this.client as unknown as { getAllKeys(params: { prefix: string }): Promise<string[]> }).getAllKeys({ prefix: listPrefix });

    for (const key of allKeys) {
      if (!prefix || key.startsWith(`${basePrefix}/${prefix}`)) {
        await this.storage.delete(key);
      }
    }

    return true;
  }

  async size(): Promise<number> {
    const keys = await this.keys();
    return keys.length;
  }

  async keys(): Promise<string[]> {
    const pluginPrefix = `plugin=cache/${this.keyPrefix}`;
    const allKeys = await (this.client as unknown as { getAllKeys(params: { prefix: string }): Promise<string[]> }).getAllKeys({ prefix: pluginPrefix });

    const prefixToRemove = `plugin=cache/${this.keyPrefix}/`;
    return allKeys.map(k => k.startsWith(prefixToRemove) ? k.slice(prefixToRemove.length) : k);
  }
}

export default S3Cache;
