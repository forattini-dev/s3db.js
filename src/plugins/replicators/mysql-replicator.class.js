import tryFn from "#src/concerns/try-fn.js";
import requirePluginDependency from "#src/plugins/concerns/plugin-dependencies.js";
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';

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
 *
 * @example
 * new MySQLReplicator({
 *   host: 'localhost',
 *   port: 3306,
 *   database: 'analytics',
 *   user: 'replicator',
 *   password: 'secret',
 *   logTable: 'replication_log'
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

    this.emit('connected', {
      replicator: 'MySQLReplicator',
      host: this.host,
      database: this.database
    });
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
    const results = [];
    const errors = [];

    for (const record of records) {
      const [ok, err, result] = await tryFn(() =>
        this.replicate(resourceName, record.operation, record.data, record.id)
      );

      if (ok) {
        results.push(result);
      } else {
        errors.push({ id: record.id, error: err.message });
      }
    }

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
        throw new Error('Pool not initialized');
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
      poolConnections: this.pool ? this.pool.pool.allConnections.length : 0
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
