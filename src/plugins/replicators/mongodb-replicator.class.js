import tryFn from "#src/concerns/try-fn.js";
import requirePluginDependency from "#src/plugins/concerns/plugin-dependencies.js";
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';

/**
 * MongoDB Replicator - Replicate data to MongoDB collections
 *
 * ⚠️  REQUIRED DEPENDENCY: You must install the MongoDB driver:
 * ```bash
 * pnpm add mongodb
 * ```
 *
 * Configuration:
 * @param {string} connectionString - MongoDB connection string (optional)
 * @param {string} host - Database host (default: localhost)
 * @param {number} port - Database port (default: 27017)
 * @param {string} database - Database name (required)
 * @param {string} username - Database username (optional)
 * @param {string} password - Database password (optional)
 * @param {Object} options - Additional MongoDB client options (optional)
 * @param {string} logCollection - Collection name for operation logging (optional)
 *
 * @example
 * new MongoDBReplicator({
 *   host: 'localhost',
 *   port: 27017,
 *   database: 'analytics',
 *   username: 'replicator',
 *   password: 'secret',
 *   logCollection: 'replication_log'
 * }, {
 *   users: [{ actions: ['insert', 'update'], collection: 'users_collection' }],
 *   orders: 'orders_collection'
 * })
 *
 * // Connection string example
 * new MongoDBReplicator({
 *   connectionString: 'mongodb://user:pass@localhost:27017/analytics',
 *   logCollection: 'replication_log'
 * }, {
 *   users: 'users_collection'
 * })
 *
 * See PLUGINS.md for comprehensive configuration documentation.
 */
class MongoDBReplicator extends BaseReplicator {
  constructor(config = {}, resources = {}) {
    super(config);
    this.connectionString = config.connectionString;
    this.host = config.host || 'localhost';
    this.port = config.port || 27017;
    this.database = config.database;
    this.username = config.username;
    this.password = config.password;
    this.options = config.options || {};
    this.client = null;
    this.db = null;
    this.logCollection = config.logCollection;

    // Parse resources configuration
    this.resources = this.parseResourcesConfig(resources);
  }

  parseResourcesConfig(resources) {
    const parsed = {};

    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === 'string') {
        // Short form: just collection name
        parsed[resourceName] = [{
          collection: config,
          actions: ['insert']
        }];
      } else if (Array.isArray(config)) {
        // Array form: multiple collection mappings
        parsed[resourceName] = config.map(item => {
          if (typeof item === 'string') {
            return { collection: item, actions: ['insert'] };
          }
          return {
            collection: item.collection,
            actions: item.actions || ['insert']
          };
        });
      } else if (typeof config === 'object') {
        // Single object form
        parsed[resourceName] = [{
          collection: config.collection,
          actions: config.actions || ['insert']
        }];
      }
    }

    return parsed;
  }

  validateConfig() {
    const errors = [];
    if (!this.connectionString && !this.database) {
      errors.push('Database name or connection string is required');
    }
    if (Object.keys(this.resources).length === 0) {
      errors.push('At least one resource must be configured');
    }

    // Validate resource configurations
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

  async initialize(database) {
    await super.initialize(database);

    // Load mongodb dependency
    const { MongoClient } = requirePluginDependency('mongodb', 'MongoDBReplicator');

    // Create connection
    const [ok, err] = await tryFn(async () => {
      let uri;
      if (this.connectionString) {
        uri = this.connectionString;
      } else {
        const auth = this.username && this.password
          ? `${encodeURIComponent(this.username)}:${encodeURIComponent(this.password)}@`
          : '';
        uri = `mongodb://${auth}${this.host}:${this.port}/${this.database}`;
      }

      this.client = new MongoClient(uri, {
        ...this.options,
        useUnifiedTopology: true,
        useNewUrlParser: true
      });

      await this.client.connect();
      this.db = this.client.db(this.database);

      // Test connection
      await this.db.admin().ping();
    });

    if (!ok) {
      throw new ReplicationError('Failed to connect to MongoDB database', {
        operation: 'initialize',
        replicatorClass: 'MongoDBReplicator',
        host: this.host,
        port: this.port,
        database: this.database,
        original: err,
        suggestion: 'Check MongoDB connection credentials and ensure database is accessible'
      });
    }

    // Create log collection if configured
    if (this.logCollection) {
      await this._createLogCollection();
    }

    this.emit('connected', {
      replicator: 'MongoDBReplicator',
      host: this.host,
      database: this.database
    });
  }

  async _createLogCollection() {
    const [ok] = await tryFn(async () => {
      const collections = await this.db.listCollections({ name: this.logCollection }).toArray();

      if (collections.length === 0) {
        await this.db.createCollection(this.logCollection);

        // Create indexes for better query performance
        await this.db.collection(this.logCollection).createIndexes([
          { key: { resource_name: 1 } },
          { key: { timestamp: 1 } }
        ]);
      }
    });

    if (!ok) {
      this.logger.warn('Failed to create log collection');
    }
  }

  async replicate(resourceName, operation, data, id) {
    if (!this.resources[resourceName]) {
      throw new ReplicationError('Resource not configured for replication', {
        operation: 'replicate',
        replicatorClass: 'MongoDBReplicator',
        resourceName,
        configuredResources: Object.keys(this.resources),
        suggestion: 'Add resource to replicator resources configuration'
      });
    }

    const results = [];

    for (const collectionConfig of this.resources[resourceName]) {
      if (!collectionConfig.actions.includes(operation)) {
        continue; // Skip if operation not allowed for this collection
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

        // Log to replication log collection if configured
        if (this.logCollection) {
          await this._logOperation(resourceName, operation, id, data);
        }
      } else {
        this.emit('replication_error', {
          resource: resourceName,
          operation,
          collection: collectionConfig.collection,
          error: error.message
        });

        this.logger.error(
          { resourceName, operation, error: error.message },
          'Failed to replicate'
        );
      }
    }

    return results.length > 0 ? results[0] : null;
  }

  async _insertDocument(collectionName, data) {
    const cleanData = this._cleanInternalFields(data);
    const collection = this.db.collection(collectionName);

    const result = await collection.insertOne(cleanData);
    return result;
  }

  async _updateDocument(collectionName, id, data) {
    const cleanData = this._cleanInternalFields(data);
    const collection = this.db.collection(collectionName);

    // Remove _id from update data if present
    delete cleanData._id;

    const result = await collection.updateOne(
      { _id: id },
      { $set: cleanData }
    );

    return result;
  }

  async _deleteDocument(collectionName, id) {
    const collection = this.db.collection(collectionName);
    const result = await collection.deleteOne({ _id: id });
    return result;
  }

  async _logOperation(resourceName, operation, id, data) {
    const [ok] = await tryFn(async () => {
      const collection = this.db.collection(this.logCollection);
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

  shouldReplicateResource(resourceName) {
    return this.resources.hasOwnProperty(resourceName);
  }

  _cleanInternalFields(data) {
    if (!data || typeof data !== 'object') return data;

    const cleanData = { ...data };

    // Remove internal s3db fields
    // Preserve _id as it's the MongoDB primary key
    Object.keys(cleanData).forEach(key => {
      if (key === '_id') {
        return; // Keep _id field for MongoDB
      }
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  async replicateBatch(resourceName, records) {
    const { results, errors } = await this.processBatch(
      records,
      async (record) => {
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
        mapError: (error, record) => ({ id: record.id, error: error.message })
      }
    );

    return {
      success: errors.length === 0,
      results,
      errors,
      total: records.length
    };
  }

  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      if (!this.client) {
        throw this.createError('Client not initialized', {
          operation: 'testConnection',
          statusCode: 503,
          retriable: true,
          suggestion: 'Ensure initialize() was called and the MongoDB client connected before testing connectivity.'
        });
      }

      await this.db.admin().ping();
      return true;
    });

    if (!ok) {
      this.emit('connection_error', { replicator: 'MongoDBReplicator', error: err.message });
      return false;
    }

    return true;
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.client && !!this.db,
      host: this.host,
      database: this.database,
      resources: Object.keys(this.resources)
    };
  }

  async cleanup() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
    await super.cleanup();
  }
}

export default MongoDBReplicator;
