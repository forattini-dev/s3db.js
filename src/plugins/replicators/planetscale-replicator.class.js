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
 * PlanetScale Replicator - Replicate data to PlanetScale (MySQL serverless)
 *
 * ⚠️  REQUIRED DEPENDENCY: You must install the PlanetScale client library:
 * ```bash
 * pnpm add @planetscale/database
 * ```
 *
 * Configuration:
 * @param {string} host - PlanetScale database host (required) - e.g., 'aws.connect.psdb.cloud'
 * @param {string} username - Database username (required)
 * @param {string} password - Database password (required)
 * @param {Object} schemaSync - Schema synchronization configuration
 * @param {boolean} schemaSync.enabled - Enable automatic schema management (default: false)
 * @param {string} schemaSync.strategy - Sync strategy: 'alter' | 'drop-create' | 'validate-only' (default: 'alter')
 * @param {string} schemaSync.onMismatch - Action on schema mismatch: 'error' | 'warn' | 'ignore' (default: 'error')
 * @param {boolean} schemaSync.autoCreateTable - Auto-create table if not exists (default: true)
 * @param {boolean} schemaSync.autoCreateColumns - Auto-add missing columns (default: true, only with strategy: 'alter')
 *
 * @example
 * new PlanetScaleReplicator({
 *   host: 'aws.connect.psdb.cloud',
 *   username: process.env.PLANETSCALE_USERNAME,
 *   password: process.env.PLANETSCALE_PASSWORD,
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
 * See docs/plugins/replicator.md for comprehensive configuration documentation.
 */
class PlanetScaleReplicator extends BaseReplicator {
  constructor(config = {}, resources = {}) {
    super(config);
    this.host = config.host;
    this.username = config.username;
    this.password = config.password;
    this.connection = null;

    // Schema sync configuration
    this.schemaSync = {
      enabled: config.schemaSync?.enabled || false,
      strategy: config.schemaSync?.strategy || 'alter',
      onMismatch: config.schemaSync?.onMismatch || 'error',
      autoCreateTable: config.schemaSync?.autoCreateTable !== false,
      autoCreateColumns: config.schemaSync?.autoCreateColumns !== false
    };

    // Parse resources configuration
    this.resources = this.parseResourcesConfig(resources);
  }

  parseResourcesConfig(resources) {
    const parsed = {};

    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === 'string') {
        parsed[resourceName] = [{
          table: config,
          actions: ['insert']
        }];
      } else if (Array.isArray(config)) {
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
    if (!this.host) errors.push('Host is required');
    if (!this.username) errors.push('Username is required');
    if (!this.password) errors.push('Password is required');
    if (Object.keys(this.resources).length === 0) {
      errors.push('At least one resource must be configured');
    }

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

    // Validate plugin dependencies are installed
    await requirePluginDependency('planetscale-replicator');

    const [ok, err, sdk] = await tryFn(() => import('@planetscale/database'));
    if (!ok) {
      throw new ReplicationError('Failed to import PlanetScale SDK', {
        operation: 'initialize',
        replicatorClass: 'PlanetScaleReplicator',
        original: err,
        suggestion: 'Install @planetscale/database: pnpm add @planetscale/database'
      });
    }

    const { connect } = sdk;
    this.connection = connect({
      host: this.host,
      username: this.username,
      password: this.password
    });

    // Test connection
    const [okTest, errTest] = await tryFn(async () => {
      await this.connection.execute('SELECT 1');
    });

    if (!okTest) {
      throw new ReplicationError('Failed to connect to PlanetScale database', {
        operation: 'initialize',
        replicatorClass: 'PlanetScaleReplicator',
        host: this.host,
        original: errTest,
        suggestion: 'Check PlanetScale credentials'
      });
    }

    // Sync schemas if enabled
    if (this.schemaSync.enabled) {
      await this.syncSchemas(database);
    }

    this.emit('connected', {
      replicator: 'PlanetScaleReplicator',
      host: this.host
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
        this.logger.warn(
          { resourceName, error: errRes.message },
          'Could not get resource for schema sync'
        );
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
              suggestion: 'Align the PlanetScale table schema with the resource definition or relax schemaSync.onMismatch.',
              docs: 'docs/plugins/replicator.md'
            });
          } else if (this.schemaSync.onMismatch === 'warn') {
            this.logger.warn({ tableName, error: errSync.message }, message);
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
    // Check if table exists using PlanetScale execute
    const existingSchema = await getMySQLTableSchema(this.connection, tableName);

    if (!existingSchema) {
      if (!this.schemaSync.autoCreateTable) {
        throw this.createError(`Table ${tableName} does not exist and autoCreateTable is disabled`, {
          operation: 'schemaSync',
          tableName,
          statusCode: 404,
          retriable: false,
          suggestion: 'Create the table manually or enable schemaSync.autoCreateTable.'
        });
      }

      if (this.schemaSync.strategy === 'validate-only') {
        throw this.createError(`Table ${tableName} does not exist (validate-only mode)`, {
          operation: 'schemaSync',
          tableName,
          statusCode: 404,
          retriable: false,
          suggestion: 'Provision the table before running validate-only checks or choose the alter strategy.'
        });
      }

      // Create table
      const createSQL = generateMySQLCreateTable(tableName, attributes);

      this.logger.debug({ tableName, createSQL }, 'Creating table');

      await this.connection.execute(createSQL);

      this.emit('table_created', {
        replicator: this.name,
        tableName,
        attributes: Object.keys(attributes)
      });

      return;
    }

    // Table exists - check for schema changes
    if (this.schemaSync.strategy === 'drop-create') {
      this.logger.warn({ tableName }, 'Dropping and recreating table');

      await this.connection.execute(`DROP TABLE IF EXISTS ${tableName}`);
      const createSQL = generateMySQLCreateTable(tableName, attributes);
      await this.connection.execute(createSQL);

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
        this.logger.debug(
            { tableName, alterStatements },
            'Altering table'
          );

        for (const stmt of alterStatements) {
          await this.connection.execute(stmt);
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
          suggestion: 'Add the missing columns to the PlanetScale table or enable schemaSync.autoCreateColumns.'
        });
      }
    }
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

    for (const table of tables) {
      const [okTable, errTable] = await tryFn(async () => {
        if (operation === 'insert') {
          const cleanData = this._cleanInternalFields(data);
          const keys = Object.keys(cleanData);
          const values = keys.map(k => cleanData[k]);
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT INTO ${table} (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE id=id`;
          await this.connection.execute(sql, values);
        } else if (operation === 'update') {
          const cleanData = this._cleanInternalFields(data);
          const keys = Object.keys(cleanData).filter(k => k !== 'id');
          const setClause = keys.map(k => `\`${k}\`=?`).join(', ');
          const values = keys.map(k => cleanData[k]);
          values.push(id);
          const sql = `UPDATE ${table} SET ${setClause} WHERE id=?`;
          await this.connection.execute(sql, values);
        } else if (operation === 'delete') {
          const sql = `DELETE FROM ${table} WHERE id=?`;
          await this.connection.execute(sql, [id]);
        }

        results.push({ table, success: true });
      });

      if (!okTable) {
        errors.push({ table, error: errTable.message });
      }
    }

    const success = errors.length === 0;

    this.emit('plg:replicator:replicated', {
      replicator: this.name,
      resourceName,
      operation,
      id,
      tables,
      results,
      errors,
      success
    });

    return { success, results, errors, tables };
  }

  _cleanInternalFields(data) {
    if (!data || typeof data !== 'object') return data;

    const cleanData = { ...data };

    Object.keys(cleanData).forEach(key => {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  async cleanup() {
    // PlanetScale SDK doesn't need explicit cleanup
    this.connection = null;
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.connection,
      host: this.host,
      resources: Object.keys(this.resources),
      schemaSync: this.schemaSync
    };
  }
}

export default PlanetScaleReplicator;
