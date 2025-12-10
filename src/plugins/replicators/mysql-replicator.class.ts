import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
import {
  generateMySQLCreateTable,
  getMySQLTableSchema,
  generateMySQLAlterTable
} from './schema-sync.helper.js';

import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';

export interface TableConfig {
  table: string;
  actions: string[];
}

export interface SchemaSyncConfig {
  enabled: boolean;
  strategy: 'alter' | 'drop-create' | 'validate-only';
  onMismatch: 'error' | 'warn' | 'ignore';
  autoCreateTable: boolean;
  autoCreateColumns: boolean;
  dropMissingColumns: boolean;
}

export interface MySQLReplicatorConfig extends BaseReplicatorConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: Record<string, unknown> | boolean;
  connectionLimit?: number;
  logTable?: string;
  schemaSync?: Partial<SchemaSyncConfig>;
}

export interface ReplicateResult {
  insertId?: number;
  affectedRows?: number;
  changedRows?: number;
}

type ResourceConfig = string | TableConfig | Array<string | TableConfig>;

interface MySQLPoolConnection {
  ping(): Promise<void>;
  release(): void;
  query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
}

interface MySQLPool {
  promise(): {
    getConnection(): Promise<MySQLPoolConnection>;
    query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
  };
  end(): Promise<void>;
  pool: {
    allConnections: unknown[];
  };
}

interface MySQLModule {
  createPool(config: Record<string, unknown>): MySQLPool;
  escapeId(id: string): string;
}

interface ResourceLike {
  config: {
    versions: Record<string, { attributes?: Record<string, unknown> }>;
    currentVersion: string;
  };
  schema?: {
    _pluginAttributes?: Record<string, string[]>;
  };
}

interface DatabaseLike {
  getResource(name: string): Promise<ResourceLike>;
}

class MySQLReplicator extends BaseReplicator {
  connectionString: string | undefined;
  host: string;
  port: number;
  databaseName: string | undefined;
  user: string | undefined;
  password: string | undefined;
  pool: MySQLPool | null;
  ssl: Record<string, unknown> | boolean | undefined;
  connectionLimit: number;
  logTable: string | undefined;
  schemaSync: SchemaSyncConfig;
  resources: Record<string, TableConfig[]>;

  constructor(config: MySQLReplicatorConfig = {}, resources: Record<string, ResourceConfig> = {}) {
    super(config);
    this.connectionString = config.connectionString;
    this.host = config.host || 'localhost';
    this.port = config.port || 3306;
    this.databaseName = config.database;
    this.user = config.user;
    this.password = config.password;
    this.pool = null;
    this.ssl = config.ssl;
    this.connectionLimit = config.connectionLimit || 10;
    this.logTable = config.logTable;

    this.schemaSync = {
      enabled: config.schemaSync?.enabled || false,
      strategy: config.schemaSync?.strategy || 'alter',
      onMismatch: config.schemaSync?.onMismatch || 'error',
      autoCreateTable: config.schemaSync?.autoCreateTable !== false,
      autoCreateColumns: config.schemaSync?.autoCreateColumns !== false,
      dropMissingColumns: config.schemaSync?.dropMissingColumns || false
    };

    this.resources = this.parseResourcesConfig(resources);
  }

  private parseResourcesConfig(resources: Record<string, ResourceConfig>): Record<string, TableConfig[]> {
    const parsed: Record<string, TableConfig[]> = {};

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

  override validateConfig(): ValidationResult {
    const errors: string[] = [];
    if (!this.databaseName) {
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

  override async initialize(database: unknown): Promise<void> {
    await super.initialize(database as { [key: string]: unknown });

    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator') as unknown as MySQLModule;

    const [ok, err] = await tryFn(async () => {
      const poolConfig: Record<string, unknown> = {
        host: this.host,
        port: this.port,
        user: this.user,
        password: this.password,
        database: this.databaseName,
        connectionLimit: this.connectionLimit,
        waitForConnections: true,
        queueLimit: 0
      };

      if (this.ssl) {
        poolConfig.ssl = this.ssl;
      }

      this.pool = mysql.createPool(poolConfig);

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
        database: this.databaseName,
        original: err,
        suggestion: 'Check MySQL connection credentials and ensure database is accessible'
      });
    }

    if (this.logTable) {
      await this._createLogTable();
    }

    if (this.schemaSync.enabled) {
      await this.syncSchemas(database as DatabaseLike);
    }

    this.emit('connected', {
      replicator: 'MySQLReplicator',
      host: this.host,
      database: this.databaseName
    });
  }

  async syncSchemas(database: DatabaseLike): Promise<void> {
    for (const [resourceName, tableConfigs] of Object.entries(this.resources)) {
      const [okRes, errRes, resource] = await tryFn(async () => {
        return await database.getResource(resourceName);
      });

      if (!okRes) {
        this.logger.warn(
          { resourceName, error: (errRes as Error).message },
          'Could not get resource for schema sync'
        );
        continue;
      }

      const allAttributes = resource!.config.versions[resource!.config.currentVersion]?.attributes || {};

      const pluginAttrNames = resource!.schema?._pluginAttributes
        ? Object.values(resource!.schema._pluginAttributes).flat()
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
          const message = `Schema sync failed for table ${tableName}: ${(errSync as Error).message}`;

          if (this.schemaSync.onMismatch === 'error') {
            throw this.createError(message, {
              operation: 'schemaSync',
              resourceName,
              tableName,
              statusCode: 409,
              retriable: (errSync as Error & { retriable?: boolean })?.retriable ?? false,
              suggestion: 'Update the MySQL table schema to match the resource definition or adjust schemaSync.onMismatch.',
              docs: 'docs/plugins/replicator.md'
            });
          } else if (this.schemaSync.onMismatch === 'warn') {
            this.logger.warn({ tableName, error: (errSync as Error).message }, message);
          }
        }
      }
    }

    this.emit('schema_sync_completed', {
      replicator: this.name,
      resources: Object.keys(this.resources)
    });
  }

  private async syncTableSchema(tableName: string, attributes: Record<string, unknown>): Promise<void> {
    const connection = await this.pool!.promise().getConnection();

    try {
      const existingSchema = await getMySQLTableSchema(connection as unknown as { query(sql: string, params?: unknown[]): Promise<[Array<Record<string, unknown>>]> }, tableName);

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

        const createSQL = generateMySQLCreateTable(tableName, attributes);

        this.logger.debug({ tableName, createSQL }, 'Creating table');

        await connection.query(createSQL);

        this.emit('table_created', {
          replicator: this.name,
          tableName,
          attributes: Object.keys(attributes)
        });

        return;
      }

      if (this.schemaSync.strategy === 'drop-create') {
        this.logger.warn({ tableName }, 'Dropping and recreating table');

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
          this.logger.debug(
            { tableName, alterStatements },
            'Altering table'
          );

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

  shouldReplicateResource(resourceName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.resources, resourceName);
  }

  private async _createLogTable(): Promise<void> {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator') as unknown as MySQLModule;

    const [ok] = await tryFn(async () => {
      await this.pool!.promise().query(`
        CREATE TABLE IF NOT EXISTS ${mysql.escapeId(this.logTable!)} (
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

    if (!ok) {
      this.logger.warn('Failed to create log table');
    }
  }

  override async replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string): Promise<ReplicateResult | null | undefined> {
    if (!this.resources[resourceName]) {
      throw new ReplicationError('Resource not configured for replication', {
        operation: 'replicate',
        replicatorClass: 'MySQLReplicator',
        resourceName,
        configuredResources: Object.keys(this.resources),
        suggestion: 'Add resource to replicator resources configuration'
      });
    }

    const results: ReplicateResult[] = [];

    for (const tableConfig of this.resources[resourceName]) {
      if (!tableConfig.actions.includes(operation)) {
        continue;
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
        results.push(result as ReplicateResult);

        if (this.logTable) {
          await this._logOperation(resourceName, operation, id, data);
        }
      } else {
        this.emit('replication_error', {
          resource: resourceName,
          operation,
          table: tableConfig.table,
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

  private async _insertRecord(table: string, data: Record<string, unknown>): Promise<ReplicateResult> {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator') as unknown as MySQLModule;
    const cleanData = this._cleanInternalFields(data);

    const columns = Object.keys(cleanData);
    const values = Object.values(cleanData);
    const placeholders = values.map(() => '?').join(', ');

    const query = `INSERT INTO ${mysql.escapeId(table)} (${columns.map(c => mysql.escapeId(c)).join(', ')}) VALUES (${placeholders})`;

    const [result] = await this.pool!.promise().query(query, values);
    return result as ReplicateResult;
  }

  private async _updateRecord(table: string, id: string, data: Record<string, unknown>): Promise<ReplicateResult> {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator') as unknown as MySQLModule;
    const cleanData = this._cleanInternalFields(data);

    const updates = Object.keys(cleanData)
      .map(col => `${mysql.escapeId(col)} = ?`)
      .join(', ');

    const values = [...Object.values(cleanData), id];

    const query = `UPDATE ${mysql.escapeId(table)} SET ${updates} WHERE id = ?`;

    const [result] = await this.pool!.promise().query(query, values);
    return result as ReplicateResult;
  }

  private async _deleteRecord(table: string, id: string): Promise<ReplicateResult> {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator') as unknown as MySQLModule;
    const query = `DELETE FROM ${mysql.escapeId(table)} WHERE id = ?`;

    const [result] = await this.pool!.promise().query(query, [id]);
    return result as ReplicateResult;
  }

  private async _logOperation(resourceName: string, operation: string, id: string, data: Record<string, unknown>): Promise<void> {
    const mysql = requirePluginDependency('mysql2', 'MySQLReplicator') as unknown as MySQLModule;

    const [ok] = await tryFn(async () => {
      const query = `INSERT INTO ${mysql.escapeId(this.logTable!)} (resource_name, operation, record_id, data) VALUES (?, ?, ?, ?)`;
      await this.pool!.promise().query(query, [resourceName, operation, id, JSON.stringify(data)]);
    });

    if (!ok) {
      this.logger.warn({ resourceName, operation, id }, 'Failed to log operation');
    }
  }

  private _cleanInternalFields(data: Record<string, unknown>): Record<string, unknown> {
    if (!data || typeof data !== 'object') return data;

    const cleanData = { ...data };

    Object.keys(cleanData).forEach(key => {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  override async replicateBatch(resourceName: string, records: Array<{ operation: string; data: Record<string, unknown>; id: string }>): Promise<{ success: boolean; results: unknown[]; errors: unknown[]; total: number }> {
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
      errors,
      total: records.length
    };
  }

  override async testConnection(): Promise<boolean> {
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
      this.emit('connection_error', { replicator: 'MySQLReplicator', error: (err as Error).message });
      return false;
    }

    return true;
  }

  override async getStatus(): Promise<ReplicatorStatus & {
    connected: boolean;
    host: string;
    database: string | undefined;
    resources: string[];
    poolConnections: number;
    schemaSync: SchemaSyncConfig;
  }> {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.pool,
      host: this.host,
      database: this.databaseName,
      resources: Object.keys(this.resources),
      poolConnections: this.pool ? this.pool.pool.allConnections.length : 0,
      schemaSync: this.schemaSync
    };
  }

  override async cleanup(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    await super.cleanup();
  }
}

export default MySQLReplicator;
