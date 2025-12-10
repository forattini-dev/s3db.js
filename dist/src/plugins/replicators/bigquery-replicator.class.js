import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
import { generateBigQuerySchema, getBigQueryTableSchema, generateBigQuerySchemaUpdate } from './schema-sync.helper.js';
class BigqueryReplicator extends BaseReplicator {
    projectId;
    datasetId;
    bigqueryClient;
    credentials;
    location;
    logTable;
    mutability;
    schemaSync;
    resources;
    versionCounters;
    constructor(config, resources = {}) {
        super(config);
        this.projectId = config.projectId;
        this.datasetId = config.datasetId;
        this.bigqueryClient = null;
        this.credentials = config.credentials;
        this.location = config.location || 'US';
        this.logTable = config.logTable;
        this.mutability = config.mutability || 'append-only';
        this._validateMutability(this.mutability);
        this.schemaSync = {
            enabled: config.schemaSync?.enabled || false,
            strategy: config.schemaSync?.strategy || 'alter',
            onMismatch: config.schemaSync?.onMismatch || 'error',
            autoCreateTable: config.schemaSync?.autoCreateTable !== false,
            autoCreateColumns: config.schemaSync?.autoCreateColumns !== false
        };
        this.resources = this.parseResourcesConfig(resources);
        this.versionCounters = new Map();
    }
    _validateMutability(mutability) {
        const validModes = ['append-only', 'mutable', 'immutable'];
        if (!validModes.includes(mutability)) {
            throw this.createError(`Invalid mutability mode: ${mutability}`, {
                operation: 'config',
                statusCode: 400,
                retriable: false,
                suggestion: `Use one of the supported mutability modes: ${validModes.join(', ')}.`
            });
        }
    }
    parseResourcesConfig(resources) {
        const parsed = {};
        for (const [resourceName, config] of Object.entries(resources)) {
            if (typeof config === 'string') {
                parsed[resourceName] = [{
                        table: config,
                        actions: ['insert'],
                        transform: null,
                        mutability: this.mutability,
                        tableOptions: null
                    }];
            }
            else if (Array.isArray(config)) {
                parsed[resourceName] = config.map(item => {
                    if (typeof item === 'string') {
                        return { table: item, actions: ['insert'], transform: null, mutability: this.mutability, tableOptions: null };
                    }
                    const itemMutability = item.mutability || this.mutability;
                    this._validateMutability(itemMutability);
                    return {
                        table: item.table,
                        actions: item.actions || ['insert'],
                        transform: item.transform || null,
                        mutability: itemMutability,
                        tableOptions: item.tableOptions || null
                    };
                });
            }
            else if (typeof config === 'object') {
                const objConfig = config;
                const configMutability = objConfig.mutability || this.mutability;
                this._validateMutability(configMutability);
                parsed[resourceName] = [{
                        table: objConfig.table,
                        actions: objConfig.actions || ['insert'],
                        transform: objConfig.transform || null,
                        mutability: configMutability,
                        tableOptions: objConfig.tableOptions || null
                    }];
            }
        }
        return parsed;
    }
    validateConfig() {
        const errors = [];
        if (!this.projectId)
            errors.push('projectId is required');
        if (!this.datasetId)
            errors.push('datasetId is required');
        if (Object.keys(this.resources).length === 0)
            errors.push('At least one resource must be configured');
        if (this.credentials) {
            if (typeof this.credentials === 'string') {
                errors.push('credentials must be an object, not a string. Did you forget JSON.parse()?');
            }
            else if (typeof this.credentials === 'object') {
                if (!this.credentials.client_email) {
                    errors.push('credentials.client_email is required for service account authentication');
                }
                else if (!this.credentials.client_email.includes('@')) {
                    errors.push('credentials.client_email appears invalid (missing @)');
                }
                if (!this.credentials.private_key) {
                    errors.push('credentials.private_key is required for service account authentication');
                }
                else if (typeof this.credentials.private_key === 'string') {
                    if (!this.credentials.private_key.includes('BEGIN PRIVATE KEY')) {
                        errors.push('credentials.private_key appears invalid (missing "BEGIN PRIVATE KEY" header)');
                    }
                    if (this.credentials.private_key.length < 100) {
                        errors.push('credentials.private_key appears too short to be valid');
                    }
                }
            }
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
                if (tableConfig.transform && typeof tableConfig.transform !== 'function') {
                    errors.push(`Transform must be a function for resource '${resourceName}'`);
                }
            }
        }
        return { isValid: errors.length === 0, errors };
    }
    async initialize(database) {
        await super.initialize(database);
        const configValidation = this.validateConfig();
        if (!configValidation.isValid) {
            const error = this.createError(`BigQuery configuration invalid: ${configValidation.errors.join('; ')}`, {
                operation: 'initialize',
                statusCode: 400,
                retriable: false,
                suggestion: 'Review your BigQuery replicator configuration. Ensure projectId, datasetId, and credentials are correctly set. See docs/plugins/replicator.md'
            });
            this.logger.error({ errors: configValidation.errors }, 'Configuration validation failed');
            this.emit('initialization_error', { replicator: this.name, error: error.message, errors: configValidation.errors });
            throw error;
        }
        await requirePluginDependency('bigquery-replicator');
        const [ok, err, sdk] = await tryFn(() => import('@google-cloud/bigquery'));
        if (!ok) {
            this.logger.warn({ error: err.message }, 'Failed to import BigQuery SDK');
            this.emit('initialization_error', { replicator: this.name, error: err.message });
            throw err;
        }
        const { BigQuery } = sdk;
        this.bigqueryClient = new BigQuery({
            projectId: this.projectId,
            credentials: this.credentials,
            location: this.location
        });
        this.logger.debug({ projectId: this.projectId, datasetId: this.datasetId }, 'Testing connection to BigQuery');
        const [connOk, connErr] = await tryFn(async () => {
            const dataset = this.bigqueryClient.dataset(this.datasetId);
            await dataset.getMetadata();
        });
        if (!connOk) {
            const errorMessage = this._parseGcpError(connErr);
            const suggestion = this._getCredentialsSuggestion(connErr);
            const error = this.createError(`BigQuery connection failed: ${errorMessage}`, {
                operation: 'initialize',
                statusCode: connErr.code || 401,
                retriable: true,
                suggestion
            });
            this.logger.error({ error: errorMessage, suggestion, projectId: this.projectId, datasetId: this.datasetId }, 'Connection test failed');
            this.emit('connection_error', {
                replicator: this.name,
                error: error.message,
                suggestion,
                projectId: this.projectId,
                datasetId: this.datasetId
            });
            throw error;
        }
        this.logger.debug('Connection successful');
        if (this.schemaSync.enabled) {
            await this.syncSchemas(database);
        }
        this.emit('db:plugin:initialized', {
            replicator: this.name,
            projectId: this.projectId,
            datasetId: this.datasetId,
            resources: Object.keys(this.resources),
            connectionTested: true
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
            const allAttributes = resource.$schema.attributes || {};
            const pluginAttrNames = resource.$schema._pluginAttributes
                ? Object.values(resource.$schema._pluginAttributes).flat()
                : [];
            const attributes = Object.fromEntries(Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name)));
            for (const tableConfig of tableConfigs) {
                const tableName = tableConfig.table;
                const mutability = tableConfig.mutability;
                const tableOptions = tableConfig.tableOptions;
                const [okSync, errSync] = await tryFn(async () => {
                    await this.syncTableSchema(tableName, attributes, mutability, tableOptions);
                });
                if (!okSync) {
                    const message = `Schema sync failed for table ${tableName}: ${errSync.message}`;
                    if (this.schemaSync.onMismatch === 'error') {
                        throw this.createError(message, {
                            operation: 'schemaSync',
                            resourceName,
                            statusCode: 409,
                            retriable: errSync?.retriable ?? false,
                            suggestion: 'Review the BigQuery table schema and align it with the S3DB resource definition or relax schemaSync.onMismatch.',
                            metadata: { tableName }
                        });
                    }
                    else if (this.schemaSync.onMismatch === 'warn') {
                        this.logger.warn(`${message}`);
                    }
                }
            }
        }
        this.emit('schema_sync_completed', {
            replicator: this.name,
            resources: Object.keys(this.resources)
        });
    }
    async syncTableSchema(tableName, attributes, mutability = 'append-only', tableOptions = null) {
        const dataset = this.bigqueryClient.dataset(this.datasetId);
        const table = dataset.table(tableName);
        const normalizedTableOptions = tableOptions
            ? JSON.parse(JSON.stringify(tableOptions))
            : null;
        const [exists] = await table.exists();
        if (!exists) {
            if (!this.schemaSync.autoCreateTable) {
                throw this.createError(`Table ${tableName} does not exist and autoCreateTable is disabled`, {
                    operation: 'schemaSync',
                    statusCode: 404,
                    retriable: false,
                    suggestion: 'Create the BigQuery table manually or enable schemaSync.autoCreateTable.',
                    metadata: { tableName }
                });
            }
            if (this.schemaSync.strategy === 'validate-only') {
                throw this.createError(`Table ${tableName} does not exist (validate-only mode)`, {
                    operation: 'schemaSync',
                    statusCode: 404,
                    retriable: false,
                    suggestion: 'Provision the table before running validate-only checks or switch the schemaSync.strategy to alter.',
                    metadata: { tableName }
                });
            }
            const schema = generateBigQuerySchema(attributes, mutability);
            this.logger.debug({ tableName, mutability, schema }, 'Creating table with schema');
            const createOptions = { schema };
            if (normalizedTableOptions?.timePartitioning) {
                createOptions.timePartitioning = normalizedTableOptions.timePartitioning;
            }
            if (normalizedTableOptions?.clustering) {
                createOptions.clustering = normalizedTableOptions.clustering;
            }
            await dataset.createTable(tableName, createOptions);
            this.emit('table_created', {
                replicator: this.name,
                tableName,
                attributes: Object.keys(attributes),
                mutability
            });
            return;
        }
        if (this.schemaSync.strategy === 'drop-create') {
            this.logger.warn({ tableName }, 'Dropping and recreating table');
            await table.delete();
            const schema = generateBigQuerySchema(attributes, mutability);
            const createOptions = { schema };
            if (normalizedTableOptions?.timePartitioning) {
                createOptions.timePartitioning = normalizedTableOptions.timePartitioning;
            }
            if (normalizedTableOptions?.clustering) {
                createOptions.clustering = normalizedTableOptions.clustering;
            }
            await dataset.createTable(tableName, createOptions);
            this.emit('table_recreated', {
                replicator: this.name,
                tableName,
                attributes: Object.keys(attributes),
                mutability
            });
            return;
        }
        if (this.schemaSync.strategy === 'alter' && this.schemaSync.autoCreateColumns) {
            const existingSchema = await getBigQueryTableSchema(this.bigqueryClient, this.datasetId, tableName);
            const newFields = generateBigQuerySchemaUpdate(attributes, existingSchema, mutability);
            if (newFields.length > 0) {
                this.logger.debug({ tableName, fieldCount: newFields.length, newFields }, 'Adding fields to table');
                const [metadata] = await table.getMetadata();
                const currentSchema = metadata.schema.fields;
                const updatedSchema = [...currentSchema, ...newFields];
                await table.setMetadata({ schema: updatedSchema });
                this.emit('table_altered', {
                    replicator: this.name,
                    tableName,
                    addedColumns: newFields.length
                });
            }
        }
        if (this.schemaSync.strategy === 'validate-only') {
            const existingSchema = await getBigQueryTableSchema(this.bigqueryClient, this.datasetId, tableName);
            const newFields = generateBigQuerySchemaUpdate(attributes, existingSchema, mutability);
            if (newFields.length > 0) {
                throw this.createError(`Table ${tableName} schema mismatch. Missing columns: ${newFields.length}`, {
                    operation: 'schemaValidation',
                    statusCode: 409,
                    retriable: false,
                    suggestion: 'Update the BigQuery table schema to include the missing columns or enable schemaSync.autoCreateColumns.',
                    metadata: { tableName }
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
            .map(tableConfig => ({
            table: tableConfig.table,
            transform: tableConfig.transform,
            mutability: tableConfig.mutability,
            tableOptions: tableConfig.tableOptions || null
        }));
    }
    applyTransform(data, transformFn) {
        let cleanData = this._cleanInternalFields(data);
        if (!transformFn)
            return cleanData;
        const transformedData = JSON.parse(JSON.stringify(cleanData));
        return transformFn(transformedData);
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
    _addTrackingFields(data, operation, mutability, id) {
        const tracked = { ...data };
        if (mutability === 'append-only' || mutability === 'immutable') {
            tracked._operation_type = operation;
            tracked._operation_timestamp = new Date().toISOString();
        }
        if (mutability === 'immutable') {
            tracked._is_deleted = operation === 'delete';
            tracked._version = this._getNextVersion(id);
        }
        return tracked;
    }
    _getNextVersion(id) {
        const current = this.versionCounters.get(id) || 0;
        const next = current + 1;
        this.versionCounters.set(id, next);
        return next;
    }
    async replicate(resourceName, operation, data, id, beforeData = null) {
        if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
            return { skipped: true, reason: 'resource_not_included' };
        }
        if (!this.shouldReplicateAction(resourceName, operation)) {
            return { skipped: true, reason: 'action_not_included' };
        }
        const tableConfigs = this.getTablesForResource(resourceName, operation);
        if (tableConfigs.length === 0) {
            return { skipped: true, reason: 'no_tables_for_action' };
        }
        const results = [];
        const errors = [];
        const [ok, err, result] = await tryFn(async () => {
            const dataset = this.bigqueryClient.dataset(this.datasetId);
            for (const tableConfig of tableConfigs) {
                const [okTable, errTable] = await tryFn(async () => {
                    const table = dataset.table(tableConfig.table);
                    const mutability = tableConfig.mutability;
                    let job;
                    const shouldConvertToInsert = (mutability === 'append-only' || mutability === 'immutable') &&
                        (operation === 'update' || operation === 'delete');
                    if (operation === 'insert' || shouldConvertToInsert) {
                        let transformedData = this.applyTransform(data, tableConfig.transform);
                        if (shouldConvertToInsert) {
                            transformedData = this._addTrackingFields(transformedData, operation, mutability, id);
                        }
                        try {
                            job = await table.insert([transformedData]);
                        }
                        catch (error) {
                            const { errors: bqErrors, response } = error;
                            this.logger.error({ errors: bqErrors, response }, 'BigQuery insert error details');
                            throw error;
                        }
                    }
                    else if (operation === 'update' && mutability === 'mutable') {
                        const transformedData = this.applyTransform(data, tableConfig.transform);
                        const keys = Object.keys(transformedData).filter(k => k !== 'id');
                        const setClause = keys.map(k => `${k} = @${k}`).join(', ');
                        const params = { id, ...transformedData };
                        const query = `UPDATE \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` SET ${setClause} WHERE id = @id`;
                        const maxRetries = 2;
                        let lastError = null;
                        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                            const [okAttempt, errorAttempt, resultAttempt] = await tryFn(async () => {
                                const [updateJob] = await this.bigqueryClient.createQueryJob({
                                    query,
                                    params,
                                    location: this.location
                                });
                                await updateJob.getQueryResults();
                                return [updateJob];
                            });
                            if (okAttempt) {
                                job = resultAttempt;
                                break;
                            }
                            else {
                                lastError = errorAttempt;
                                this.logger.warn({ attempt, error: lastError.message }, 'Update attempt failed');
                                if (lastError?.message?.includes('streaming buffer') && attempt < maxRetries) {
                                    const delaySeconds = 30;
                                    this.logger.warn({ delaySeconds }, 'Retrying due to streaming buffer issue');
                                    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
                                    continue;
                                }
                                throw errorAttempt;
                            }
                        }
                        if (!job)
                            throw lastError;
                    }
                    else if (operation === 'delete' && mutability === 'mutable') {
                        const query = `DELETE FROM \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` WHERE id = @id`;
                        try {
                            const [deleteJob] = await this.bigqueryClient.createQueryJob({
                                query,
                                params: { id },
                                location: this.location
                            });
                            await deleteJob.getQueryResults();
                            job = [deleteJob];
                        }
                        catch (error) {
                            const bqErr = error;
                            this.logger.error({ query, errors: bqErr.errors, response: bqErr.response }, 'BigQuery delete error details');
                            throw error;
                        }
                    }
                    else {
                        throw this.createError(`Unsupported operation: ${operation}`, {
                            operation: 'replicate',
                            resourceName,
                            statusCode: 400,
                            retriable: false,
                            suggestion: 'Replicator supports insert, update, or delete actions. Adjust the resources configuration accordingly.',
                            metadata: { tableName: tableConfig.table }
                        });
                    }
                    results.push({
                        table: tableConfig.table,
                        success: true,
                        jobId: job?.[0]?.id
                    });
                });
                if (!okTable) {
                    errors.push({
                        table: tableConfig.table,
                        error: errTable.message
                    });
                }
            }
            if (this.logTable) {
                const [okLog] = await tryFn(async () => {
                    const logTable = dataset.table(this.logTable);
                    await logTable.insert([{
                            resource_name: resourceName,
                            operation,
                            record_id: id,
                            data: JSON.stringify(data),
                            timestamp: new Date().toISOString(),
                            source: 's3db-replicator'
                        }]);
                });
                if (!okLog) {
                    // Don't fail the main operation if logging fails
                }
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
                tables: tableConfigs.map(t => t.table),
                results,
                errors,
                success
            });
            return {
                success,
                results,
                errors,
                tables: tableConfigs.map(t => t.table)
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
    _parseGcpError(error) {
        const message = error.message || String(error);
        if (message.includes('invalid_grant') || message.includes('Invalid JWT Signature')) {
            return 'Invalid service account credentials (private_key or client_email incorrect)';
        }
        if (message.includes('JWT validation failed') || message.includes('Invalid JWT')) {
            return 'Service account key is malformed or expired';
        }
        if (message.includes('Permission denied') || message.includes('403')) {
            return 'Credentials valid but missing BigQuery permissions';
        }
        if (message.includes('Not found') || message.includes('404')) {
            return `Dataset '${this.datasetId}' not found or no access to project '${this.projectId}'`;
        }
        if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT')) {
            return 'Network error connecting to BigQuery API (check firewall/proxy)';
        }
        if (message.includes('ECONNREFUSED')) {
            return 'Connection refused by BigQuery API';
        }
        if (message.includes('429') || message.includes('rateLimitExceeded')) {
            return 'BigQuery API rate limit exceeded';
        }
        if (message.includes('quotaExceeded')) {
            return 'BigQuery quota exceeded for project';
        }
        return message;
    }
    _getCredentialsSuggestion(error) {
        const message = error.message || String(error);
        if (message.includes('invalid_grant') || message.includes('Invalid JWT')) {
            return 'Verify your service account JSON is correct and not expired. Download fresh credentials from: https://console.cloud.google.com/iam-admin/serviceaccounts';
        }
        if (message.includes('Permission denied') || message.includes('403')) {
            return `Grant the following roles to service account '${this.credentials?.client_email || 'your-service-account'}': BigQuery Data Editor, BigQuery Job User`;
        }
        if (message.includes('Not found') || message.includes('404')) {
            return `Create dataset '${this.datasetId}' in project '${this.projectId}' or verify the service account has access: https://console.cloud.google.com/bigquery?project=${this.projectId}`;
        }
        if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
            return 'Check network connectivity, firewall rules, and proxy settings. Ensure outbound HTTPS access to *.googleapis.com is allowed';
        }
        if (message.includes('429') || message.includes('rateLimitExceeded') || message.includes('quotaExceeded')) {
            return `Check BigQuery quota and billing: https://console.cloud.google.com/apis/api/bigquery.googleapis.com/quotas?project=${this.projectId}`;
        }
        return 'Verify BigQuery configuration, credentials, and network connectivity. See docs/plugins/replicator.md for troubleshooting';
    }
    async testConnection() {
        const [ok, err] = await tryFn(async () => {
            if (!this.bigqueryClient)
                await this.initialize(this.database);
            const dataset = this.bigqueryClient.dataset(this.datasetId);
            await dataset.getMetadata();
            return true;
        });
        if (ok)
            return true;
        this.logger.warn({ error: err.message }, 'Connection test failed');
        this.emit('connection_error', { replicator: this.name, error: err.message });
        return false;
    }
    async cleanup() {
        // BigQuery SDK doesn't need cleanup
    }
    async getStatus() {
        const baseStatus = await super.getStatus();
        return {
            ...baseStatus,
            projectId: this.projectId,
            datasetId: this.datasetId,
            resources: this.resources,
            logTable: this.logTable,
            schemaSync: this.schemaSync,
            mutability: this.mutability
        };
    }
}
export default BigqueryReplicator;
//# sourceMappingURL=bigquery-replicator.class.js.map