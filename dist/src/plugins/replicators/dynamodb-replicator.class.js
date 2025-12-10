import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
class DynamoDBReplicator extends BaseReplicator {
    region;
    accessKeyId;
    secretAccessKey;
    endpoint;
    credentials;
    client;
    docClient;
    resources;
    PutCommand;
    UpdateCommand;
    DeleteCommand;
    constructor(config = {}, resources = {}) {
        super(config);
        this.region = config.region || 'us-east-1';
        this.accessKeyId = config.accessKeyId;
        this.secretAccessKey = config.secretAccessKey;
        this.endpoint = config.endpoint;
        this.credentials = config.credentials;
        this.client = null;
        this.docClient = null;
        this.resources = this.parseResourcesConfig(resources);
    }
    parseResourcesConfig(resources) {
        const parsed = {};
        for (const [resourceName, config] of Object.entries(resources)) {
            if (typeof config === 'string') {
                parsed[resourceName] = [{
                        table: config,
                        actions: ['insert'],
                        primaryKey: 'id'
                    }];
            }
            else if (Array.isArray(config)) {
                parsed[resourceName] = config.map(item => {
                    if (typeof item === 'string') {
                        return { table: item, actions: ['insert'], primaryKey: 'id' };
                    }
                    return {
                        table: item.table,
                        actions: item.actions || ['insert'],
                        primaryKey: item.primaryKey || 'id',
                        sortKey: item.sortKey
                    };
                });
            }
            else if (typeof config === 'object' && config !== null) {
                const objConfig = config;
                parsed[resourceName] = [{
                        table: objConfig.table,
                        actions: objConfig.actions || ['insert'],
                        primaryKey: objConfig.primaryKey || 'id',
                        sortKey: objConfig.sortKey
                    }];
            }
        }
        return parsed;
    }
    validateConfig() {
        const errors = [];
        if (this.region === '') {
            errors.push('AWS region is required');
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
    async initialize(database) {
        await super.initialize(database);
        const { DynamoDBClient } = requirePluginDependency('@aws-sdk/client-dynamodb', 'DynamoDBReplicator');
        const { DynamoDBDocumentClient, PutCommand, UpdateCommand, DeleteCommand } = requirePluginDependency('@aws-sdk/lib-dynamodb', 'DynamoDBReplicator');
        this.PutCommand = PutCommand;
        this.UpdateCommand = UpdateCommand;
        this.DeleteCommand = DeleteCommand;
        const [ok, err] = await tryFn(async () => {
            const clientConfig = {
                region: this.region
            };
            if (this.endpoint) {
                clientConfig.endpoint = this.endpoint;
            }
            if (this.credentials) {
                clientConfig.credentials = this.credentials;
            }
            else if (this.accessKeyId && this.secretAccessKey) {
                clientConfig.credentials = {
                    accessKeyId: this.accessKeyId,
                    secretAccessKey: this.secretAccessKey
                };
            }
            this.client = new DynamoDBClient(clientConfig);
            this.docClient = DynamoDBDocumentClient.from(this.client);
            const { ListTablesCommand } = requirePluginDependency('@aws-sdk/client-dynamodb', 'DynamoDBReplicator');
            await this.client.send(new ListTablesCommand({ Limit: 1 }));
        });
        if (!ok) {
            throw new ReplicationError('Failed to connect to DynamoDB', {
                operation: 'initialize',
                replicatorClass: 'DynamoDBReplicator',
                region: this.region,
                endpoint: this.endpoint,
                original: err,
                suggestion: 'Check AWS credentials and ensure DynamoDB is accessible'
            });
        }
        this.emit('connected', {
            replicator: 'DynamoDBReplicator',
            region: this.region,
            endpoint: this.endpoint || 'default'
        });
    }
    shouldReplicateResource(resourceName) {
        return Object.prototype.hasOwnProperty.call(this.resources, resourceName);
    }
    async replicate(resourceName, operation, data, id) {
        if (!this.resources[resourceName]) {
            throw new ReplicationError('Resource not configured for replication', {
                operation: 'replicate',
                replicatorClass: 'DynamoDBReplicator',
                resourceName,
                configuredResources: Object.keys(this.resources),
                suggestion: 'Add resource to replicator resources configuration'
            });
        }
        const results = [];
        for (const tableConfig of this.resources[resourceName]) {
            if (!tableConfig.actions.includes(operation)) {
                continue;
            }
            const [ok, error, result] = await tryFn(async () => {
                switch (operation) {
                    case 'insert':
                        return await this._putItem(tableConfig.table, data);
                    case 'update':
                        return await this._updateItem(tableConfig.table, id, data, tableConfig);
                    case 'delete':
                        return await this._deleteItem(tableConfig.table, id, tableConfig);
                    default:
                        throw new ReplicationError(`Unsupported operation: ${operation}`, {
                            operation: 'replicate',
                            replicatorClass: 'DynamoDBReplicator',
                            invalidOperation: operation,
                            supportedOperations: ['insert', 'update', 'delete']
                        });
                }
            });
            if (ok) {
                results.push(result);
            }
            else {
                this.emit('replication_error', {
                    resource: resourceName,
                    operation,
                    table: tableConfig.table,
                    error: error.message
                });
                this.logger.error({ resourceName, operation, error: error.message }, 'Failed to replicate');
            }
        }
        return results.length > 0 ? results[0] : null;
    }
    async _putItem(table, data) {
        const cleanData = this._cleanInternalFields(data);
        const PutCommandClass = this.PutCommand;
        const command = new PutCommandClass({
            TableName: table,
            Item: cleanData
        });
        const result = await this.docClient.send(command);
        return result;
    }
    async _updateItem(table, id, data, tableConfig) {
        const cleanData = this._cleanInternalFields(data);
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        let index = 0;
        for (const [key, value] of Object.entries(cleanData)) {
            if (key === tableConfig.primaryKey || key === tableConfig.sortKey) {
                continue;
            }
            const attrName = `#attr${index}`;
            const attrValue = `:val${index}`;
            expressionAttributeNames[attrName] = key;
            expressionAttributeValues[attrValue] = value;
            updateExpressions.push(`${attrName} = ${attrValue}`);
            index++;
        }
        const key = { [tableConfig.primaryKey]: id };
        if (tableConfig.sortKey && cleanData[tableConfig.sortKey]) {
            key[tableConfig.sortKey] = cleanData[tableConfig.sortKey];
        }
        const UpdateCommandClass = this.UpdateCommand;
        const command = new UpdateCommandClass({
            TableName: table,
            Key: key,
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        });
        const result = await this.docClient.send(command);
        return result;
    }
    async _deleteItem(table, id, tableConfig) {
        const key = { [tableConfig.primaryKey]: id };
        const DeleteCommandClass = this.DeleteCommand;
        const command = new DeleteCommandClass({
            TableName: table,
            Key: key
        });
        const result = await this.docClient.send(command);
        return result;
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
    async replicateBatch(resourceName, records) {
        const { results, errors } = await this.processBatch(records, async (record) => {
            const [ok, err, result] = await tryFn(() => this.replicate(resourceName, record.operation, record.data, record.id));
            if (!ok) {
                throw err;
            }
            return result;
        }, {
            concurrency: this.config.batchConcurrency,
            mapError: (error, record) => ({ id: record.id, error: error.message })
        });
        return {
            success: errors.length === 0,
            results,
            errors: errors,
            total: records.length
        };
    }
    async testConnection() {
        const [ok, err] = await tryFn(async () => {
            if (!this.client) {
                throw this.createError('Client not initialized', {
                    operation: 'testConnection',
                    statusCode: 503,
                    retriable: true,
                    suggestion: 'Call initialize() before testing connectivity or ensure the DynamoDB client was created successfully.'
                });
            }
            const { ListTablesCommand } = requirePluginDependency('@aws-sdk/client-dynamodb', 'DynamoDBReplicator');
            await this.client.send(new ListTablesCommand({ Limit: 1 }));
            return true;
        });
        if (!ok) {
            this.emit('connection_error', { replicator: 'DynamoDBReplicator', error: err.message });
            return false;
        }
        return true;
    }
    async getStatus() {
        const baseStatus = await super.getStatus();
        return {
            ...baseStatus,
            connected: !!this.client,
            region: this.region,
            endpoint: this.endpoint || 'default',
            resources: Object.keys(this.resources)
        };
    }
    async cleanup() {
        if (this.client) {
            this.client.destroy();
            this.client = null;
            this.docClient = null;
        }
        await super.cleanup();
    }
}
export default DynamoDBReplicator;
//# sourceMappingURL=dynamodb-replicator.class.js.map