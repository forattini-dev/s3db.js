/**
 * Postgres Replicator Configuration Documentation
 * 
 * This replicator executes real SQL operations (INSERT, UPDATE, DELETE) on PostgreSQL tables
 * using the official pg (node-postgres) library. It maps s3db resources to database tables
 * and performs actual database operations for each replicator event.
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
 * - Database tables must exist before replicator starts
 * - For UPSERT operations, the conflict column must have a unique constraint
 * - All data is automatically converted to JSON format for storage
 * - Timestamps are stored as ISO strings in the database
 * - Failed operations are retried with exponential backoff
 * - Operations are executed within database transactions for consistency
 */
import BaseReplicator from './base-replicator.class.js';
import tryFn from "../../concerns/try-fn.js";

/**
 * PostgreSQL Replicator
 *
 * Replicates data to PostgreSQL tables, supporting per-resource table mapping and action filtering.
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
 * @config {Object} config - Configuration object for the replicator
 * @config {string} [config.connectionString] - PostgreSQL connection string (alternative to individual params)
 * @config {string} [config.host] - Database host (required if not using connectionString)
 * @config {number} [config.port=5432] - Database port
 * @config {string} [config.database] - Database name (required if not using connectionString)
 * @config {string} [config.user] - Database user (required if not using connectionString)
 * @config {string} [config.password] - Database password (required if not using connectionString)
 * @config {Object} [config.ssl] - SSL configuration
 * @config {string} [config.logTable] - Table name for operation logging. If omitted, no logging is performed.
 * @config {Object} resources - Resource configuration mapping
 * @config {Object|string} resources[resourceName] - Resource configuration
 * @config {string} resources[resourceName].table - Table name for this resource
 * @config {Array} resources[resourceName].actions - Array of actions to replicate (insert, update, delete)
 * @config {string} resources[resourceName] - Short form: just the table name (equivalent to { actions: ['insert'], table: tableName })
 *
 * @example
 * new PostgresReplicator({
 *   connectionString: 'postgresql://user:password@localhost:5432/analytics',
 *   ssl: false,
 *   logTable: 's3db_replicator_log'
 * }, {
 *   users: [
 *     { actions: ['insert', 'update', 'delete'], table: 'users_table' },
 *   ],
 *   orders: [
 *     { actions: ['insert'], table: 'orders_table' },
 *     { actions: ['insert'], table: 'orders_analytics' }, // Also replicate to analytics table
 *   ],
 *   products: 'products_table' // Short form: equivalent to { actions: ['insert'], table: 'products_table' }
 * })
 *
 * Notes:
 * - The target tables must exist and have columns matching the resource attributes (id is required as primary key)
 * - The log table must have columns: resource_name, operation, record_id, data, timestamp, source
 * - Uses pg (node-postgres) library
 * - Supports UPSERT operations with ON CONFLICT handling
 */
class PostgresReplicator extends BaseReplicator {
  constructor(config = {}, resources = {}) {
    super(config);
    this.connectionString = config.connectionString;
    this.host = config.host;
    this.port = config.port || 5432;
    this.database = config.database;
    this.user = config.user;
    this.password = config.password;
    this.client = null;
    this.ssl = config.ssl;
    this.logTable = config.logTable;
    
    // Parse resources configuration
    this.resources = this.parseResourcesConfig(resources);
  }

  parseResourcesConfig(resources) {
    const parsed = {};
    
    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === 'string') {
        // Short form: just table name
        parsed[resourceName] = [{
          table: config,
          actions: ['insert']
        }];
      } else if (Array.isArray(config)) {
        // Array form: multiple table mappings
        parsed[resourceName] = config.map(item => {
          if (typeof item === 'string') {
            return { table: item, actions: ['insert'] };
          }
          return {
            table: item.table,
            actions: item.actions || ['insert']
          };
        });
      } else if (typeof config === 'object') {
        // Single object form
        parsed[resourceName] = [{
          table: config.table,
          actions: config.actions || ['insert']
        }];
      }
    }
    
    return parsed;
  }

  validateConfig() {
    const errors = [];
    if (!this.connectionString && (!this.host || !this.database)) {
      errors.push('Either connectionString or host+database must be provided');
    }
    if (Object.keys(this.resources).length === 0) {
      errors.push('At least one resource must be configured');
    }
    
    // Validate resource configurations
    for (const [resourceName, tables] of Object.entries(this.resources)) {
      for (const tableConfig of tables) {
        if (!tableConfig.table) {
          errors.push(`Table name is required for resource '${resourceName}'`);
        }
        if (!Array.isArray(tableConfig.actions) || tableConfig.actions.length === 0) {
          errors.push(`Actions array is required for resource '${resourceName}'`);
        }
        const validActions = ['insert', 'update', 'delete'];
        const invalidActions = tableConfig.actions.filter(action => !validActions.includes(action));
        if (invalidActions.length > 0) {
          errors.push(`Invalid actions for resource '${resourceName}': ${invalidActions.join(', ')}. Valid actions: ${validActions.join(', ')}`);
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  async initialize(database) {
    await super.initialize(database);
    const [ok, err, sdk] = await tryFn(() => import('pg'));
    if (!ok) {
      this.emit('initialization_error', {
        replicator: this.name,
        error: err.message
      });
      throw err;
    }
    const { Client } = sdk;
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
    // Create log table if configured
    if (this.logTable) {
      await this.createLogTableIfNotExists();
    }
    this.emit('initialized', {
      replicator: this.name,
      database: this.database || 'postgres',
      resources: Object.keys(this.resources)
    });
  }

  async createLogTableIfNotExists() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.logTable} (
        id SERIAL PRIMARY KEY,
        resource_name VARCHAR(255) NOT NULL,
        operation VARCHAR(50) NOT NULL,
        record_id VARCHAR(255) NOT NULL,
        data JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        source VARCHAR(100) DEFAULT 's3db-replicator',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_resource_name ON ${this.logTable}(resource_name);
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_operation ON ${this.logTable}(operation);
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_record_id ON ${this.logTable}(record_id);
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_timestamp ON ${this.logTable}(timestamp);
    `;
    await this.client.query(createTableQuery);
  }

  shouldReplicateResource(resourceName) {
    return this.resources.hasOwnProperty(resourceName);
  }

  shouldReplicateAction(resourceName, operation) {
    if (!this.resources[resourceName]) return false;
    
    return this.resources[resourceName].some(tableConfig => 
      tableConfig.actions.includes(operation)
    );
  }

  getTablesForResource(resourceName, operation) {
    if (!this.resources[resourceName]) return [];
    
    return this.resources[resourceName]
      .filter(tableConfig => tableConfig.actions.includes(operation))
      .map(tableConfig => tableConfig.table);
  }

  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    if (!this.shouldReplicateAction(resourceName, operation)) {
      return { skipped: true, reason: 'action_not_included' };
    }

    const tables = this.getTablesForResource(resourceName, operation);
    if (tables.length === 0) {
      return { skipped: true, reason: 'no_tables_for_action' };
    }

    const results = [];
    const errors = [];

    const [ok, err, result] = await tryFn(async () => {
      // Replicate to all applicable tables
      for (const table of tables) {
        const [okTable, errTable] = await tryFn(async () => {
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

          results.push({
            table,
            success: true,
            rows: result.rows,
            rowCount: result.rowCount
          });
        });
        if (!okTable) {
          errors.push({
            table,
            error: errTable.message
          });
        }
      }
      // Log operation if logTable is configured
      if (this.logTable) {
        const [okLog, errLog] = await tryFn(async () => {
          await this.client.query(
            `INSERT INTO ${this.logTable} (resource_name, operation, record_id, data, timestamp, source) VALUES ($1, $2, $3, $4, $5, $6)`,
            [resourceName, operation, id, JSON.stringify(data), new Date().toISOString(), 's3db-replicator']
          );
        });
        if (!okLog) {
          // Don't fail the main operation if logging fails
        }
      }
      const success = errors.length === 0;
      this.emit('replicated', {
        replicator: this.name,
        resourceName,
        operation,
        id,
        tables,
        results,
        errors,
        success
      });
      return { 
        success, 
        results, 
        errors,
        tables 
      };
    });
    if (ok) return result;
    this.emit('replicator_error', {
      replicator: this.name,
      resourceName,
      operation,
      id,
      error: err.message
    });
    return { success: false, error: err.message };
  }

  async replicateBatch(resourceName, records) {
    const results = [];
    const errors = [];
    
    for (const record of records) {
      const [ok, err, res] = await tryFn(() => this.replicate(
        resourceName, 
        record.operation, 
        record.data, 
        record.id, 
        record.beforeData
      ));
      if (ok) results.push(res);
      else errors.push({ id: record.id, error: err.message });
    }
    
    return { 
      success: errors.length === 0, 
      results, 
      errors 
    };
  }

  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      if (!this.client) await this.initialize();
      await this.client.query('SELECT 1');
      return true;
    });
    if (ok) return true;
    this.emit('connection_error', { replicator: this.name, error: err.message });
    return false;
  }

  async cleanup() {
    if (this.client) await this.client.end();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      database: this.database || 'postgres',
      resources: this.resources,
      logTable: this.logTable
    };
  }
}

export default PostgresReplicator; 