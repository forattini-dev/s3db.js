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

export interface SchemaSyncConfig {
  enabled: boolean;
  strategy: 'alter' | 'drop-create' | 'validate-only';
  onMismatch: 'error' | 'warn' | 'ignore';
  autoCreateTable: boolean;
  autoCreateColumns: boolean;
}

export interface PlanetScaleTableConfig {
  table: string;
  actions: string[];
}

export interface PlanetScaleResourceConfig {
  table?: string;
  actions?: string[];
  [key: string]: unknown;
}

export interface PlanetScaleReplicatorConfig extends BaseReplicatorConfig {
  host: string;
  username: string;
  password: string;
  schemaSync?: Partial<SchemaSyncConfig>;
}

export interface ReplicateResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  results?: Array<{ table: string; success: boolean }>;
  errors?: Array<{ table: string; error: string }>;
  tables?: string[];
  error?: string;
}

interface PlanetScaleConnectionLike {
  execute(sql: string, values?: unknown[]): Promise<unknown>;
}

interface DatabaseLike {
  getResource(name: string): Promise<ResourceLike>;
  [key: string]: unknown;
}

interface ResourceLike {
  config: {
    versions: Record<string, { attributes?: Record<string, unknown> }>;
    currentVersion: string;
  };
  schema?: {
    _pluginAttributes?: Record<string, string[]>;
  };
  [key: string]: unknown;
}

type ResourcesInput = string | PlanetScaleResourceConfig | PlanetScaleResourceConfig[] | Record<string, string | PlanetScaleResourceConfig | PlanetScaleResourceConfig[]>;

class PlanetScaleReplicator extends BaseReplicator {
  host: string;
  username: string;
  password: string;
  connection: PlanetScaleConnectionLike | null;
  schemaSync: SchemaSyncConfig;
  resources: Record<string, PlanetScaleTableConfig[]>;

  constructor(config: PlanetScaleReplicatorConfig, resources: Record<string, ResourcesInput> = {}) {
    super(config);
    this.host = config.host;
    this.username = config.username;
    this.password = config.password;
    this.connection = null;

    this.schemaSync = {
      enabled: config.schemaSync?.enabled || false,
      strategy: config.schemaSync?.strategy || 'alter',
      onMismatch: config.schemaSync?.onMismatch || 'error',
      autoCreateTable: config.schemaSync?.autoCreateTable !== false,
      autoCreateColumns: config.schemaSync?.autoCreateColumns !== false
    };

    this.resources = this.parseResourcesConfig(resources);
  }

  parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, PlanetScaleTableConfig[]> {
    const parsed: Record<string, PlanetScaleTableConfig[]> = {};

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
            table: item.table!,
            actions: item.actions || ['insert']
          };
        });
      } else if (typeof config === 'object' && config !== null) {
        const objConfig = config as PlanetScaleResourceConfig;
        parsed[resourceName] = [{
          table: objConfig.table!,
          actions: objConfig.actions || ['insert']
        }];
      }
    }

    return parsed;
  }

  override validateConfig(): ValidationResult {
    const errors: string[] = [];
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

  override async initialize(database: unknown): Promise<void> {
    await super.initialize(database as { [key: string]: unknown });

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
    }) as unknown as PlanetScaleConnectionLike;

    const [okTest, errTest] = await tryFn(async () => {
      await this.connection!.execute('SELECT 1');
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

    if (this.schemaSync.enabled) {
      await this.syncSchemas(database as DatabaseLike);
    }

    this.emit('connected', {
      replicator: 'PlanetScaleReplicator',
      host: this.host
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
              statusCode: 409,
              retriable: (errSync as { retriable?: boolean })?.retriable ?? false,
              suggestion: 'Align the PlanetScale table schema with the resource definition or relax schemaSync.onMismatch.',
              metadata: { tableName }
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

  async syncTableSchema(tableName: string, attributes: Record<string, unknown>): Promise<void> {
    const existingSchema = await getMySQLTableSchema(this.connection as unknown as { query(sql: string, params?: unknown[]): Promise<[Array<Record<string, unknown>>]> }, tableName);

    if (!existingSchema) {
      if (!this.schemaSync.autoCreateTable) {
        throw this.createError(`Table ${tableName} does not exist and autoCreateTable is disabled`, {
          operation: 'schemaSync',
          statusCode: 404,
          retriable: false,
          suggestion: 'Create the table manually or enable schemaSync.autoCreateTable.',
          metadata: { tableName }
        });
      }

      if (this.schemaSync.strategy === 'validate-only') {
        throw this.createError(`Table ${tableName} does not exist (validate-only mode)`, {
          operation: 'schemaSync',
          statusCode: 404,
          retriable: false,
          suggestion: 'Provision the table before running validate-only checks or choose the alter strategy.',
          metadata: { tableName }
        });
      }

      const createSQL = generateMySQLCreateTable(tableName, attributes);

      this.logger.debug({ tableName, createSQL }, 'Creating table');

      await this.connection!.execute(createSQL);

      this.emit('table_created', {
        replicator: this.name,
        tableName,
        attributes: Object.keys(attributes)
      });

      return;
    }

    if (this.schemaSync.strategy === 'drop-create') {
      this.logger.warn({ tableName }, 'Dropping and recreating table');

      await this.connection!.execute(`DROP TABLE IF EXISTS ${tableName}`);
      const createSQL = generateMySQLCreateTable(tableName, attributes);
      await this.connection!.execute(createSQL);

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
          await this.connection!.execute(stmt);
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
          statusCode: 409,
          retriable: false,
          suggestion: 'Add the missing columns to the PlanetScale table or enable schemaSync.autoCreateColumns.',
          metadata: { tableName }
        });
      }
    }
  }

  shouldReplicateResource(resourceName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.resources, resourceName);
  }

  shouldReplicateAction(resourceName: string, operation: string): boolean {
    if (!this.resources[resourceName]) return false;

    return this.resources[resourceName].some(tableConfig =>
      tableConfig.actions.includes(operation)
    );
  }

  getTablesForResource(resourceName: string, operation: string): string[] {
    if (!this.resources[resourceName]) return [];

    return this.resources[resourceName]
      .filter(tableConfig => tableConfig.actions.includes(operation))
      .map(tableConfig => tableConfig.table);
  }

  override async replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string, beforeData: unknown = null): Promise<ReplicateResult> {
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

    const results: Array<{ table: string; success: boolean }> = [];
    const errors: Array<{ table: string; error: string }> = [];

    for (const table of tables) {
      const [okTable, errTable] = await tryFn(async () => {
        if (operation === 'insert') {
          const cleanData = this._cleanInternalFields(data);
          const keys = Object.keys(cleanData);
          const values = keys.map(k => cleanData[k]);
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT INTO ${table} (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE id=id`;
          await this.connection!.execute(sql, values);
        } else if (operation === 'update') {
          const cleanData = this._cleanInternalFields(data);
          const keys = Object.keys(cleanData).filter(k => k !== 'id');
          const setClause = keys.map(k => `\`${k}\`=?`).join(', ');
          const values = keys.map(k => cleanData[k]);
          values.push(id);
          const sql = `UPDATE ${table} SET ${setClause} WHERE id=?`;
          await this.connection!.execute(sql, values);
        } else if (operation === 'delete') {
          const sql = `DELETE FROM ${table} WHERE id=?`;
          await this.connection!.execute(sql, [id]);
        }

        results.push({ table, success: true });
      });

      if (!okTable) {
        errors.push({ table, error: (errTable as Error).message });
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

  private _cleanInternalFields(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== 'object') return data as Record<string, unknown>;

    const cleanData = { ...data } as Record<string, unknown>;

    Object.keys(cleanData).forEach(key => {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  override async cleanup(): Promise<void> {
    this.connection = null;
  }

  override async getStatus(): Promise<ReplicatorStatus & {
    connected: boolean;
    host: string;
    resources: string[];
    schemaSync: SchemaSyncConfig;
  }> {
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
