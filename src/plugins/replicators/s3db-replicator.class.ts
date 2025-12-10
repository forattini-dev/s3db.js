import tryFn from '#src/concerns/try-fn.js';
import { S3db } from '#src/database.class.js';
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';

import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';

function normalizeResourceName(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : String(name);
}

export interface ResourceTransformConfig {
  resource: string;
  transform?: (data: Record<string, unknown>) => Record<string, unknown>;
  actions?: string[];
}

export type ResourceMapEntry = string | ResourceTransformConfig | Array<string | ResourceTransformConfig> | ((data: Record<string, unknown>) => Record<string, unknown>);

export interface S3dbReplicatorConfig extends BaseReplicatorConfig {
  connectionString?: string;
  region?: string;
  keyPrefix?: string;
}

export interface ReplicateInput {
  resource: string;
  operation: string;
  data: Record<string, unknown>;
  id: string;
}

export interface ReplicateResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  action?: string;
  destination?: string;
  error?: string;
  results?: unknown[];
  errors?: Array<{ id: string; error: string }>;
  total?: number;
}

interface ResourceLike {
  insert(data: Record<string, unknown>): Promise<unknown>;
  update(id: string, data: Record<string, unknown>): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

interface DatabaseLike {
  resources?: Record<string, ResourceLike>;
  connect(): Promise<void>;
  removeAllListeners(): void;
}

type ResourcesInput = string | string[] | Record<string, ResourceMapEntry>;

class S3dbReplicator extends BaseReplicator {
  instanceId: string;
  client: DatabaseLike | null;
  connectionString: string | undefined;
  region: string | undefined;
  keyPrefix: string | undefined;
  resourcesMap: Record<string, ResourceMapEntry> | ((data: Record<string, unknown>) => Record<string, unknown>);
  targetDatabase: DatabaseLike | null;

  constructor(config: S3dbReplicatorConfig = {}, resources: ResourcesInput = [], client: DatabaseLike | null = null) {
    super(config);
    this.instanceId = Math.random().toString(36).slice(2, 10);
    this.client = client;
    this.connectionString = config.connectionString;
    this.region = config.region;
    this.keyPrefix = config.keyPrefix;
    this.targetDatabase = null;

    let normalizedResources: Record<string, ResourceMapEntry>;
    if (!resources) normalizedResources = {};
    else if (Array.isArray(resources)) {
      normalizedResources = {};
      for (const res of resources) {
        if (typeof res === 'string') normalizedResources[normalizeResourceName(res)] = res;
      }
    } else if (typeof resources === 'string') {
      normalizedResources = {};
      normalizedResources[normalizeResourceName(resources)] = resources;
    } else {
      normalizedResources = resources as Record<string, ResourceMapEntry>;
    }
    this.resourcesMap = this._normalizeResources(normalizedResources);
  }

  private _normalizeResources(resources: Record<string, ResourceMapEntry> | null): Record<string, ResourceMapEntry> | ((data: Record<string, unknown>) => Record<string, unknown>) {
    if (!resources) return {};
    if (Array.isArray(resources)) {
      const map: Record<string, ResourceMapEntry> = {};
      for (const res of resources) {
        if (typeof res === 'string') map[normalizeResourceName(res)] = res;
        else if (typeof res === 'object' && (res as ResourceTransformConfig).resource) {
          map[normalizeResourceName((res as ResourceTransformConfig).resource)] = res as ResourceTransformConfig;
        }
      }
      return map;
    }
    if (typeof resources === 'object') {
      const map: Record<string, ResourceMapEntry> = {};
      for (const [src, dest] of Object.entries(resources)) {
        const normSrc = normalizeResourceName(src);
        if (typeof dest === 'string') map[normSrc] = dest;
        else if (Array.isArray(dest)) {
          map[normSrc] = dest.map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object' && (item as ResourceTransformConfig).resource) {
              return item;
            }
            return item;
          });
        } else if (typeof dest === 'function') map[normSrc] = dest;
        else if (typeof dest === 'object' && (dest as ResourceTransformConfig).resource) {
          map[normSrc] = dest;
        }
      }
      return map;
    }
    if (typeof resources === 'function') {
      return resources as (data: Record<string, unknown>) => Record<string, unknown>;
    }
    return {};
  }

  override validateConfig(): ValidationResult {
    const errors: string[] = [];
    if (!this.client && !this.connectionString) {
      errors.push('You must provide a client or a connectionString');
    }
    if (!this.resourcesMap || (typeof this.resourcesMap === 'object' && Object.keys(this.resourcesMap).length === 0)) {
      errors.push('You must provide a resources map or array');
    }
    return { isValid: errors.length === 0, errors };
  }

  override async initialize(database: unknown): Promise<void> {
    await super.initialize(database as { [key: string]: unknown });

    const [ok, err] = await tryFn(async () => {
      if (this.client) {
        this.targetDatabase = this.client;
      } else if (this.connectionString) {
        const targetConfig = {
          connectionString: this.connectionString,
          region: this.region,
          keyPrefix: this.keyPrefix,
          logLevel: (this.config.logLevel || 'info') as import('../../concerns/logger.js').LogLevel
        };
        this.targetDatabase = new S3db(targetConfig) as unknown as DatabaseLike;
        await this.targetDatabase.connect();
      } else {
        throw new ReplicationError('S3dbReplicator requires client or connectionString', {
          operation: 'initialize',
          replicatorClass: 'S3dbReplicator',
          suggestion: 'Provide either a client instance or connectionString in config: { client: db } or { connectionString: "s3://..." }'
        });
      }

      this.emit('connected', {
        replicator: this.name,
        target: this.connectionString || 'client-provided'
      });
    });

    if (!ok) {
      this.logger.warn({ error: (err as Error).message }, 'Initialization failed');
      throw err;
    }
  }

  override async replicate(resourceOrObj: string | ReplicateInput, operation?: string, data?: Record<string, unknown>, recordId?: string, beforeData?: unknown): Promise<ReplicateResult | ReplicateResult[]> {
    let resource: string;
    let op: string;
    let payload: Record<string, unknown>;
    let id: string;

    if (typeof resourceOrObj === 'object' && resourceOrObj.resource) {
      resource = resourceOrObj.resource;
      op = resourceOrObj.operation;
      payload = resourceOrObj.data;
      id = resourceOrObj.id;
    } else {
      resource = resourceOrObj as string;
      op = operation!;
      payload = data!;
      id = recordId!;
    }

    const normResource = normalizeResourceName(resource);
    const resourcesMap = this.resourcesMap as Record<string, ResourceMapEntry>;
    const entry = resourcesMap[normResource];

    if (!entry) {
      throw new ReplicationError('Resource not configured for replication', {
        operation: 'replicate',
        replicatorClass: 'S3dbReplicator',
        resourceName: resource,
        configuredResources: Object.keys(resourcesMap),
        suggestion: 'Add resource to replicator resources map: { resources: { [resourceName]: "destination" } }'
      });
    }

    if (Array.isArray(entry)) {
      const results: ReplicateResult[] = [];
      for (const destConfig of entry) {
        const [ok, error, result] = await tryFn(async () => {
          return await this._replicateToSingleDestination(destConfig, normResource, op, payload, id);
        });

        if (!ok) {
          this.logger.warn(
            { destConfig, error: (error as Error).message },
            'Failed to replicate to destination'
          );
          throw error;
        }
        results.push(result as ReplicateResult);
      }
      return results;
    } else {
      const [ok, error, result] = await tryFn(async () => {
        return await this._replicateToSingleDestination(entry, normResource, op, payload, id);
      });

      if (!ok) {
        this.logger.warn(
          { entry, error: (error as Error).message },
          'Failed to replicate to destination'
        );
        throw error;
      }
      return result as ReplicateResult;
    }
  }

  private async _replicateToSingleDestination(destConfig: ResourceMapEntry, sourceResource: string, operation: string, data: Record<string, unknown>, recordId: string): Promise<ReplicateResult | unknown> {
    let destResourceName: string;
    if (typeof destConfig === 'string') {
      destResourceName = destConfig;
    } else if (typeof destConfig === 'object' && !Array.isArray(destConfig) && (destConfig as ResourceTransformConfig).resource) {
      destResourceName = (destConfig as ResourceTransformConfig).resource;
    } else {
      destResourceName = sourceResource;
    }

    if (typeof destConfig === 'object' && !Array.isArray(destConfig) && (destConfig as ResourceTransformConfig).actions && Array.isArray((destConfig as ResourceTransformConfig).actions)) {
      if (!(destConfig as ResourceTransformConfig).actions!.includes(operation)) {
        return { skipped: true, reason: 'action_not_supported', action: operation, destination: destResourceName };
      }
    }

    const destResourceObj = this._getDestResourceObj(destResourceName);

    let transformedData: Record<string, unknown>;
    if (typeof destConfig === 'object' && !Array.isArray(destConfig) && (destConfig as ResourceTransformConfig).transform && typeof (destConfig as ResourceTransformConfig).transform === 'function') {
      transformedData = (destConfig as ResourceTransformConfig).transform!(data);
      if (transformedData && data && data.id && !transformedData.id) {
        transformedData.id = data.id;
      }
    } else {
      transformedData = data;
    }

    if (!transformedData && data) transformedData = data;

    let result: unknown;
    if (operation === 'insert') {
      result = await destResourceObj.insert(transformedData);
    } else if (operation === 'update') {
      result = await destResourceObj.update(recordId, transformedData);
    } else if (operation === 'delete') {
      result = await destResourceObj.delete(recordId);
    } else {
      throw new ReplicationError(`Invalid replication operation: ${operation}`, {
        operation: 'replicate',
        replicatorClass: 'S3dbReplicator',
        invalidOperation: operation,
        supportedOperations: ['insert', 'update', 'delete'],
        resourceName: sourceResource,
        suggestion: 'Use one of the supported operations: insert, update, delete'
      });
    }

    return result;
  }

  private _applyTransformer(resource: string, data: Record<string, unknown>): Record<string, unknown> {
    let cleanData = this._cleanInternalFields(data);

    const normResource = normalizeResourceName(resource);
    const resourcesMap = this.resourcesMap as Record<string, ResourceMapEntry>;
    const entry = resourcesMap[normResource];
    let result: Record<string, unknown> | undefined;
    if (!entry) return cleanData;

    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'object' && (item as ResourceTransformConfig).transform && typeof (item as ResourceTransformConfig).transform === 'function') {
          result = (item as ResourceTransformConfig).transform!(cleanData);
          break;
        }
      }
      if (!result) result = cleanData;
    } else if (typeof entry === 'object' && !Array.isArray(entry)) {
      if (typeof (entry as ResourceTransformConfig).transform === 'function') {
        result = (entry as ResourceTransformConfig).transform!(cleanData);
      }
    } else if (typeof entry === 'function') {
      result = entry(cleanData);
    } else {
      result = cleanData;
    }

    if (result && cleanData && cleanData.id && !result.id) result.id = cleanData.id;
    if (!result && cleanData) result = cleanData;
    return result!;
  }

  private _cleanInternalFields(data: Record<string, unknown>): Record<string, unknown> {
    if (!data || typeof data !== 'object') return data;

    const cleanData = { ...data };

    Object.keys(cleanData).forEach(key => {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  private _resolveDestResource(resource: string, data: Record<string, unknown>): string {
    const normResource = normalizeResourceName(resource);
    const resourcesMap = this.resourcesMap as Record<string, ResourceMapEntry>;
    const entry = resourcesMap[normResource];
    if (!entry) return resource;

    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && (item as ResourceTransformConfig).resource) return (item as ResourceTransformConfig).resource;
      }
      return resource;
    }
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'function') return resource;
    if (typeof entry === 'object' && (entry as ResourceTransformConfig).resource) return (entry as ResourceTransformConfig).resource;
    return resource;
  }

  private _getDestResourceObj(resource: string): ResourceLike {
    const db = this.targetDatabase || this.client;
    const available = Object.keys(db?.resources || {});
    const norm = normalizeResourceName(resource);
    const found = available.find(r => normalizeResourceName(r) === norm);
    if (!found) {
      throw new ReplicationError('Destination resource not found in target database', {
        operation: '_getDestResourceObj',
        replicatorClass: 'S3dbReplicator',
        destinationResource: resource,
        availableResources: available,
        suggestion: 'Create the resource in target database or check resource name spelling'
      });
    }
    return db!.resources![found] as ResourceLike;
  }

  override async replicateBatch(resourceName: string, records: Array<{ operation: string; id: string; data: Record<string, unknown>; beforeData?: unknown }>): Promise<ReplicateResult> {
    if (this.enabled === false) {
      return { skipped: true, reason: 'replicator_disabled' };
    }
    if (!this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    const { results, errors } = await this.processBatch(
      records,
      async (record) => {
        const [ok, err, result] = await tryFn(() => this.replicate({
          resource: resourceName,
          operation: record.operation,
          id: record.id,
          data: record.data
        }));

        if (!ok) {
          throw err;
        }

        return result;
      },
      {
        concurrency: this.config.batchConcurrency,
        mapError: (error: Error, record: unknown) => {
          const rec = record as { id: string };
          this.logger.warn(
            { recordId: rec.id, error: error.message },
            'Batch replication failed for record'
          );
          return { id: rec.id, error: error.message };
        }
      }
    );

    if (errors.length > 0) {
      this.logger.warn(
        { resourceName, errorCount: errors.length, errors },
        'Batch replication completed with errors'
      );
    }

    this.emit('batch_replicated', {
      replicator: this.name,
      resourceName,
      total: records.length,
      successful: results.length,
      errors: errors.length
    });

    return {
      success: errors.length === 0,
      results,
      errors: errors as Array<{ id: string; error: string }>,
      total: records.length
    };
  }

  override async testConnection(): Promise<boolean> {
    const [ok, err] = await tryFn(async () => {
      if (!this.targetDatabase) {
        throw new ReplicationError('No target database configured for connection test', {
          operation: 'testConnection',
          replicatorClass: 'S3dbReplicator',
          suggestion: 'Initialize replicator with client or connectionString before testing connection'
        });
      }

      if (typeof this.targetDatabase.connect === 'function') {
        await this.targetDatabase.connect();
      }

      return true;
    });

    if (!ok) {
      this.logger.warn({ error: (err as Error).message }, 'Connection test failed');
      this.emit('connection_error', { replicator: this.name, error: (err as Error).message });
      return false;
    }

    return true;
  }

  override async getStatus(): Promise<ReplicatorStatus & {
    connected: boolean;
    targetDatabase: string;
    resources: string[];
    totalreplicators: number;
    totalErrors: number;
  }> {
    const baseStatus = await super.getStatus();
    const resourcesMap = this.resourcesMap as Record<string, ResourceMapEntry>;
    return {
      ...baseStatus,
      connected: !!this.targetDatabase,
      targetDatabase: this.connectionString || 'client-provided',
      resources: Object.keys(resourcesMap || {}),
      totalreplicators: this.listenerCount('replicated'),
      totalErrors: this.listenerCount('replicator_error')
    };
  }

  override async cleanup(): Promise<void> {
    if (this.targetDatabase) {
      this.targetDatabase.removeAllListeners();
    }
    await super.cleanup();
  }

  shouldReplicateResource(resource: string, action?: string): boolean {
    const normResource = normalizeResourceName(resource);
    const resourcesMap = this.resourcesMap as Record<string, ResourceMapEntry>;
    const entry = resourcesMap[normResource];
    if (!entry) return false;

    if (!action) return true;

    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'object' && (item as ResourceTransformConfig).resource) {
          if ((item as ResourceTransformConfig).actions && Array.isArray((item as ResourceTransformConfig).actions)) {
            if ((item as ResourceTransformConfig).actions!.includes(action)) return true;
          } else {
            return true;
          }
        } else if (typeof item === 'string') {
          return true;
        }
      }
      return false;
    }

    if (typeof entry === 'object' && (entry as ResourceTransformConfig).resource) {
      if ((entry as ResourceTransformConfig).actions && Array.isArray((entry as ResourceTransformConfig).actions)) {
        return (entry as ResourceTransformConfig).actions!.includes(action);
      }
      return true;
    }
    if (typeof entry === 'string' || typeof entry === 'function') {
      return true;
    }
    return false;
  }
}

export default S3dbReplicator;
