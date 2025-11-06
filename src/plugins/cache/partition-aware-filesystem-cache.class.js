/**
 * Partition-Aware Filesystem Cache Implementation
 * 
 * Extends FilesystemCache to provide intelligent caching for s3db.js partitions.
 * Creates hierarchical directory structures that mirror partition organization.
 * 
 * @example
 * // Basic partition-aware caching
 * const cache = new PartitionAwareFilesystemCache({
 *   directory: './cache',
 *   partitionStrategy: 'hierarchical',
 *   preloadRelated: true
 * });
 * 
 * @example
 * // Advanced configuration with analytics
 * const cache = new PartitionAwareFilesystemCache({
 *   directory: './data/cache',
 *   partitionStrategy: 'incremental',
 *   trackUsage: true,
 *   preloadThreshold: 10,
 *   maxCacheSize: '1GB'
 * });
 */
import path from 'path';
import fs from 'fs';
import { mkdir, rm as rmdir, readdir, stat, writeFile, readFile } from 'fs/promises';
import { FilesystemCache } from './filesystem-cache.class.js';
import tryFn from '../../concerns/try-fn.js';
import { CacheError } from '../cache.errors.js';

export class PartitionAwareFilesystemCache extends FilesystemCache {
  constructor({
    partitionStrategy = 'hierarchical', // 'hierarchical', 'flat', 'temporal'
    trackUsage = true,
    preloadRelated = false,
    preloadThreshold = 10,
    maxCacheSize = null,
    usageStatsFile = 'partition-usage.json',
    ...config
  }) {
    super(config);
    
    this.partitionStrategy = partitionStrategy;
    this.trackUsage = trackUsage;
    this.preloadRelated = preloadRelated;
    this.preloadThreshold = preloadThreshold;
    this.maxCacheSize = maxCacheSize;
    this.usageStatsFile = path.join(this.directory, usageStatsFile);
    
    // Partition usage statistics
    this.partitionUsage = new Map();
    this.loadUsageStats();
  }

  /**
   * Generate partition-aware cache key
   */
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

  /**
   * Get directory path for partition cache
   */
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

  /**
   * Enhanced set method with partition awareness
   */
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
      return data;
    }

    // Fallback to standard set
    return super._set(key, data);
  }

  /**
   * Public set method with partition support
   */
  async set(resource, action, data, options = {}) {
    if (typeof resource === 'string' && typeof action === 'string' && options.partition) {
      // Partition-aware set
      const key = this._getPartitionCacheKey(resource, action, options.partition, options.partitionValues, options.params);
      return this._set(key, data, { resource, action, ...options });
    }
    
    // Standard cache set (first parameter is the key)
    return super.set(resource, action); // resource is actually the key, action is the data
  }

  /**
   * Public get method with partition support
   */
  async get(resource, action, options = {}) {
    if (typeof resource === 'string' && typeof action === 'string' && options.partition) {
      // Partition-aware get
      const key = this._getPartitionCacheKey(resource, action, options.partition, options.partitionValues, options.params);
      return this._get(key, { resource, action, ...options });
    }
    
    // Standard cache get (first parameter is the key)
    return super.get(resource); // resource is actually the key
  }

  /**
   * Enhanced get method with partition awareness
   */
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

    // Fallback to standard get
    return super._get(key);
  }

  /**
   * Clear cache for specific partition
   */
  async clearPartition(resource, partition, partitionValues = {}) {
    const partitionDir = this._getPartitionDirectory(resource, partition, partitionValues);
    
    const [ok, err] = await tryFn(async () => {
      if (await this._fileExists(partitionDir)) {
        await rmdir(partitionDir, { recursive: true });
      }
    });

    if (!ok) {
      console.warn(`Failed to clear partition cache: ${err.message}`);
    }

    // Clear from usage stats
    const usageKey = this._getUsageKey(resource, partition, partitionValues);
    this.partitionUsage.delete(usageKey);
    await this._saveUsageStats();

    return ok;
  }

  /**
   * Clear all partitions for a resource
   */
  async clearResourcePartitions(resource) {
    const resourceDir = path.join(this.directory, `resource=${resource}`);
    
    const [ok, err] = await tryFn(async () => {
      if (await this._fileExists(resourceDir)) {
        await rmdir(resourceDir, { recursive: true });
      }
    });

    // Clear usage stats for resource
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
          if (statOk && entryStat.isDirectory() && entry.startsWith('resource=')) {
            await rmdir(entryPath, { recursive: true }).catch(() => {});
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
        await rmdir(dirPath, { recursive: true }).catch(() => {});
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

  /**
   * Get partition cache statistics
   */
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

    // Add usage statistics
    for (const [key, usage] of this.partitionUsage.entries()) {
      if (key.startsWith(`${resource}/`)) {
        const partitionName = key.split('/')[1];
        if (!partition || partitionName === partition) {
          stats.usage[partitionName] = usage;
        }
      }
    }

    return stats;
  }

  /**
   * Get cache recommendations based on usage patterns
   */
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
        } else if (accessesPerDay < 0.1) {
          recommendation = 'reduce_ttl';
          priority = 1;
        } else if (accessesPerDay > 10) {
          recommendation = 'preload';
          priority = 100;
        }

        recommendations.push({
          partition,
          recommendation,
          priority,
          usage: accessesPerDay,
          lastAccess: new Date(usage.lastAccess).toISOString()
        });
      }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Preload frequently accessed partitions
   */
  async warmPartitionCache(resource, options = {}) {
    const { partitions = [], maxFiles = 1000 } = options;
    let warmedCount = 0;

    for (const partition of partitions) {
      const usageKey = `${resource}/${partition}`;
      const usage = this.partitionUsage.get(usageKey);

      if (usage && usage.count >= this.preloadThreshold) {
        // This would integrate with the actual resource to preload data
        // console.log(`🔥 Warming cache for ${resource}/${partition} (${usage.count} accesses)`);
        warmedCount++;
      }

      if (warmedCount >= maxFiles) break;
    }

    return warmedCount;
  }

  // Private helper methods

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

    // Periodically save stats
    if (current.count % 10 === 0) {
      await this._saveUsageStats();
    }
  }

  _getUsageKey(resource, partition, partitionValues) {
    const sanitizedResource = this._sanitizePathValue(resource || '');
    const sanitizedPartition = this._sanitizePathValue(partition || '');
    const valuePart = Object.entries(partitionValues)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${this._sanitizePathValue(v)}`)
      .join('|');
    
    return `${sanitizedResource}/${sanitizedPartition}/${valuePart}`;
  }

  async _preloadRelatedPartitions(resource, partition, partitionValues) {
    // This would implement intelligent preloading based on:
    // - Temporal patterns (load next/previous time periods)
    // - Geographic patterns (load adjacent regions)
    // - Categorical patterns (load related categories)
    
    // console.log(`🎯 Preloading related partitions for ${resource}/${partition}`);
    
    // Example: for date partitions, preload next day
    if (partitionValues.timestamp || partitionValues.date) {
      // Implementation would go here
    }
  }

  _isTemporalPartition(partition, partitionValues) {
    const temporalFields = ['date', 'timestamp', 'createdAt', 'updatedAt'];
    return Object.keys(partitionValues).some(field => 
      temporalFields.some(tf => field.toLowerCase().includes(tf))
    );
  }

  _getTemporalDirectory(basePath, partition, partitionValues) {
    // Create year/month/day hierarchy for temporal data
    const dateValue = Object.values(partitionValues)[0];
    if (typeof dateValue === 'string' && dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
      const [year, month, day] = dateValue.split('-');
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

    const dirPath = path.join(
      this.directory,
      ...segments.slice(0, -1).map(segment => this._sanitizeFileName(segment))
    );

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
    const [ok, err, files] = await tryFn(() => readdir(dir));
    if (!ok) return;

    for (const file of files) {
      const filePath = path.join(dir, file);
      const [statOk, statErr, fileStat] = await tryFn(() => stat(filePath));
      
      if (statOk) {
        if (fileStat.isDirectory()) {
          await this._calculateDirectoryStats(filePath, stats);
        } else {
          stats.totalFiles++;
          stats.totalSize += fileStat.size;
        }
      }
    }
  }

  async loadUsageStats() {
    const [ok, err, content] = await tryFn(async () => {
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
      await writeFile(
        this.usageStatsFile, 
        JSON.stringify(statsObject, null, 2),
        'utf8'
      );
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

    if (!ok) {
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
    const [ok, err, content] = await tryFn(async () => {
      return await readFile(filePath, this.encoding);
    });

    if (!ok || !content) return null;
    
    try {
      return JSON.parse(content);
    } catch (error) {
      return { data: content }; // Fallback for non-JSON data
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
    const [ok, err, entries] = await tryFn(() => readdir(currentDir, { withFileTypes: true }));
    if (!ok || !entries) {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await this._collectKeysRecursive(entryPath, [...segments, entry.name], result);
        continue;
      }

      if (!entry.isFile()) continue;

      if (!entry.name.startsWith(`${this.prefix}_`) || !entry.name.endsWith(this.fileExtension)) {
        continue;
      }

      const keyPart = entry.name.slice(this.prefix.length + 1, -this.fileExtension.length);
      const fullSegments = segments.length > 0 ? [...segments, keyPart] : [keyPart];
      result.push(fullSegments.join('/'));
    }
  }
} 
