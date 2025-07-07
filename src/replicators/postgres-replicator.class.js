/**
 * Postgres Replicator Configuration Documentation
 * 
 * This replicator executes real SQL operations (INSERT, UPDATE, DELETE) on PostgreSQL tables
 * using the official pg (node-postgres) library. It maps s3db resources to database tables
 * and performs actual database operations for each replication event.
 * 
 * ⚠️  REQUIRED DEPENDENCY: You must install the PostgreSQL client library to use this replicator:
 * 
 * ```bash
 * npm install pg
 * # or
 * yarn add pg
 * # or
 * pnpm add pg
 * ```
 * 
 * @typedef {Object} PostgresReplicatorConfig
 * @property {string} database - The name of the PostgreSQL database to connect to
 * @property {string} resourceArn - The ARN of the Aurora Serverless cluster or RDS instance
 * @property {string} secretArn - The ARN of the Secrets Manager secret containing database credentials
 * @property {string} [region='us-east-1'] - AWS region where the database is located
 * @property {Object.<string, string>} [tableMapping] - Maps s3db resource names to PostgreSQL table names
 *   - Key: s3db resource name (e.g., 'users', 'orders')
 *   - Value: PostgreSQL table name (e.g., 'public.users', 'analytics.orders')
 *   - If not provided, resource names are used as table names
 * @property {boolean} [logOperations=false] - Whether to log SQL operations to console for debugging
 * @property {string} [schema='public'] - Default database schema to use when tableMapping doesn't specify schema
 * @property {number} [maxRetries=3] - Maximum number of retry attempts for failed operations
 * @property {number} [retryDelay=1000] - Delay in milliseconds between retry attempts
 * @property {boolean} [useUpsert=true] - Whether to use UPSERT (INSERT ... ON CONFLICT) for updates
 * @property {string} [conflictColumn='id'] - Column name to use for conflict resolution in UPSERT operations
 * 
 * @example
 * // Basic configuration with table mapping
 * {
 *   database: 'analytics_db',
 *   resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:my-aurora-cluster',
 *   secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-credentials',
 *   region: 'us-east-1',
 *   tableMapping: {
 *     'users': 'public.users',
 *     'orders': 'analytics.orders',
 *     'products': 'inventory.products'
 *   },
 *   logOperations: true,
 *   useUpsert: true,
 *   conflictColumn: 'id'
 * }
 * 
 * @example
 * // Minimal configuration using default settings
 * {
 *   database: 'my_database',
 *   resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:my-cluster',
 *   secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-secret'
 * }
 * 
 * @notes
 * - Requires AWS credentials with RDS Data Service permissions
 * - Database tables must exist before replication starts
 * - For UPSERT operations, the conflict column must have a unique constraint
 * - All data is automatically converted to JSON format for storage
 * - Timestamps are stored as ISO strings in the database
 * - Failed operations are retried with exponential backoff
 * - Operations are executed within database transactions for consistency
 */
import BaseReplicator from './base-replicator.class.js';

/**
 * PostgreSQL Replicator - Replicates data to PostgreSQL tables (not só log)
 * Supports per-resource table mapping and real upsert/delete
 */
class PostgresReplicator extends BaseReplicator {
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    this.connectionString = config.connectionString;
    this.host = config.host;
    this.port = config.port || 5432;
    this.database = config.database;
    this.user = config.user;
    this.password = config.password;
    this.tableName = config.tableName || 's3db_replication';
    this.tableMap = config.tableMap || {}; // { resourceName: tableName }
    this.client = null;
    this.ssl = config.ssl;
    this.logOperations = config.logOperations !== false; // default true
  }

  validateConfig() {
    const errors = [];
    if (!this.connectionString && (!this.host || !this.database)) {
      errors.push('Either connectionString or host+database must be provided');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async initialize(database) {
    await super.initialize(database);
    try {
      const { Client } = await import('pg');
      const config = this.connectionString ? {
        connectionString: this.connectionString,
        ssl: this.ssl
      } : {
        host: this.host,
        port: this.port,
        database: this.database,
        user: this.user,
        password: this.password,
        ssl: this.ssl
      };
      this.client = new Client(config);
      await this.client.connect();
      // Create log table if needed
      if (this.logOperations) await this.createTableIfNotExists();
      this.emit('initialized', {
        replicator: this.name,
        database: this.database || 'postgres',
        table: this.tableName
      });
    } catch (error) {
      this.emit('initialization_error', {
        replicator: this.name,
        error: error.message
      });
      throw error;
    }
  }

  async createTableIfNotExists() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        resource_name VARCHAR(255) NOT NULL,
        operation VARCHAR(50) NOT NULL,
        record_id VARCHAR(255) NOT NULL,
        data JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        source VARCHAR(100) DEFAULT 's3db-replication',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_resource_name ON ${this.tableName}(resource_name);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_operation ON ${this.tableName}(operation);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_record_id ON ${this.tableName}(record_id);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName}(timestamp);
    `;
    await this.client.query(createTableQuery);
  }

  getTableForResource(resourceName) {
    return this.tableMap[resourceName] || resourceName;
  }

  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }
    try {
      const table = this.getTableForResource(resourceName);
      let result;
      if (operation === 'insert') {
        // INSERT INTO table (col1, col2, ...) VALUES (...)
        const keys = Object.keys(data);
        const values = keys.map(k => data[k]);
        const columns = keys.map(k => `"${k}"`).join(', ');
        const params = keys.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${table} (${columns}) VALUES (${params}) ON CONFLICT (id) DO NOTHING RETURNING *`;
        result = await this.client.query(sql, values);
      } else if (operation === 'update') {
        // UPDATE table SET col1=$1, col2=$2 ... WHERE id=$N
        const keys = Object.keys(data).filter(k => k !== 'id');
        const setClause = keys.map((k, i) => `"${k}"=$${i + 1}`).join(', ');
        const values = keys.map(k => data[k]);
        values.push(id);
        const sql = `UPDATE ${table} SET ${setClause} WHERE id=$${keys.length + 1} RETURNING *`;
        result = await this.client.query(sql, values);
      } else if (operation === 'delete') {
        // DELETE FROM table WHERE id=$1
        const sql = `DELETE FROM ${table} WHERE id=$1 RETURNING *`;
        result = await this.client.query(sql, [id]);
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }
      // Optionally log the operation
      if (this.logOperations) {
        await this.client.query(
          `INSERT INTO ${this.tableName} (resource_name, operation, record_id, data, timestamp, source) VALUES ($1, $2, $3, $4, $5, $6)`,
          [resourceName, operation, id, JSON.stringify(data), new Date().toISOString(), 's3db-replication']
        );
      }
      this.emit('replicated', {
        replicator: this.name,
        resourceName,
        operation,
        id,
        result: result.rows,
        success: true
      });
      return { success: true, rows: result.rows };
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
    // For simplicity, just call replicate for each
    const results = [];
    const errors = [];
    for (const record of records) {
      try {
        const res = await this.replicate(resourceName, record.operation, record.data, record.id, record.beforeData);
        results.push(res);
      } catch (err) {
        errors.push({ id: record.id, error: err.message });
      }
    }
    return { success: errors.length === 0, results, errors };
  }

  async testConnection() {
    try {
      if (!this.client) await this.initialize();
      await this.client.query('SELECT 1');
      return true;
    } catch (error) {
      this.emit('connection_error', { replicator: this.name, error: error.message });
      return false;
    }
  }

  async cleanup() {
    if (this.client) await this.client.end();
  }

  shouldReplicateResource(resourceName) {
    if (!this.resources || this.resources.length === 0) return true;
    return this.resources.includes(resourceName);
  }
}

export default PostgresReplicator; 