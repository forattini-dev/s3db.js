import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
import { generateSQLiteCreateTable, generateSQLiteAlterTable } from './schema-sync.helper.js';
class TursoReplicator extends BaseReplicator {
    url;
    authToken;
    client;
    schemaSync;
    resources;
    constructor(config, resources = {}) {
        super(config);
        this.url = config.url;
        this.authToken = config.authToken;
        this.client = null;
        this.schemaSync = {
            enabled: config.schemaSync?.enabled || false,
            strategy: config.schemaSync?.strategy || 'alter',
            onMismatch: config.schemaSync?.onMismatch || 'error',
            autoCreateTable: config.schemaSync?.autoCreateTable !== false,
            autoCreateColumns: config.schemaSync?.autoCreateColumns !== false
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
            else if (typeof config === 'object' && !Array.isArray(config)) {
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
        if (!this.url)
            errors.push('URL is required');
        if (!this.authToken)
            errors.push('Auth token is required');
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
        if (this.schemaSync.enabled) {
            await this.syncSchemas(database);
        }
        this.emit('connected', {
            replicator: 'TursoReplicator',
            url: this.url
        });
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
                            statusCode: 409,
                            retriable: errSync?.retriable ?? false,
                            suggestion: 'Ensure the Turso table schema matches the resource definition or set schemaSync.onMismatch to warn/ignore.',
                            metadata: { tableName }
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
        const [okCheck, , result] = await tryFn(async () => {
            return await this.client.execute({
                sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                args: [tableName]
            });
        });
        const tableExists = okCheck && result.rows.length > 0;
        if (!tableExists) {
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
                    suggestion: 'Provision the destination table before running validate-only checks or choose a different strategy.',
                    metadata: { tableName }
                });
            }
            const createSQL = generateSQLiteCreateTable(tableName, attributes);
            this.logger.debug({ tableName, createSQL }, 'Creating table');
            await this.client.execute(createSQL);
            this.emit('table_created', {
                replicator: this.name,
                tableName,
                attributes: Object.keys(attributes)
            });
            return;
        }
        if (this.schemaSync.strategy === 'drop-create') {
            this.logger.warn({ tableName }, 'Dropping and recreating table');
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
            const [okPragma, , pragmaResult] = await tryFn(async () => {
                return await this.client.execute(`PRAGMA table_info(${tableName})`);
            });
            if (okPragma) {
                const existingSchema = {};
                for (const row of pragmaResult.rows) {
                    existingSchema[row.name] = { type: row.type };
                }
                const alterStatements = generateSQLiteAlterTable(tableName, attributes, existingSchema);
                if (alterStatements.length > 0) {
                    this.logger.debug({ tableName, alterStatements }, 'Altering table');
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
        for (const table of tables) {
            const [okTable, errTable] = await tryFn(async () => {
                if (operation === 'insert') {
                    const cleanData = this._cleanInternalFields(data);
                    const keys = Object.keys(cleanData);
                    const values = keys.map(k => cleanData[k]);
                    const placeholders = keys.map(() => '?').join(', ');
                    const sql = `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
                    await this.client.execute({ sql, args: values });
                }
                else if (operation === 'update') {
                    const cleanData = this._cleanInternalFields(data);
                    const keys = Object.keys(cleanData).filter(k => k !== 'id');
                    const setClause = keys.map(k => `${k}=?`).join(', ');
                    const values = keys.map(k => cleanData[k]);
                    values.push(id);
                    const sql = `UPDATE ${table} SET ${setClause} WHERE id=?`;
                    await this.client.execute({ sql, args: values });
                }
                else if (operation === 'delete') {
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
//# sourceMappingURL=turso-replicator.class.js.map