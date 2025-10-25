import tryFn from "#src/concerns/try-fn.js";
import requirePluginDependency from "#src/plugins/concerns/plugin-dependencies.js";
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
import {
  generateSQLiteCreateTable,
  generateSQLiteAlterTable
} from './schema-sync.helper.js';

/**
 * Turso Replicator - Replicate data to Turso (SQLite edge database)
 *
 * ⚠️  REQUIRED DEPENDENCY: You must install the Turso client library:
 * ```bash
 * pnpm add @libsql/client
 * ```
 *
 * Configuration:
 * @param {string} url - Turso database URL (required) - e.g., 'libsql://your-db.turso.io'
 * @param {string} authToken - Turso authentication token (required)
 * @param {Object} schemaSync - Schema synchronization configuration
 * @param {boolean} schemaSync.enabled - Enable automatic schema management (default: false)
 * @param {string} schemaSync.strategy - Sync strategy: 'alter' | 'drop-create' | 'validate-only' (default: 'alter')
 * @param {string} schemaSync.onMismatch - Action on schema mismatch: 'error' | 'warn' | 'ignore' (default: 'error')
 * @param {boolean} schemaSync.autoCreateTable - Auto-create table if not exists (default: true)
 * @param {boolean} schemaSync.autoCreateColumns - Auto-add missing columns (default: true, only with strategy: 'alter')
 *
 * @example
 * new TursoReplicator({
 *   url: 'libsql://my-db-user.turso.io',
 *   authToken: process.env.TURSO_AUTH_TOKEN,
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
class TursoReplicator extends BaseReplicator {
  constructor(config = {}, resources = {}) {
    super(config);
    this.url = config.url;
    this.authToken = config.authToken;
    this.client = null;

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
    if (!this.url) errors.push('URL is required');
    if (!this.authToken) errors.push('Auth token is required');
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
    await requirePluginDependency('turso-replicator');

    const [ok, err, sdk] = await tryFn(() => import('@libsql/client'));
    if (!ok) {
      throw new ReplicationError('Failed to import Turso SDK', {
        operation: 'initialize',
        replicatorClass: 'TursoReplicator',
        original: err,
        suggestion: 'Install @libsql/client: pnpm add @libsql/client'
      });
    }

    const { createClient } = sdk;
    this.client = createClient({
      url: this.url,
      authToken: this.authToken
    });

    // Test connection
    const [okTest, errTest] = await tryFn(async () => {
      await this.client.execute('SELECT 1');
    });

    if (!okTest) {
      throw new ReplicationError('Failed to connect to Turso database', {
        operation: 'initialize',
        replicatorClass: 'TursoReplicator',
        url: this.url,
        original: errTest,
        suggestion: 'Check Turso URL and auth token'
      });
    }

    // Sync schemas if enabled
    if (this.schemaSync.enabled) {
      await this.syncSchemas(database);
    }

    this.emit('connected', {
      replicator: 'TursoReplicator',
      url: this.url
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
          console.warn(`[TursoReplicator] Could not get resource ${resourceName} for schema sync: ${errRes.message}`);
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
            throw new Error(message);
          } else if (this.schemaSync.onMismatch === 'warn') {
            console.warn(`[TursoReplicator] ${message}`);
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
    // Check if table exists
    const [okCheck, errCheck, result] = await tryFn(async () => {
      return await this.client.execute({
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        args: [tableName]
      });
    });

    const tableExists = okCheck && result.rows.length > 0;

    if (!tableExists) {
      if (!this.schemaSync.autoCreateTable) {
        throw new Error(`Table ${tableName} does not exist and autoCreateTable is disabled`);
      }

      if (this.schemaSync.strategy === 'validate-only') {
        throw new Error(`Table ${tableName} does not exist (validate-only mode)`);
      }

      // Create table
      const createSQL = generateSQLiteCreateTable(tableName, attributes);

      if (this.config.verbose) {
        console.log(`[TursoReplicator] Creating table ${tableName}:\n${createSQL}`);
      }

      await this.client.execute(createSQL);

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
        console.warn(`[TursoReplicator] Dropping and recreating table ${tableName}`);
      }

      await this.client.execute(`DROP TABLE IF EXISTS ${tableName}`);
      const createSQL = generateSQLiteCreateTable(tableName, attributes);
      await this.client.execute(createSQL);

      this.emit('table_recreated', {
        replicator: this.name,
        tableName,
        attributes: Object.keys(attributes)
      });

      return;
    }

    if (this.schemaSync.strategy === 'alter' && this.schemaSync.autoCreateColumns) {
      // Get existing columns
      const [okPragma, errPragma, pragmaResult] = await tryFn(async () => {
        return await this.client.execute(`PRAGMA table_info(${tableName})`);
      });

      if (okPragma) {
        const existingSchema = {};
        for (const row of pragmaResult.rows) {
          existingSchema[row.name] = { type: row.type };
        }

        const alterStatements = generateSQLiteAlterTable(tableName, attributes, existingSchema);

        if (alterStatements.length > 0) {
          if (this.config.verbose) {
            console.log(`[TursoReplicator] Altering table ${tableName}:`, alterStatements);
          }

          for (const stmt of alterStatements) {
            await this.client.execute(stmt);
          }

          this.emit('table_altered', {
            replicator: this.name,
            tableName,
            addedColumns: alterStatements.length
          });
        }
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
          const placeholders = keys.map((_, i) => `?`).join(', ');
          const sql = `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          await this.client.execute({ sql, args: values });
        } else if (operation === 'update') {
          const cleanData = this._cleanInternalFields(data);
          const keys = Object.keys(cleanData).filter(k => k !== 'id');
          const setClause = keys.map(k => `${k}=?`).join(', ');
          const values = keys.map(k => cleanData[k]);
          values.push(id);
          const sql = `UPDATE ${table} SET ${setClause} WHERE id=?`;
          await this.client.execute({ sql, args: values });
        } else if (operation === 'delete') {
          const sql = `DELETE FROM ${table} WHERE id=?`;
          await this.client.execute({ sql, args: [id] });
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
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.client,
      url: this.url,
      resources: Object.keys(this.resources),
      schemaSync: this.schemaSync
    };
  }
}

export default TursoReplicator;
