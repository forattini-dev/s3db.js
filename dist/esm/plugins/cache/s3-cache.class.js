import zlib from "node:zlib";
import { PluginStorage } from "../../concerns/plugin-storage.js";
import { Cache } from "./cache.class.js";
export class S3Cache extends Cache {
    client;
    keyPrefix;
    ttlMs;
    ttlSeconds;
    storage;
    constructor({ client, keyPrefix = 'cache', ttl = 0, prefix = undefined, enableCompression = true, compressionThreshold = 1024 }) {
        super();
        this.client = client;
        this.keyPrefix = keyPrefix;
        this.ttlMs = typeof ttl === 'number' && ttl > 0 ? ttl : 0;
        this.ttlSeconds = this.ttlMs > 0 ? Math.ceil(this.ttlMs / 1000) : 0;
        this.config.ttl = this.ttlMs;
        this.config.client = client;
        this.config.prefix = prefix !== undefined ? prefix : keyPrefix + (keyPrefix.endsWith('/') ? '' : '/');
        this.config.enableCompression = enableCompression;
        this.config.compressionThreshold = compressionThreshold;
        this.storage = new PluginStorage(client, 'cache');
    }
    _compressData(data) {
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
    _decompressData(storedData) {
        if (!storedData || !storedData.compressed) {
            return storedData && storedData.data ? JSON.parse(storedData.data) : null;
        }
        const buffer = Buffer.from(storedData.data, 'base64');
        const decompressed = zlib.unzipSync(buffer).toString();
        return JSON.parse(decompressed);
    }
    async _set(key, data) {
        const compressed = this._compressData(data);
        await this.storage.set(this.storage.getPluginKey(null, this.keyPrefix, key), compressed, {
            ttl: this.ttlSeconds,
            behavior: 'body-only',
            contentType: compressed.compressed ? 'application/gzip' : 'application/json'
        });
    }
    async _get(key) {
        const storedData = await this.storage.get(this.storage.getPluginKey(null, this.keyPrefix, key));
        if (!storedData)
            return null;
        return this._decompressData(storedData);
    }
    async _del(key) {
        await this.storage.delete(this.storage.getPluginKey(null, this.keyPrefix, key));
        return true;
    }
    async _clear(prefix) {
        const basePrefix = `plugin=cache/${this.keyPrefix}`;
        const listPrefix = prefix
            ? `${basePrefix}/${prefix}`
            : basePrefix;
        const allKeys = await this.client.getAllKeys({ prefix: listPrefix });
        for (const key of allKeys) {
            if (!prefix || key.startsWith(`${basePrefix}/${prefix}`)) {
                await this.storage.delete(key);
            }
        }
        return true;
    }
    async size() {
        const keys = await this.keys();
        return keys.length;
    }
    async keys() {
        const pluginPrefix = `plugin=cache/${this.keyPrefix}`;
        const allKeys = await this.client.getAllKeys({ prefix: pluginPrefix });
        const prefixToRemove = `plugin=cache/${this.keyPrefix}/`;
        return allKeys.map(k => k.startsWith(prefixToRemove) ? k.slice(prefixToRemove.length) : k);
    }
}
export default S3Cache;
//# sourceMappingURL=s3-cache.class.js.map