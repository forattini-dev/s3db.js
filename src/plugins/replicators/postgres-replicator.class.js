import tryFn from "#src/concerns/try-fn.js";
import BaseReplicator from './base-replicator.class.js';

/**
 * PostgreSQL Replicator - Replicate data to PostgreSQL tables
 * 
 * ⚠️  REQUIRED DEPENDENCY: You must install the PostgreSQL client library:
 * ```bash
 * pnpm add pg
 * ```
 * 
 * Configuration:
 * @param {string} connectionString - PostgreSQL connection string (required)
 * @param {string} host - Database host (alternative to connectionString)
 * @param {number} port - Database port (default: 5432)
 * @param {string} database - Database name
 * @param {string} user - Database user
 * @param {string} password - Database password
 * @param {Object} ssl - SSL configuration (optional)
 * @param {string} logTable - Table name for operation logging (optional)
 * 
 * @example
 * new PostgresReplicator({
 *   connectionString: 'postgresql://user:password@localhost:5432/analytics',
 *   logTable: 'replication_log'
 * }, {
 *   users: [{ actions: ['insert', 'update'], table: 'users_table' }],
 *   orders: 'orders_table'
 * })
 * 
 * See PLUGINS.md for comprehensive configuration documentation.
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
      if (this.config.verbose) {
        console.warn(`[PostgresReplicator] Failed to import pg SDK: ${err.message}`);
      }
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
            // Clean internal fields before processing
            const cleanData = this._cleanInternalFields(data);
            // INSERT INTO table (col1, col2, ...) VALUES (...)
            const keys = Object.keys(cleanData);
            const values = keys.map(k => cleanData[k]);
            const columns = keys.map(k => `"${k}"`).join(', ');
            const params = keys.map((_, i) => `$${i + 1}`).join(', ');
            const sql = `INSERT INTO ${table} (${columns}) VALUES (${params}) ON CONFLICT (id) DO NOTHING RETURNING *`;
            result = await this.client.query(sql, values);
          } else if (operation === 'update') {
            // Clean internal fields before processing
            const cleanData = this._cleanInternalFields(data);
            // UPDATE table SET col1=$1, col2=$2 ... WHERE id=$N
            const keys = Object.keys(cleanData).filter(k => k !== 'id');
            const setClause = keys.map((k, i) => `"${k}"=$${i + 1}`).join(', ');
            const values = keys.map(k => cleanData[k]);
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
      
      // Log errors if any occurred
      if (errors.length > 0) {
        console.warn(`[PostgresReplicator] Replication completed with errors for ${resourceName}:`, errors);
      }
      
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
    if (this.config.verbose) {
      console.warn(`[PostgresReplicator] Replication failed for ${resourceName}: ${err.message}`);
    }
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
      if (ok) {
        results.push(res);
      } else {
        if (this.config.verbose) {
          console.warn(`[PostgresReplicator] Batch replication failed for record ${record.id}: ${err.message}`);
        }
        errors.push({ id: record.id, error: err.message });
      }
    }
    
    // Log errors if any occurred during batch processing
    if (errors.length > 0) {
      console.warn(`[PostgresReplicator] Batch replication completed with ${errors.length} error(s) for ${resourceName}:`, errors);
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
    if (this.config.verbose) {
      console.warn(`[PostgresReplicator] Connection test failed: ${err.message}`);
    }
    this.emit('connection_error', { replicator: this.name, error: err.message });
    return false;
  }

  _cleanInternalFields(data) {
    if (!data || typeof data !== 'object') return data;
    
    const cleanData = { ...data };
    
    // Remove internal fields that start with $ or _
    Object.keys(cleanData).forEach(key => {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });
    
    return cleanData;
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