import path from 'path';
import { rm as rmdir, readdir, stat, writeFile, readFile } from 'fs/promises';
import { FilesystemCache } from './filesystem-cache.class.js';
import tryFn from '../../concerns/try-fn.js';
import { CacheError } from '../cache.errors.js';
export class PartitionAwareFilesystemCache extends FilesystemCache {
    partitionStrategy;
    trackUsage;
    preloadRelated;
    preloadThreshold;
    maxCacheSize;
    usageStatsFile;
    partitionUsage;
    constructor({ partitionStrategy = 'hierarchical', trackUsage = true, preloadRelated = false, preloadThreshold = 10, maxCacheSize = null, usageStatsFile = 'partition-usage.json', ...config }) {
        super(config);
        this.partitionStrategy = partitionStrategy;
        this.trackUsage = trackUsage;
        this.preloadRelated = preloadRelated;
        this.preloadThreshold = preloadThreshold;
        this.maxCacheSize = maxCacheSize;
        this.usageStatsFile = path.join(this.directory, usageStatsFile);
        this.partitionUsage = new Map();
        this.loadUsageStats();
    }
    _getPartitionCacheKey(resource, action, partition, partitionValues = {}, params = {}) {
        const segments = [];
        if (resource) {
            segments.push(`resource=${this._sanitizePathValue(resource)}`);
        }
        const hasPartitionValues = partitionValues && Object.values(partitionValues).some(value => value !== null && value !== undefined && value !== '');
        if (partition && hasPartitionValues) {
            segments.push(`partition=${this._sanitizePathValue(partition)}`);
            const sortedFields = Object.entries(partitionValues)
                .filter(([, value]) => value !== null && value !== undefined)
                .sort(([a], [b]) => a.localeCompare(b));
            for (const [field, value] of sortedFields) {
                segments.push(`${field}=${this._sanitizePathValue(value)}`);
            }
        }
        if (action) {
            segments.push(`action=${this._sanitizePathValue(action)}`);
        }
        if (params && Object.keys(params).length > 0) {
            const paramsStr = Object.entries(params)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => `${k}=${v}`)
                .join('|');
            segments.push(`params=${this._sanitizePathValue(Buffer.from(paramsStr).toString('base64url'))}`);
        }
        return segments.join('/');
    }
    _getPartitionDirectory(resource, partition, partitionValues = {}) {
        const baseSegments = [];
        if (resource) {
            baseSegments.push(`resource=${this._sanitizePathValue(resource)}`);
        }
        if (!partition) {
            return path.join(this.directory, ...baseSegments);
        }
        if (this.partitionStrategy === 'flat') {
            return path.join(this.directory, ...baseSegments, 'partitions');
        }
        if (this.partitionStrategy === 'temporal' && this._isTemporalPartition(partition, partitionValues)) {
            return this._getTemporalDirectory(path.join(this.directory, ...baseSegments), partition, partitionValues);
        }
        const pathParts = [
            this.directory,
            ...baseSegments,
            `partition=${this._sanitizePathValue(partition)}`
        ];
        const sortedFields = Object.entries(partitionValues).sort(([a], [b]) => a.localeCompare(b));
        for (const [field, value] of sortedFields) {
            if (value !== null && value !== undefined) {
                pathParts.push(`${field}=${this._sanitizePathValue(value)}`);
            }
        }
        return path.join(...pathParts);
    }
    async _set(key, data, options = {}) {
        const { resource, action, partition, partitionValues, params } = options;
        if (resource && partition) {
            const partitionKey = this._getPartitionCacheKey(resource, action, partition, partitionValues, params);
            await this._ensurePartitionDirectoryForKey(partitionKey);
            if (this.trackUsage) {
                await this._trackPartitionUsage(resource, partition, partitionValues);
            }
            const payload = {
                data,
                metadata: {
                    resource,
                    partition,
                    partitionValues,
                    timestamp: Date.now(),
                    ttl: this.ttl
                }
            };
            await super._set(partitionKey, payload);
            return;
        }
        await super._set(key, data);
    }
    async set(resourceOrKey, actionOrData, options) {
        if (typeof resourceOrKey === 'string' && typeof actionOrData === 'string' && options?.partition) {
            const key = this._getPartitionCacheKey(resourceOrKey, actionOrData, options.partition, options.partitionValues, options.params);
            await this._set(key, actionOrData, { resource: resourceOrKey, action: actionOrData, ...options });
            return actionOrData;
        }
        return super.set(resourceOrKey, actionOrData);
    }
    async get(resourceOrKey, action, options) {
        if (typeof resourceOrKey === 'string' && typeof action === 'string' && options?.partition) {
            const key = this._getPartitionCacheKey(resourceOrKey, action, options.partition, options.partitionValues, options.params);
            return this._get(key, { resource: resourceOrKey, action, ...options });
        }
        return super.get(resourceOrKey);
    }
    async _get(key, options = {}) {
        const { resource, action, partition, partitionValues, params } = options;
        if (resource && partition) {
            const partitionKey = this._getPartitionCacheKey(resource, action, partition, partitionValues, params);
            const payload = await super._get(partitionKey);
            if (!payload) {
                if (this.preloadRelated) {
                    await this._preloadRelatedPartitions(resource, partition, partitionValues);
                }
                return null;
            }
            if (this.trackUsage) {
                await this._trackPartitionUsage(resource, partition, partitionValues);
            }
            return payload?.data ?? null;
        }
        return super._get(key);
    }
    async clearPartition(resource, partition, partitionValues = {}) {
        const partitionDir = this._getPartitionDirectory(resource, partition, partitionValues);
        const [ok, err] = await tryFn(async () => {
            if (await this._fileExists(partitionDir)) {
                await rmdir(partitionDir, { recursive: true });
            }
        });
        if (!ok && err) {
            this.logger.warn(`Failed to clear partition cache: ${err.message}`);
        }
        const usageKey = this._getUsageKey(resource, partition, partitionValues);
        this.partitionUsage.delete(usageKey);
        await this._saveUsageStats();
        return ok;
    }
    async clearResourcePartitions(resource) {
        const resourceDir = path.join(this.directory, `resource=${resource}`);
        const [ok] = await tryFn(async () => {
            if (await this._fileExists(resourceDir)) {
                await rmdir(resourceDir, { recursive: true });
            }
        });
        for (const [key] of this.partitionUsage.entries()) {
            if (key.startsWith(`${resource}/`)) {
                this.partitionUsage.delete(key);
            }
        }
        await this._saveUsageStats();
        return ok;
    }
    async _clear(prefix) {
        await super._clear(prefix);
        if (!prefix) {
            const [entriesOk, , entries] = await tryFn(() => readdir(this.directory));
            if (entriesOk && entries) {
                for (const entry of entries) {
                    const entryPath = path.join(this.directory, entry);
                    const [statOk, , entryStat] = await tryFn(() => stat(entryPath));
                    if (statOk && entryStat && entryStat.isDirectory() && entry.startsWith('resource=')) {
                        await rmdir(entryPath, { recursive: true }).catch(() => { });
                    }
                }
            }
            this.partitionUsage.clear();
            await this._saveUsageStats();
            return true;
        }
        const segments = this._splitKeySegments(prefix).map(segment => this._sanitizeFileName(segment));
        if (segments.length > 0) {
            const dirPath = path.join(this.directory, ...segments);
            if (await this._fileExists(dirPath)) {
                await rmdir(dirPath, { recursive: true }).catch(() => { });
            }
            const resourceSeg = segments.find(seg => seg.startsWith('resource='));
            const partitionSeg = segments.find(seg => seg.startsWith('partition='));
            const resourceVal = resourceSeg ? resourceSeg.split('=').slice(1).join('=') : '';
            const partitionVal = partitionSeg ? partitionSeg.split('=').slice(1).join('=') : '';
            const usagePrefix = `${resourceVal}/${partitionVal}`;
            for (const key of Array.from(this.partitionUsage.keys())) {
                if (key.startsWith(usagePrefix)) {
                    this.partitionUsage.delete(key);
                }
            }
            await this._saveUsageStats();
        }
        return true;
    }
    async getPartitionStats(resource, partition = null) {
        const stats = {
            totalFiles: 0,
            totalSize: 0,
            partitions: {},
            usage: {}
        };
        const resourceDir = path.join(this.directory, `resource=${resource}`);
        if (!await this._fileExists(resourceDir)) {
            return stats;
        }
        await this._calculateDirectoryStats(resourceDir, stats);
        for (const [key, usage] of this.partitionUsage.entries()) {
            if (key.startsWith(`${resource}/`)) {
                const partitionName = key.split('/')[1] || '';
                if (!partition || partitionName === partition) {
                    stats.usage[partitionName] = usage;
                }
            }
        }
        return stats;
    }
    async getCacheRecommendations(resource) {
        const recommendations = [];
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        for (const [key, usage] of this.partitionUsage.entries()) {
            if (key.startsWith(`${resource}/`)) {
                const [, partition] = key.split('/');
                const daysSinceLastAccess = (now - usage.lastAccess) / dayMs;
                const accessesPerDay = usage.count / Math.max(1, daysSinceLastAccess);
                let recommendation = 'keep';
                let priority = usage.count;
                if (daysSinceLastAccess > 30) {
                    recommendation = 'archive';
                    priority = 0;
                }
                else if (accessesPerDay < 0.1) {
                    recommendation = 'reduce_ttl';
                    priority = 1;
                }
                else if (accessesPerDay > 10) {
                    recommendation = 'preload';
                    priority = 100;
                }
                recommendations.push({
                    partition: partition || '',
                    recommendation,
                    priority,
                    usage: accessesPerDay,
                    lastAccess: new Date(usage.lastAccess).toISOString()
                });
            }
        }
        return recommendations.sort((a, b) => b.priority - a.priority);
    }
    async warmPartitionCache(resource, options = {}) {
        const { partitions = [], maxFiles = 1000 } = options;
        let warmedCount = 0;
        for (const partition of partitions) {
            const usageKey = `${resource}/${partition}`;
            const usage = this.partitionUsage.get(usageKey);
            if (usage && usage.count >= this.preloadThreshold) {
                warmedCount++;
            }
            if (warmedCount >= maxFiles)
                break;
        }
        return warmedCount;
    }
    async _trackPartitionUsage(resource, partition, partitionValues) {
        const usageKey = this._getUsageKey(resource, partition, partitionValues);
        const current = this.partitionUsage.get(usageKey) || {
            count: 0,
            firstAccess: Date.now(),
            lastAccess: Date.now()
        };
        current.count++;
        current.lastAccess = Date.now();
        this.partitionUsage.set(usageKey, current);
        if (current.count % 10 === 0) {
            await this._saveUsageStats();
        }
    }
    _getUsageKey(resource, partition, partitionValues) {
        const sanitizedResource = this._sanitizePathValue(resource || '');
        const sanitizedPartition = this._sanitizePathValue(partition || '');
        const valuePart = Object.entries(partitionValues || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${this._sanitizePathValue(v)}`)
            .join('|');
        return `${sanitizedResource}/${sanitizedPartition}/${valuePart}`;
    }
    async _preloadRelatedPartitions(_resource, _partition, _partitionValues) {
        // Implementation would go here for intelligent preloading
    }
    _isTemporalPartition(_partition, partitionValues) {
        const temporalFields = ['date', 'timestamp', 'createdAt', 'updatedAt'];
        return Object.keys(partitionValues).some(field => temporalFields.some(tf => field.toLowerCase().includes(tf)));
    }
    _getTemporalDirectory(basePath, partition, partitionValues) {
        const dateValue = Object.values(partitionValues)[0];
        if (typeof dateValue === 'string' && dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
            const [year = '', month = '', day = ''] = dateValue.split('-');
            return path.join(basePath, 'temporal', year, month, day);
        }
        return path.join(basePath, `partition=${partition}`);
    }
    _sanitizePathValue(value) {
        return String(value).replace(/[<>:"/\\|?*]/g, '_');
    }
    _sanitizeFileName(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_');
    }
    _splitKeySegments(key) {
        return key.split('/').filter(Boolean);
    }
    async _ensurePartitionDirectoryForKey(key) {
        const segments = this._splitKeySegments(key);
        if (segments.length <= 1) {
            return;
        }
        const dirPath = path.join(this.directory, ...segments.slice(0, -1).map(segment => this._sanitizeFileName(segment)));
        await this._ensureDirectory(dirPath);
    }
    _getFilePath(key) {
        const segments = this._splitKeySegments(key).map(segment => this._sanitizeFileName(segment));
        const fileName = segments.pop() || this._sanitizeFileName(key);
        const dirPath = segments.length > 0
            ? path.join(this.directory, ...segments)
            : this.directory;
        return path.join(dirPath, `${this.prefix}_${fileName}${this.fileExtension}`);
    }
    async _calculateDirectoryStats(dir, stats) {
        const [ok, , files] = await tryFn(() => readdir(dir));
        if (!ok || !files)
            return;
        for (const file of files) {
            const filePath = path.join(dir, file);
            const [statOk, , fileStat] = await tryFn(() => stat(filePath));
            if (statOk && fileStat) {
                if (fileStat.isDirectory()) {
                    await this._calculateDirectoryStats(filePath, stats);
                }
                else {
                    stats.totalFiles++;
                    stats.totalSize += fileStat.size;
                }
            }
        }
    }
    async loadUsageStats() {
        const [ok, , content] = await tryFn(async () => {
            const data = await readFile(this.usageStatsFile, 'utf8');
            return JSON.parse(data);
        });
        if (ok && content) {
            this.partitionUsage = new Map(Object.entries(content));
        }
    }
    async _saveUsageStats() {
        const statsObject = Object.fromEntries(this.partitionUsage);
        await tryFn(async () => {
            await writeFile(this.usageStatsFile, JSON.stringify(statsObject, null, 2), 'utf8');
        });
    }
    async _writeFileWithMetadata(filePath, data) {
        const content = JSON.stringify(data);
        const [ok, err] = await tryFn(async () => {
            await writeFile(filePath, content, {
                encoding: this.encoding,
                mode: this.fileMode
            });
        });
        if (!ok && err) {
            throw new CacheError(`Failed to write cache file: ${err.message}`, {
                driver: 'filesystem-partitioned',
                operation: 'writeFileWithMetadata',
                statusCode: 500,
                retriable: false,
                suggestion: 'Check filesystem permissions and disk space for the partition-aware cache directory.',
                filePath,
                original: err
            });
        }
        return true;
    }
    async _readFileWithMetadata(filePath) {
        const [ok, , content] = await tryFn(async () => {
            return await readFile(filePath, this.encoding);
        });
        if (!ok || !content)
            return null;
        try {
            return JSON.parse(content);
        }
        catch {
            return { data: content };
        }
    }
    async size() {
        const keys = await this.keys();
        return keys.length;
    }
    async keys() {
        const keys = [];
        await this._collectKeysRecursive(this.directory, [], keys);
        return keys;
    }
    async _collectKeysRecursive(currentDir, segments, result) {
        const [ok, , entries] = await tryFn(() => readdir(currentDir, { withFileTypes: true }));
        if (!ok || !entries) {
            return;
        }
        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await this._collectKeysRecursive(entryPath, [...segments, entry.name], result);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (!entry.name.startsWith(`${this.prefix}_`) || !entry.name.endsWith(this.fileExtension)) {
                continue;
            }
            const keyPart = entry.name.slice(this.prefix.length + 1, -this.fileExtension.length);
            const fullSegments = segments.length > 0 ? [...segments, keyPart] : [keyPart];
            result.push(fullSegments.join('/'));
        }
    }
}
export default PartitionAwareFilesystemCache;
//# sourceMappingURL=partition-aware-filesystem-cache.class.js.map