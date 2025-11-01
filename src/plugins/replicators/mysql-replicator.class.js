import tryFn from "#src/concerns/try-fn.js";
import requirePluginDependency from "#src/plugins/concerns/plugin-dependencies.js";
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
import {
  generateMySQLCreateTable,
  getMySQLTableSchema,
  generateMySQLAlterTable
} from './schema-sync.helper.js';

/**
 * MySQL/MariaDB Replicator - Replicate data to MySQL or MariaDB tables
 *
 * ⚠️  REQUIRED DEPENDENCY: You must install the MySQL client library:
 * ```bash
 * pnpm add mysql2
 * ```
 *
 * Configuration:
 * @param {string} connectionString - MySQL connection string (optional)
 * @param {string} host - Database host (default: localhost)
 * @param {number} port - Database port (default: 3306)
 * @param {string} database - Database name (required)
 * @param {string} user - Database user (required)
 * @param {string} password - Database password (required)
 * @param {Object} ssl - SSL configuration (optional)
 * @param {number} connectionLimit - Max connections in pool (default: 10)
 * @param {string} logTable - Table name for operation logging (optional)
 * @param {Object} schemaSync - Schema synchronization configuration
 * @param {boolean} schemaSync.enabled - Enable automatic schema management (default: false)
 * @param {string} schemaSync.strategy - Sync strategy: 'alter' | 'drop-create' | 'validate-only' (default: 'alter')
 * @param {string} schemaSync.onMismatch - Action on schema mismatch: 'error' | 'warn' | 'ignore' (default: 'error')
 * @param {boolean} schemaSync.autoCreateTable - Auto-create table if not exists (default: true)
 * @param {boolean} schemaSync.autoCreateColumns - Auto-add missing columns (default: true, only with strategy: 'alter')
 * @param {boolean} schemaSync.dropMissingColumns - Remove extra columns (default: false, dangerous!)
 *
 * @example
 * new MySQLReplicator({
 *   host: 'localhost',
 *   port: 3306,
 *   database: 'analytics',
 *   user: 'replicator',
 *   password: 'secret',
 *   logTable: 'replication_log',
 *   schemaSync: {
 *     enabled: true,
 *     strategy: 'alter',
 *     onMismatch: 'error'
 *   }
 * }, {
 *   users: [{ actions: ['insert', 'update'], table: 'users_table' }],
 *   orders: 'orders_table'
 * })
 *
 * See PLUGINS.md for comprehensive configuration documentation.
 */
class MySQLReplicator extends BaseReplicator {
  constructor(config = {}, resources = {}) {
    super(config);
    this.connectionString = config.connectionString;
    this.host = config.host || 'localhost';
    this.port = config.port || 3306;
    this.database = config.database;
    this.user = config.user;
    this.password = config.password;
    this.pool = null;
    this.ssl = config.ssl;
    this.connectionLimit = config.connectionLimit || 10;
    this.logTable = config.logTable;

    // Schema sync configuration
    this.schemaSync = {
      enabled: config.schemaSync?.enabled || false,
      strategy: config.schemaSync?.strategy || 'alter',
      onMismatch: config.schemaSync?.onMismatch || 'error',
      autoCreateTable: config.schemaSync?.autoCreateTable !== false,
      autoCreateColumns: config.schemaSync?.autoCreateColumns !== false,
      dropMissingColumns: config.schemaSync?.dropMissingColumns || false
    };

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
    if (!this.database) {
      errors.push('Database name is required');
    }
    if (!this.user) {
      errors.push('Database user is required');
    }
    if (!this.password) {
      errors.push('Database password is required');
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
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  async initialize(database) {
    await super.initialize(database);

    // Load mysql2 dependency
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator');

    // Create connection pool
    const [ok, err] = await tryFn(async () => {
      const poolConfig = {
        host: this.host,
        port: this.port,
        user: this.user,
        password: this.password,
        database: this.database,
        connectionLimit: this.connectionLimit,
        waitForConnections: true,
        queueLimit: 0
      };

      if (this.ssl) {
        poolConfig.ssl = this.ssl;
      }

      this.pool = mysql.createPool(poolConfig);

      // Test connection
      const connection = await this.pool.promise().getConnection();
      await connection.ping();
      connection.release();
    });

    if (!ok) {
      throw new ReplicationError('Failed to connect to MySQL database', {
        operation: 'initialize',
        replicatorClass: 'MySQLReplicator',
        host: this.host,
        port: this.port,
        database: this.database,
        original: err,
        suggestion: 'Check MySQL connection credentials and ensure database is accessible'
      });
    }

    // Create log table if configured
    if (this.logTable) {
      await this._createLogTable();
    }

    // Sync schemas if enabled
    if (this.schemaSync.enabled) {
      await this.syncSchemas(database);
    }

    this.emit('connected', {
      replicator: 'MySQLReplicator',
      host: this.host,
      database: this.database
    });
  }

  /**
   * Sync table schemas based on S3DB resource definitions
   */
  async syncSchemas(database) {
    for (const [resourceName, tableConfigs] of Object.entries(this.resources)) {
      const [okRes, errRes, resource] = await tryFn(async () => {
        return await database.getResource(resourceName);
      });

      if (!okRes) {
        if (this.config.verbose) {
          console.warn(`[MySQLReplicator] Could not get resource ${resourceName} for schema sync: ${errRes.message}`);
        }
        continue;
      }

      const allAttributes = resource.config.versions[resource.config.currentVersion]?.attributes || {};

      // Filter out plugin attributes - they are internal and should not be replicated
      const pluginAttrNames = resource.schema?._pluginAttributes
        ? Object.values(resource.schema._pluginAttributes).flat()
        : [];
      const attributes = Object.fromEntries(
        Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name))
      );

      for (const tableConfig of tableConfigs) {
        const tableName = tableConfig.table;

        const [okSync, errSync] = await tryFn(async () => {
          await this.syncTableSchema(tableName, attributes);
        });

        if (!okSync) {
          const message = `Schema sync failed for table ${tableName}: ${errSync.message}`;

          if (this.schemaSync.onMismatch === 'error') {
            throw this.createError(message, {
              operation: 'schemaSync',
              resourceName,
              tableName,
              statusCode: 409,
              retriable: errSync?.retriable ?? false,
              suggestion: 'Update the MySQL table schema to match the resource definition or adjust schemaSync.onMismatch.',
              docs: 'docs/plugins/replicator.md'
            });
          } else if (this.schemaSync.onMismatch === 'warn') {
            console.warn(`[MySQLReplicator] ${message}`);
          }
        }
      }
    }

    this.emit('schema_sync_completed', {
      replicator: this.name,
      resources: Object.keys(this.resources)
    });
  }

  /**
   * Sync a single table schema
   */
  async syncTableSchema(tableName, attributes) {
    const connection = await this.pool.promise().getConnection();

    try {
      // Check if table exists
      const existingSchema = await getMySQLTableSchema(connection, tableName);

      if (!existingSchema) {
        if (!this.schemaSync.autoCreateTable) {
          throw this.createError(`Table ${tableName} does not exist and autoCreateTable is disabled`, {
            operation: 'schemaSync',
            tableName,
            statusCode: 404,
            retriable: false,
            suggestion: 'Provision the table manually or enable schemaSync.autoCreateTable.'
          });
        }

        if (this.schemaSync.strategy === 'validate-only') {
          throw this.createError(`Table ${tableName} does not exist (validate-only mode)`, {
            operation: 'schemaSync',
            tableName,
            statusCode: 404,
            retriable: false,
            suggestion: 'Create the table before running validate-only checks or choose the alter strategy.'
          });
        }

        // Create table
        const createSQL = generateMySQLCreateTable(tableName, attributes);

        if (this.config.verbose) {
          console.log(`[MySQLReplicator] Creating table ${tableName}:\n${createSQL}`);
        }

        await connection.query(createSQL);

        this.emit('table_created', {
          replicator: this.name,
          tableName,
          attributes: Object.keys(attributes)
        });

        return;
      }

      // Table exists - check for schema changes
      if (this.schemaSync.strategy === 'drop-create') {
        if (this.config.verbose) {
          console.warn(`[MySQLReplicator] Dropping and recreating table ${tableName}`);
        }

        await connection.query(`DROP TABLE IF EXISTS ${tableName}`);
        const createSQL = generateMySQLCreateTable(tableName, attributes);
        await connection.query(createSQL);

        this.emit('table_recreated', {
          replicator: this.name,
          tableName,
          attributes: Object.keys(attributes)
        });

        return;
      }

      if (this.schemaSync.strategy === 'alter' && this.schemaSync.autoCreateColumns) {
        const alterStatements = generateMySQLAlterTable(tableName, attributes, existingSchema);

        if (alterStatements.length > 0) {
          if (this.config.verbose) {
            console.log(`[MySQLReplicator] Altering table ${tableName}:`, alterStatements);
          }

          for (const stmt of alterStatements) {
            await connection.query(stmt);
          }

          this.emit('table_altered', {
            replicator: this.name,
            tableName,
            addedColumns: alterStatements.length
          });
        }
      }

      if (this.schemaSync.strategy === 'validate-only') {
        const alterStatements = generateMySQLAlterTable(tableName, attributes, existingSchema);

        if (alterStatements.length > 0) {
          throw this.createError(`Table ${tableName} schema mismatch. Missing columns: ${alterStatements.length}`, {
            operation: 'schemaValidation',
            tableName,
            statusCode: 409,
            retriable: false,
            suggestion: 'Add the missing columns to the MySQL table or enable schemaSync.autoCreateColumns.'
          });
        }
      }
    } finally {
      connection.release();
    }
  }

  shouldReplicateResource(resourceName) {
    return this.resources.hasOwnProperty(resourceName);
  }

  async _createLogTable() {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator');

    const [ok] = await tryFn(async () => {
      await this.pool.promise().query(`
        CREATE TABLE IF NOT EXISTS ${mysql.escapeId(this.logTable)} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          resource_name VARCHAR(255) NOT NULL,
          operation VARCHAR(50) NOT NULL,
          record_id VARCHAR(255),
          data JSON,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_resource (resource_name),
          INDEX idx_timestamp (timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    });

    if (!ok && this.config.verbose) {
      console.warn('[MySQLReplicator] Failed to create log table');
    }
  }

  async replicate(resourceName, operation, data, id) {
    if (!this.resources[resourceName]) {
      throw new ReplicationError('Resource not configured for replication', {
        operation: 'replicate',
        replicatorClass: 'MySQLReplicator',
        resourceName,
        configuredResources: Object.keys(this.resources),
        suggestion: 'Add resource to replicator resources configuration'
      });
    }

    const results = [];

    for (const tableConfig of this.resources[resourceName]) {
      if (!tableConfig.actions.includes(operation)) {
        continue; // Skip if operation not allowed for this table
      }

      const [ok, error, result] = await tryFn(async () => {
        switch (operation) {
          case 'insert':
            return await this._insertRecord(tableConfig.table, data);
          case 'update':
            return await this._updateRecord(tableConfig.table, id, data);
          case 'delete':
            return await this._deleteRecord(tableConfig.table, id);
          default:
            throw new ReplicationError(`Unsupported operation: ${operation}`, {
              operation: 'replicate',
              replicatorClass: 'MySQLReplicator',
              invalidOperation: operation,
              supportedOperations: ['insert', 'update', 'delete']
            });
        }
      });

      if (ok) {
        results.push(result);

        // Log to replication log table if configured
        if (this.logTable) {
          await this._logOperation(resourceName, operation, id, data);
        }
      } else {
        this.emit('replication_error', {
          resource: resourceName,
          operation,
          table: tableConfig.table,
          error: error.message
        });

        if (this.config.verbose) {
          console.error(`[MySQLReplicator] Failed to replicate ${operation} for ${resourceName}:`, error);
        }
      }
    }

    return results.length > 0 ? results[0] : null;
  }

  async _insertRecord(table, data) {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator');
    const cleanData = this._cleanInternalFields(data);

    const columns = Object.keys(cleanData);
    const values = Object.values(cleanData);
    const placeholders = values.map(() => '?').join(', ');

    const query = `INSERT INTO ${mysql.escapeId(table)} (${columns.map(c => mysql.escapeId(c)).join(', ')}) VALUES (${placeholders})`;

    const [result] = await this.pool.promise().query(query, values);
    return result;
  }

  async _updateRecord(table, id, data) {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator');
    const cleanData = this._cleanInternalFields(data);

    const updates = Object.keys(cleanData)
      .map(col => `${mysql.escapeId(col)} = ?`)
      .join(', ');

    const values = [...Object.values(cleanData), id];

    const query = `UPDATE ${mysql.escapeId(table)} SET ${updates} WHERE id = ?`;

    const [result] = await this.pool.promise().query(query, values);
    return result;
  }

  async _deleteRecord(table, id) {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator');
    const query = `DELETE FROM ${mysql.escapeId(table)} WHERE id = ?`;

    const [result] = await this.pool.promise().query(query, [id]);
    return result;
  }

  async _logOperation(resourceName, operation, id, data) {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator');

    const [ok] = await tryFn(async () => {
      const query = `INSERT INTO ${mysql.escapeId(this.logTable)} (resource_name, operation, record_id, data) VALUES (?, ?, ?, ?)`;
      await this.pool.promise().query(query, [resourceName, operation, id, JSON.stringify(data)]);
    });

    if (!ok && this.config.verbose) {
      console.warn('[MySQLReplicator] Failed to log operation');
    }
  }

  _cleanInternalFields(data) {
    if (!data || typeof data !== 'object') return data;

    const cleanData = { ...data };

    // Remove internal s3db fields
    Object.keys(cleanData).forEach(key => {
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
      if (!this.pool) {
        throw this.createError('Pool not initialized', {
          operation: 'testConnection',
          statusCode: 503,
          retriable: true,
          suggestion: 'Call initialize() before testing the connection or ensure the pool was not cleaned up prematurely.'
        });
      }

      const connection = await this.pool.promise().getConnection();
      await connection.ping();
      connection.release();
      return true;
    });

    if (!ok) {
      this.emit('connection_error', { replicator: 'MySQLReplicator', error: err.message });
      return false;
    }

    return true;
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.pool,
      host: this.host,
      database: this.database,
      resources: Object.keys(this.resources),
      poolConnections: this.pool ? this.pool.pool.allConnections.length : 0,
      schemaSync: this.schemaSync
    };
  }

  async cleanup() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    await super.cleanup();
  }
}

export default MySQLReplicator;
