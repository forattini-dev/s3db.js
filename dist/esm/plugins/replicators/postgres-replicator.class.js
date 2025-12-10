import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
import { generatePostgresCreateTable, getPostgresTableSchema, generatePostgresAlterTable } from './schema-sync.helper.js';
class PostgresReplicator extends BaseReplicator {
    connectionString;
    host;
    port;
    databaseName;
    user;
    password;
    client;
    ssl;
    logTable;
    schemaSync;
    resources;
    constructor(config = {}, resources = {}) {
        super(config);
        this.connectionString = config.connectionString;
        this.host = config.host;
        this.port = config.port || 5432;
        this.databaseName = config.database;
        this.user = config.user;
        this.password = config.password;
        this.client = null;
        this.ssl = config.ssl;
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
    parseResourcesConfig(resources) {
        const parsed = {};
        for (const [resourceName, config] of Object.entries(resources)) {
            if (typeof config === 'string') {
                parsed[resourceName] = [{
                        table: config,
                        actions: ['insert']
                    }];
            }
            else if (Array.isArray(config)) {
                parsed[resourceName] = config.map(item => {
                    if (typeof item === 'string') {
                        return { table: item, actions: ['insert'] };
                    }
                    return {
                        table: item.table,
                        actions: item.actions || ['insert']
                    };
                });
            }
            else if (typeof config === 'object') {
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
        if (!this.connectionString && (!this.host || !this.databaseName)) {
            errors.push('Either connectionString or host+database must be provided');
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
        await requirePluginDependency('postgresql-replicator');
        // @ts-ignore - pg module may not have type definitions
        const [ok, err, sdk] = await tryFn(() => import('pg'));
        if (!ok) {
            this.logger.warn({ error: err.message }, 'Failed to import pg SDK');
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
            database: this.databaseName,
            user: this.user,
            password: this.password,
            ssl: this.ssl
        };
        this.client = new Client(config);
        await this.client.connect();
        if (this.logTable) {
            await this.createLogTableIfNotExists();
        }
        if (this.schemaSync.enabled) {
            await this.syncSchemas(database);
        }
        this.emit('db:plugin:initialized', {
            replicator: this.name,
            database: this.databaseName || 'postgres',
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
    async syncSchemas(database) {
        for (const [resourceName, tableConfigs] of Object.entries(this.resources)) {
            const [okRes, errRes, resource] = await tryFn(async () => {
                return await database.getResource(resourceName);
            });
            if (!okRes) {
                this.logger.warn({ resourceName, error: errRes.message }, 'Could not get resource for schema sync');
                continue;
            }
            const allAttributes = resource.config.versions[resource.config.currentVersion]?.attributes || {};
            const pluginAttrNames = resource.schema?._pluginAttributes
                ? Object.values(resource.schema._pluginAttributes).flat()
                : [];
            const attributes = Object.fromEntries(Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name)));
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
                            suggestion: 'Align the PostgreSQL table schema with the resource definition or relax schemaSync.onMismatch.',
                            docs: 'docs/plugins/replicator.md'
                        });
                    }
                    else if (this.schemaSync.onMismatch === 'warn') {
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
    async syncTableSchema(tableName, attributes) {
        const existingSchema = await getPostgresTableSchema(this.client, tableName);
        if (!existingSchema) {
            if (!this.schemaSync.autoCreateTable) {
                throw this.createError(`Table ${tableName} does not exist and autoCreateTable is disabled`, {
                    operation: 'schemaSync',
                    tableName,
                    statusCode: 404,
                    retriable: false,
                    suggestion: 'Create the table manually or enable schemaSync.autoCreateTable to let the replicator provision it.'
                });
            }
            if (this.schemaSync.strategy === 'validate-only') {
                throw this.createError(`Table ${tableName} does not exist (validate-only mode)`, {
                    operation: 'schemaSync',
                    tableName,
                    statusCode: 404,
                    retriable: false,
                    suggestion: 'Provision the destination table before running validate-only schema checks or switch to the alter strategy.'
                });
            }
            const createSQL = generatePostgresCreateTable(tableName, attributes);
            this.logger.debug({ tableName, createSQL }, 'Creating table');
            await this.client.query(createSQL);
            this.emit('table_created', {
                replicator: this.name,
                tableName,
                attributes: Object.keys(attributes)
            });
            return;
        }
        if (this.schemaSync.strategy === 'drop-create') {
            this.logger.warn({ tableName }, 'Dropping and recreating table');
            await this.client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
            const createSQL = generatePostgresCreateTable(tableName, attributes);
            await this.client.query(createSQL);
            this.emit('table_recreated', {
                replicator: this.name,
                tableName,
                attributes: Object.keys(attributes)
            });
            return;
        }
        if (this.schemaSync.strategy === 'alter' && this.schemaSync.autoCreateColumns) {
            const alterStatements = generatePostgresAlterTable(tableName, attributes, existingSchema);
            if (alterStatements.length > 0) {
                this.logger.debug({ tableName, alterStatements }, 'Altering table');
                for (const stmt of alterStatements) {
                    await this.client.query(stmt);
                }
                this.emit('table_altered', {
                    replicator: this.name,
                    tableName,
                    addedColumns: alterStatements.length
                });
            }
        }
        if (this.schemaSync.strategy === 'validate-only') {
            const alterStatements = generatePostgresAlterTable(tableName, attributes, existingSchema);
            if (alterStatements.length > 0) {
                throw this.createError(`Table ${tableName} schema mismatch. Missing columns: ${alterStatements.length}`, {
                    operation: 'schemaValidation',
                    tableName,
                    statusCode: 409,
                    retriable: false,
                    suggestion: 'Update the PostgreSQL table to include the missing columns or allow the replicator to manage schema changes.'
                });
            }
        }
    }
    shouldReplicateResource(resourceName) {
        return Object.prototype.hasOwnProperty.call(this.resources, resourceName);
    }
    shouldReplicateAction(resourceName, operation) {
        if (!this.resources[resourceName])
            return false;
        return this.resources[resourceName].some(tableConfig => tableConfig.actions.includes(operation));
    }
    getTablesForResource(resourceName, operation) {
        if (!this.resources[resourceName])
            return [];
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
            for (const table of tables) {
                const [okTable, errTable] = await tryFn(async () => {
                    let queryResult;
                    if (operation === 'insert') {
                        const cleanData = this._cleanInternalFields(data);
                        const keys = Object.keys(cleanData);
                        const values = keys.map(k => cleanData[k]);
                        const columns = keys.map(k => `"${k}"`).join(', ');
                        const params = keys.map((_, i) => `$${i + 1}`).join(', ');
                        const sql = `INSERT INTO ${table} (${columns}) VALUES (${params}) ON CONFLICT (id) DO NOTHING RETURNING *`;
                        queryResult = await this.client.query(sql, values);
                    }
                    else if (operation === 'update') {
                        const cleanData = this._cleanInternalFields(data);
                        const keys = Object.keys(cleanData).filter(k => k !== 'id');
                        const setClause = keys.map((k, i) => `"${k}"=$${i + 1}`).join(', ');
                        const values = keys.map(k => cleanData[k]);
                        values.push(id);
                        const sql = `UPDATE ${table} SET ${setClause} WHERE id=$${keys.length + 1} RETURNING *`;
                        queryResult = await this.client.query(sql, values);
                    }
                    else if (operation === 'delete') {
                        const sql = `DELETE FROM ${table} WHERE id=$1 RETURNING *`;
                        queryResult = await this.client.query(sql, [id]);
                    }
                    else {
                        throw this.createError(`Unsupported operation: ${operation}`, {
                            operation: 'replicate',
                            resourceName,
                            tableName: table,
                            statusCode: 400,
                            retriable: false,
                            suggestion: 'Use one of the supported actions: insert, update, or delete.'
                        });
                    }
                    results.push({
                        table,
                        success: true,
                        rows: queryResult.rows,
                        rowCount: queryResult.rowCount
                    });
                });
                if (!okTable) {
                    errors.push({
                        table,
                        error: errTable.message
                    });
                }
            }
            if (this.logTable) {
                await tryFn(async () => {
                    await this.client.query(`INSERT INTO ${this.logTable} (resource_name, operation, record_id, data, timestamp, source) VALUES ($1, $2, $3, $4, $5, $6)`, [resourceName, operation, id, JSON.stringify(data), new Date().toISOString(), 's3db-replicator']);
                });
            }
            const success = errors.length === 0;
            if (errors.length > 0) {
                this.logger.warn({ resourceName, errors }, 'Replication completed with errors');
            }
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
            return {
                success,
                results,
                errors,
                tables
            };
        });
        if (ok)
            return result;
        this.logger.warn({ resourceName, error: err.message }, 'Replication failed');
        this.emit('plg:replicator:error', {
            replicator: this.name,
            resourceName,
            operation,
            id,
            error: err.message
        });
        return { success: false, error: err.message };
    }
    async replicateBatch(resourceName, records) {
        const { results, errors } = await this.processBatch(records, async (record) => {
            const [ok, err, res] = await tryFn(() => this.replicate(resourceName, record.operation, record.data, record.id, record.beforeData));
            if (!ok) {
                throw err;
            }
            return res;
        }, {
            concurrency: this.config.batchConcurrency,
            mapError: (error, record) => {
                const rec = record;
                this.logger.warn({ recordId: rec.id, error: error.message }, 'Batch replication failed for record');
                return { id: rec.id, error: error.message };
            }
        });
        if (errors.length > 0) {
            this.logger.warn({ resourceName, errorCount: errors.length, errors }, 'Batch replication completed with errors');
        }
        return {
            success: errors.length === 0,
            results,
            errors
        };
    }
    async testConnection() {
        const [ok, err] = await tryFn(async () => {
            if (!this.client)
                await this.initialize(this.database);
            await this.client.query('SELECT 1');
            return true;
        });
        if (ok)
            return true;
        this.logger.warn({ error: err.message }, 'Connection test failed');
        this.emit('connection_error', { replicator: this.name, error: err.message });
        return false;
    }
    _cleanInternalFields(data) {
        if (!data || typeof data !== 'object')
            return data;
        const cleanData = { ...data };
        Object.keys(cleanData).forEach(key => {
            if (key.startsWith('$') || key.startsWith('_')) {
                delete cleanData[key];
            }
        });
        return cleanData;
    }
    async cleanup() {
        if (this.client)
            await this.client.end();
    }
    async getStatus() {
        const baseStatus = await super.getStatus();
        return {
            ...baseStatus,
            database: this.databaseName || 'postgres',
            resources: this.resources,
            logTable: this.logTable,
            schemaSync: this.schemaSync
        };
    }
}
export default PostgresReplicator;
//# sourceMappingURL=postgres-replicator.class.js.map