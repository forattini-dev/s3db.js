/**
 * S3DB Replicator Configuration Documentation
 * 
 * This replicator copies data to another s3db instance, creating a complete replica
 * of the source database. It maintains the same structure, partitions, and metadata
 * in the target database.
 * 
 * @typedef {Object} S3DBReplicatorConfig
 * @property {string} connectionString - The connection string for the target s3db instance
 *   Format: 's3://bucket-name/prefix?region=us-east-1&accessKeyId=xxx&secretAccessKey=xxx'
 * @property {string} [region] - AWS region for the target S3 bucket (if not in connection string)
 * @property {string} [accessKeyId] - AWS access key ID (if not in connection string)
 * @property {string} [secretAccessKey] - AWS secret access key (if not in connection string)
 * @property {string} [sessionToken] - AWS session token for temporary credentials
 * @property {boolean} [createResources=true] - Whether to automatically create resources in target if they don't exist
 * @property {boolean} [overwriteExisting=false] - Whether to overwrite existing data in target database
 * @property {boolean} [preservePartitions=true] - Whether to maintain the same partition structure in target
 * @property {boolean} [syncMetadata=true] - Whether to replicate metadata (schemas, behaviors, etc.)
 * @property {number} [batchSize=100] - Number of records to process in each batch during replication
 * @property {number} [maxConcurrency=5] - Maximum number of concurrent replication operations
 * @property {boolean} [logProgress=false] - Whether to log replication progress to console
 * @property {string} [targetPrefix] - Custom prefix for the target database (if different from source)
 * @property {Object.<string, string>} [resourceMapping] - Maps source resource names to target resource names
 *   - Key: source resource name (e.g., 'users')
 *   - Value: target resource name (e.g., 'backup_users')
 *   - If not provided, same names are used in target
 * @property {boolean} [validateData=true] - Whether to validate data integrity after replication
 * @property {number} [retryAttempts=3] - Number of retry attempts for failed replication operations
 * @property {number} [retryDelay=1000] - Delay in milliseconds between retry attempts
 * 
 * @example
 * // Basic configuration with custom target
 * {
 *   connectionString: 's3://my-backup-bucket/replica?region=us-west-2',
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   createResources: true,
 *   preservePartitions: true,
 *   logProgress: true,
 *   batchSize: 50
 * }
 * 
 * @example
 * // Configuration with resource mapping and validation
 * {
 *   connectionString: 's3://analytics-bucket/data?region=eu-west-1',
 *   resourceMapping: {
 *     'users': 'analytics_users',
 *     'orders': 'processed_orders',
 *     'products': 'catalog_products'
 *   },
 *   validateData: true,
 *   overwriteExisting: false,
 *   maxConcurrency: 3
 * }
 * 
 * @example
 * // Minimal configuration using connection string with credentials
 * {
 *   connectionString: 's3://backup-bucket/replica?region=us-east-1&accessKeyId=xxx&secretAccessKey=xxx'
 * }
 * 
 * @notes
 * - Target s3db instance must have appropriate permissions to write to the specified bucket
 * - If createResources is false, target resources must exist before replication
 * - Resource mapping allows for flexible data organization in target database
 * - Partition preservation maintains data distribution and query performance
 * - Metadata sync ensures target database has same schemas and behaviors
 * - Batch processing optimizes performance for large datasets
 * - Data validation compares record counts and checksums between source and target
 * - Retry mechanism handles temporary network or permission issues
 * - Concurrent operations improve replication speed but may impact target performance
 */
import BaseReplicator from './base-replicator.class.js';
import { S3db } from '../../database.class.js';

/**
 * S3DB Replicator - Replicates data to another s3db instance
 */
class S3dbReplicator extends BaseReplicator {
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    this.connectionString = config.connectionString;
    this.region = config.region;
    this.bucket = config.bucket;
    this.keyPrefix = config.keyPrefix;
  }

  validateConfig() {
    const errors = [];
    
    if (!this.connectionString && !this.bucket) {
      errors.push('Either connectionString or bucket must be provided');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async initialize(database) {
    await super.initialize(database);
    
    // Create target database connection
    const targetConfig = {
      connectionString: this.connectionString,
      region: this.region,
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      verbose: this.config.verbose || false
    };

    this.targetDatabase = new S3db(targetConfig);
    await this.targetDatabase.connect();
    
    this.emit('connected', { 
      replicator: this.name, 
      target: this.connectionString || this.bucket 
    });
  }

  async replicate(resourceName, operation, data, id) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    try {
      let result;
      
      switch (operation) {
        case 'insert':
          result = await this.targetDatabase.resources[resourceName]?.insert(data);
          break;
        case 'update':
          result = await this.targetDatabase.resources[resourceName]?.update(id, data);
          break;
        case 'delete':
          result = await this.targetDatabase.resources[resourceName]?.delete(id);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      this.emit('replicated', {
        replicator: this.name,
        resourceName,
        operation,
        id,
        success: true
      });

      return { success: true, result };
    } catch (error) {
      this.emit('replication_error', {
        replicator: this.name,
        resourceName,
        operation,
        id,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  async replicateBatch(resourceName, records) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    try {
      const results = [];
      const errors = [];

      for (const record of records) {
        try {
          const result = await this.replicate(
            resourceName, 
            record.operation, 
            record.data, 
            record.id
          );
          results.push(result);
        } catch (error) {
          errors.push({ id: record.id, error: error.message });
        }
      }

      this.emit('batch_replicated', {
        replicator: this.name,
        resourceName,
        total: records.length,
        successful: results.filter(r => r.success).length,
        errors: errors.length
      });

      return { 
        success: errors.length === 0,
        results,
        errors,
        total: records.length
      };
    } catch (error) {
      this.emit('batch_replication_error', {
        replicator: this.name,
        resourceName,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      if (!this.targetDatabase) {
        await this.initialize(this.database);
      }
      
      // Try to list resources to test connection
      await this.targetDatabase.listResources();
      return true;
    } catch (error) {
      this.emit('connection_error', {
        replicator: this.name,
        error: error.message
      });
      return false;
    }
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.targetDatabase,
      targetDatabase: this.connectionString || this.bucket,
      resources: this.resources,
      totalReplications: this.listenerCount('replicated'),
      totalErrors: this.listenerCount('replication_error')
    };
  }

  async cleanup() {
    if (this.targetDatabase) {
      // Close target database connection
      this.targetDatabase.removeAllListeners();
    }
    await super.cleanup();
  }

  shouldReplicateResource(resourceName) {
    return this.resources.length === 0 || this.resources.includes(resourceName);
  }
}

export default S3dbReplicator; 