import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';

import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';

export interface MongoDBCollectionConfig {
  collection: string;
  actions: string[];
}

export interface MongoDBResourceConfig {
  collection?: string;
  actions?: string[];
  [key: string]: unknown;
}

export interface MongoDBReplicatorConfig extends BaseReplicatorConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  options?: Record<string, unknown>;
  logCollection?: string;
}

export interface ReplicateResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  results?: unknown[];
  errors?: Array<{ id: string; error: string }>;
  total?: number;
  error?: string;
}

interface MongoClientLike {
  connect(): Promise<void>;
  db(name?: string): MongoDBLike;
  close(): Promise<void>;
}

interface MongoDBLike {
  admin(): { ping(): Promise<void> };
  collection(name: string): CollectionLike;
  listCollections(filter?: { name: string }): { toArray(): Promise<unknown[]> };
  createCollection(name: string): Promise<void>;
}

interface CollectionLike {
  insertOne(doc: unknown): Promise<unknown>;
  updateOne(filter: unknown, update: unknown): Promise<unknown>;
  deleteOne(filter: unknown): Promise<unknown>;
  createIndexes(indexes: Array<{ key: Record<string, number> }>): Promise<void>;
}

type ResourcesInput = string | MongoDBResourceConfig | MongoDBResourceConfig[] | Record<string, string | MongoDBResourceConfig | MongoDBResourceConfig[]>;

class MongoDBReplicator extends BaseReplicator {
  connectionString: string | undefined;
  host: string;
  port: number;
  databaseName: string | undefined;
  username: string | undefined;
  password: string | undefined;
  options: Record<string, unknown>;
  client: MongoClientLike | null;
  db: MongoDBLike | null;
  logCollection: string | undefined;
  resources: Record<string, MongoDBCollectionConfig[]>;

  constructor(config: MongoDBReplicatorConfig = {}, resources: Record<string, ResourcesInput> = {}) {
    super(config);
    this.connectionString = config.connectionString;
    this.host = config.host || 'localhost';
    this.port = config.port || 27017;
    this.databaseName = config.database;
    this.username = config.username;
    this.password = config.password;
    this.options = config.options || {};
    this.client = null;
    this.db = null;
    this.logCollection = config.logCollection;

    this.resources = this.parseResourcesConfig(resources);
  }

  parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, MongoDBCollectionConfig[]> {
    const parsed: Record<string, MongoDBCollectionConfig[]> = {};

    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === 'string') {
        parsed[resourceName] = [{
          collection: config,
          actions: ['insert']
        }];
      } else if (Array.isArray(config)) {
        parsed[resourceName] = config.map(item => {
          if (typeof item === 'string') {
            return { collection: item, actions: ['insert'] };
          }
          return {
            collection: item.collection!,
            actions: item.actions || ['insert']
          };
        });
      } else if (typeof config === 'object' && config !== null) {
        const objConfig = config as MongoDBResourceConfig;
        parsed[resourceName] = [{
          collection: objConfig.collection!,
          actions: objConfig.actions || ['insert']
        }];
      }
    }

    return parsed;
  }

  override validateConfig(): ValidationResult {
    const errors: string[] = [];
    if (!this.connectionString && !this.databaseName) {
      errors.push('Database name or connection string is required');
    }
    if (Object.keys(this.resources).length === 0) {
      errors.push('At least one resource must be configured');
    }

    for (const [resourceName, collections] of Object.entries(this.resources)) {
      for (const collectionConfig of collections) {
        if (!collectionConfig.collection) {
          errors.push(`Collection name is required for resource '${resourceName}'`);
        }
        if (!Array.isArray(collectionConfig.actions) || collectionConfig.actions.length === 0) {
          errors.push(`Actions array is required for resource '${resourceName}'`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  override async initialize(database: unknown): Promise<void> {
    await super.initialize(database as { [key: string]: unknown });

    const { MongoClient } = requirePluginDependency('mongodb', 'MongoDBReplicator') as unknown as { MongoClient: new (uri: string, options: unknown) => MongoClientLike };

    const [ok, err] = await tryFn(async () => {
      let uri: string;
      if (this.connectionString) {
        uri = this.connectionString;
      } else {
        const auth = this.username && this.password
          ? `${encodeURIComponent(this.username)}:${encodeURIComponent(this.password)}@`
          : '';
        uri = `mongodb://${auth}${this.host}:${this.port}/${this.databaseName}`;
      }

      this.client = new MongoClient(uri, {
        ...this.options,
        useUnifiedTopology: true,
        useNewUrlParser: true
      });

      await this.client.connect();
      this.db = this.client.db(this.databaseName);

      await this.db.admin().ping();
    });

    if (!ok) {
      throw new ReplicationError('Failed to connect to MongoDB database', {
        operation: 'initialize',
        replicatorClass: 'MongoDBReplicator',
        host: this.host,
        port: this.port,
        database: this.databaseName,
        original: err,
        suggestion: 'Check MongoDB connection credentials and ensure database is accessible'
      });
    }

    if (this.logCollection) {
      await this._createLogCollection();
    }

    this.emit('connected', {
      replicator: 'MongoDBReplicator',
      host: this.host,
      database: this.databaseName
    });
  }

  private async _createLogCollection(): Promise<void> {
    const [ok] = await tryFn(async () => {
      const collections = await this.db!.listCollections({ name: this.logCollection! }).toArray();

      if (collections.length === 0) {
        await this.db!.createCollection(this.logCollection!);

        await this.db!.collection(this.logCollection!).createIndexes([
          { key: { resource_name: 1 } },
          { key: { timestamp: 1 } }
        ]);
      }
    });

    if (!ok) {
      this.logger.warn('Failed to create log collection');
    }
  }

  override async replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string): Promise<unknown> {
    if (!this.resources[resourceName]) {
      throw new ReplicationError('Resource not configured for replication', {
        operation: 'replicate',
        replicatorClass: 'MongoDBReplicator',
        resourceName,
        configuredResources: Object.keys(this.resources),
        suggestion: 'Add resource to replicator resources configuration'
      });
    }

    const results: unknown[] = [];

    for (const collectionConfig of this.resources[resourceName]) {
      if (!collectionConfig.actions.includes(operation)) {
        continue;
      }

      const [ok, error, result] = await tryFn(async () => {
        switch (operation) {
          case 'insert':
            return await this._insertDocument(collectionConfig.collection, data);
          case 'update':
            return await this._updateDocument(collectionConfig.collection, id, data);
          case 'delete':
            return await this._deleteDocument(collectionConfig.collection, id);
          default:
            throw new ReplicationError(`Unsupported operation: ${operation}`, {
              operation: 'replicate',
              replicatorClass: 'MongoDBReplicator',
              invalidOperation: operation,
              supportedOperations: ['insert', 'update', 'delete']
            });
        }
      });

      if (ok) {
        results.push(result);

        if (this.logCollection) {
          await this._logOperation(resourceName, operation, id, data);
        }
      } else {
        this.emit('replication_error', {
          resource: resourceName,
          operation,
          collection: collectionConfig.collection,
          error: (error as Error).message
        });

        this.logger.error(
          { resourceName, operation, error: (error as Error).message },
          'Failed to replicate'
        );
      }
    }

    return results.length > 0 ? results[0] : null;
  }

  private async _insertDocument(collectionName: string, data: Record<string, unknown>): Promise<unknown> {
    const cleanData = this._cleanInternalFields(data);
    const collection = this.db!.collection(collectionName);

    const result = await collection.insertOne(cleanData);
    return result;
  }

  private async _updateDocument(collectionName: string, id: string, data: Record<string, unknown>): Promise<unknown> {
    const cleanData = this._cleanInternalFields(data);
    const collection = this.db!.collection(collectionName);

    delete cleanData._id;

    const result = await collection.updateOne(
      { _id: id },
      { $set: cleanData }
    );

    return result;
  }

  private async _deleteDocument(collectionName: string, id: string): Promise<unknown> {
    const collection = this.db!.collection(collectionName);
    const result = await collection.deleteOne({ _id: id });
    return result;
  }

  private async _logOperation(resourceName: string, operation: string, id: string, data: Record<string, unknown>): Promise<void> {
    const [ok] = await tryFn(async () => {
      const collection = this.db!.collection(this.logCollection!);
      await collection.insertOne({
        resource_name: resourceName,
        operation,
        record_id: id,
        data,
        timestamp: new Date()
      });
    });

    if (!ok) {
      this.logger.warn({ resourceName, operation, id }, 'Failed to log operation');
    }
  }

  shouldReplicateResource(resourceName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.resources, resourceName);
  }

  private _cleanInternalFields(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== 'object') return data as Record<string, unknown>;

    const cleanData = { ...data } as Record<string, unknown>;

    Object.keys(cleanData).forEach(key => {
      if (key === '_id') {
        return;
      }
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  override async replicateBatch(resourceName: string, records: Array<{ operation: string; data: Record<string, unknown>; id: string }>): Promise<ReplicateResult> {
    const { results, errors } = await this.processBatch(
      records,
      async (record: { operation: string; data: Record<string, unknown>; id: string }) => {
        const [ok, err, result] = await tryFn(() =>
          this.replicate(resourceName, record.operation, record.data, record.id)
        );

        if (!ok) {
          throw err;
        }

        return result;
      },
      {
        concurrency: this.config.batchConcurrency,
        mapError: (error: Error, record: unknown) => ({ id: (record as { id: string }).id, error: error.message })
      }
    );

    return {
      success: errors.length === 0,
      results,
      errors: errors as Array<{ id: string; error: string }>,
      total: records.length
    };
  }

  override async testConnection(): Promise<boolean> {
    const [ok, err] = await tryFn(async () => {
      if (!this.client) {
        throw this.createError('Client not initialized', {
          operation: 'testConnection',
          statusCode: 503,
          retriable: true,
          suggestion: 'Ensure initialize() was called and the MongoDB client connected before testing connectivity.'
        });
      }

      await this.db!.admin().ping();
      return true;
    });

    if (!ok) {
      this.emit('connection_error', { replicator: 'MongoDBReplicator', error: (err as Error).message });
      return false;
    }

    return true;
  }

  override async getStatus(): Promise<ReplicatorStatus & {
    connected: boolean;
    host: string;
    database: string | undefined;
    resources: string[];
  }> {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.client && !!this.db,
      host: this.host,
      database: this.databaseName,
      resources: Object.keys(this.resources)
    };
  }

  override async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
    await super.cleanup();
  }
}

export default MongoDBReplicator;
