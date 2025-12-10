import fs from 'fs';
import path from 'path';
import { tryFn } from '../try-fn.js';
import { PluginStorageError } from '../../errors.js';
export class FilesystemStorageDriver {
    basePath;
    pluginSlug;
    constructor(config, pluginSlug) {
        if (!config?.basePath) {
            throw new PluginStorageError('FilesystemStorageDriver requires basePath in config', {
                operation: 'constructor',
                suggestion: 'Provide a base directory path in config (e.g., { basePath: "./storage" })'
            });
        }
        if (!pluginSlug) {
            throw new PluginStorageError('FilesystemStorageDriver requires pluginSlug', {
                operation: 'constructor',
                suggestion: 'Provide a plugin slug (e.g., "recon", "cache", "audit")'
            });
        }
        this.basePath = config.basePath;
        this.pluginSlug = pluginSlug;
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
    }
    _keyToPath(key) {
        const safePath = key
            .replace(/=/g, '-')
            .replace(/\//g, path.sep);
        return path.join(this.basePath, safePath + '.json');
    }
    async set(key, data, options = {}) {
        const { ttl, metadata = {} } = options;
        const filePath = this._keyToPath(key);
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
        }
        const storageObject = {
            key,
            data,
            metadata: {
                ...metadata,
                createdAt: new Date().toISOString(),
                pluginSlug: this.pluginSlug
            }
        };
        if (ttl) {
            const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
            storageObject.metadata.ttl = ttl;
            storageObject.metadata.expiresAt = expiresAt;
        }
        const tempPath = filePath + '.tmp';
        const [ok, err] = await tryFn(async () => {
            await fs.promises.writeFile(tempPath, JSON.stringify(storageObject, null, 2), 'utf8');
            await fs.promises.rename(tempPath, filePath);
        });
        if (!ok) {
            throw new PluginStorageError(`Failed to save data: ${err.message}`, {
                operation: 'set',
                key,
                path: filePath,
                suggestion: 'Check filesystem permissions and available disk space'
            });
        }
        const etag = Buffer.from(`${key}-${storageObject.metadata.createdAt}`).toString('base64');
        return { ETag: etag };
    }
    async get(key) {
        const filePath = this._keyToPath(key);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const [ok, err, content] = await tryFn(async () => {
            return await fs.promises.readFile(filePath, 'utf8');
        });
        if (!ok) {
            throw new PluginStorageError(`Failed to read data: ${err.message}`, {
                operation: 'get',
                key,
                path: filePath,
                suggestion: 'Check filesystem permissions'
            });
        }
        let storageObject;
        try {
            storageObject = JSON.parse(content);
        }
        catch (parseErr) {
            throw new PluginStorageError(`Failed to parse JSON: ${parseErr.message}`, {
                operation: 'get',
                key,
                path: filePath,
                suggestion: 'File may be corrupted. Check file contents.'
            });
        }
        if (storageObject.metadata?.expiresAt) {
            const expiresAt = new Date(storageObject.metadata.expiresAt);
            if (expiresAt < new Date()) {
                await this.delete(key);
                return null;
            }
        }
        return storageObject.data;
    }
    async delete(key) {
        const filePath = this._keyToPath(key);
        if (!fs.existsSync(filePath)) {
            return false;
        }
        const [ok, err] = await tryFn(async () => {
            await fs.promises.unlink(filePath);
        });
        if (!ok) {
            throw new PluginStorageError(`Failed to delete data: ${err.message}`, {
                operation: 'delete',
                key,
                path: filePath,
                suggestion: 'Check filesystem permissions'
            });
        }
        return true;
    }
    async list(options = {}) {
        const { prefix = '', limit } = options;
        const keys = [];
        const walk = async (dir, _currentPrefix = '') => {
            if (limit && keys.length >= limit)
                return;
            const [ok, , entries] = await tryFn(async () => {
                return await fs.promises.readdir(dir, { withFileTypes: true });
            });
            if (!ok) {
                return;
            }
            for (const entry of entries) {
                if (limit && keys.length >= limit)
                    break;
                const entryPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const newPrefix = _currentPrefix ? `${_currentPrefix}/${entry.name}` : entry.name;
                    await walk(entryPath, newPrefix);
                }
                else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
                    const relativePath = path.relative(this.basePath, entryPath);
                    const key = relativePath
                        .replace(new RegExp(`\\${path.sep}`, 'g'), '/')
                        .replace(/\.json$/, '')
                        .replace(/-/g, '=');
                    if (!prefix || key.startsWith(prefix)) {
                        keys.push(key);
                    }
                }
            }
        };
        await walk(this.basePath);
        return keys;
    }
    async deleteAll() {
        const keys = await this.list();
        let count = 0;
        for (const key of keys) {
            const deleted = await this.delete(key);
            if (deleted)
                count++;
        }
        return count;
    }
}
//# sourceMappingURL=filesystem-driver.js.map