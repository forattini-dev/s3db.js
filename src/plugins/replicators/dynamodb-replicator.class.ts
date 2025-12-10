import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';

import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';

export interface DynamoDBCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface DynamoDBTableConfig {
  table: string;
  actions: string[];
  primaryKey: string;
  sortKey?: string;
}

export interface DynamoDBResourceConfig {
  table?: string;
  actions?: string[];
  primaryKey?: string;
  sortKey?: string;
  [key: string]: unknown;
}

export interface DynamoDBReplicatorConfig extends BaseReplicatorConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  credentials?: DynamoDBCredentials;
}

export interface ReplicateResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  results?: unknown[];
  errors?: Array<{ id: string; error: string }>;
  total?: number;
  error?: string;
}

interface DynamoDBClientLike {
  send(command: unknown): Promise<unknown>;
  destroy(): void;
}

interface DynamoDBDocumentClientLike {
  send(command: unknown): Promise<unknown>;
}

type ResourcesInput = string | DynamoDBResourceConfig | DynamoDBResourceConfig[] | Record<string, string | DynamoDBResourceConfig | DynamoDBResourceConfig[]>;

class DynamoDBReplicator extends BaseReplicator {
  region: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  endpoint: string | undefined;
  credentials: DynamoDBCredentials | undefined;
  client: DynamoDBClientLike | null;
  docClient: DynamoDBDocumentClientLike | null;
  resources: Record<string, DynamoDBTableConfig[]>;
  PutCommand: unknown;
  UpdateCommand: unknown;
  DeleteCommand: unknown;

  constructor(config: DynamoDBReplicatorConfig = {}, resources: Record<string, ResourcesInput> = {}) {
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

  parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, DynamoDBTableConfig[]> {
    const parsed: Record<string, DynamoDBTableConfig[]> = {};

    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === 'string') {
        parsed[resourceName] = [{
          table: config,
          actions: ['insert'],
          primaryKey: 'id'
        }];
      } else if (Array.isArray(config)) {
        parsed[resourceName] = config.map(item => {
          if (typeof item === 'string') {
            return { table: item, actions: ['insert'], primaryKey: 'id' };
          }
          return {
            table: item.table!,
            actions: item.actions || ['insert'],
            primaryKey: item.primaryKey || 'id',
            sortKey: item.sortKey
          };
        });
      } else if (typeof config === 'object' && config !== null) {
        const objConfig = config as DynamoDBResourceConfig;
        parsed[resourceName] = [{
          table: objConfig.table!,
          actions: objConfig.actions || ['insert'],
          primaryKey: objConfig.primaryKey || 'id',
          sortKey: objConfig.sortKey
        }];
      }
    }

    return parsed;
  }

  override validateConfig(): ValidationResult {
    const errors: string[] = [];
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

  override async initialize(database: unknown): Promise<void> {
    await super.initialize(database as { [key: string]: unknown });

    const { DynamoDBClient } = requirePluginDependency('@aws-sdk/client-dynamodb', 'DynamoDBReplicator') as unknown as { DynamoDBClient: new (config: unknown) => DynamoDBClientLike };
    const { DynamoDBDocumentClient, PutCommand, UpdateCommand, DeleteCommand } = requirePluginDependency('@aws-sdk/lib-dynamodb', 'DynamoDBReplicator') as unknown as {
      DynamoDBDocumentClient: { from(client: unknown): DynamoDBDocumentClientLike };
      PutCommand: unknown;
      UpdateCommand: unknown;
      DeleteCommand: unknown;
    };

    this.PutCommand = PutCommand;
    this.UpdateCommand = UpdateCommand;
    this.DeleteCommand = DeleteCommand;

    const [ok, err] = await tryFn(async () => {
      const clientConfig: {
        region: string;
        endpoint?: string;
        credentials?: DynamoDBCredentials;
      } = {
        region: this.region
      };

      if (this.endpoint) {
        clientConfig.endpoint = this.endpoint;
      }

      if (this.credentials) {
        clientConfig.credentials = this.credentials;
      } else if (this.accessKeyId && this.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey
        };
      }

      this.client = new DynamoDBClient(clientConfig);
      this.docClient = DynamoDBDocumentClient.from(this.client);

      const { ListTablesCommand } = requirePluginDependency('@aws-sdk/client-dynamodb', 'DynamoDBReplicator') as unknown as { ListTablesCommand: new (params: unknown) => unknown };
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

  shouldReplicateResource(resourceName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.resources, resourceName);
  }

  override async replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string): Promise<unknown> {
    if (!this.resources[resourceName]) {
      throw new ReplicationError('Resource not configured for replication', {
        operation: 'replicate',
        replicatorClass: 'DynamoDBReplicator',
        resourceName,
        configuredResources: Object.keys(this.resources),
        suggestion: 'Add resource to replicator resources configuration'
      });
    }

    const results: unknown[] = [];

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

  private async _putItem(table: string, data: Record<string, unknown>): Promise<unknown> {
    const cleanData = this._cleanInternalFields(data);

    const PutCommandClass = this.PutCommand as new (params: unknown) => unknown;
    const command = new PutCommandClass({
      TableName: table,
      Item: cleanData
    });

    const result = await this.docClient!.send(command);
    return result;
  }

  private async _updateItem(table: string, id: string, data: Record<string, unknown>, tableConfig: DynamoDBTableConfig): Promise<unknown> {
    const cleanData = this._cleanInternalFields(data);

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};

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

    const key: Record<string, unknown> = { [tableConfig.primaryKey]: id };
    if (tableConfig.sortKey && cleanData[tableConfig.sortKey]) {
      key[tableConfig.sortKey] = cleanData[tableConfig.sortKey];
    }

    const UpdateCommandClass = this.UpdateCommand as new (params: unknown) => unknown;
    const command = new UpdateCommandClass({
      TableName: table,
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await this.docClient!.send(command);
    return result;
  }

  private async _deleteItem(table: string, id: string, tableConfig: DynamoDBTableConfig): Promise<unknown> {
    const key = { [tableConfig.primaryKey]: id };

    const DeleteCommandClass = this.DeleteCommand as new (params: unknown) => unknown;
    const command = new DeleteCommandClass({
      TableName: table,
      Key: key
    });

    const result = await this.docClient!.send(command);
    return result;
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

  override async replicateBatch(resourceName: string, records: Array<{ operation: string; data: Record<string, unknown>; id: string }>): Promise<ReplicateResult> {
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
      errors: errors as Array<{ id: string; error: string }>,
      total: records.length
    };
  }

  override async testConnection(): Promise<boolean> {
    const [ok, err] = await tryFn(async () => {
      if (!this.client) {
        throw this.createError('Client not initialized', {
          operation: 'testConnection',
          statusCode: 503,
          retriable: true,
          suggestion: 'Call initialize() before testing connectivity or ensure the DynamoDB client was created successfully.'
        });
      }

      const { ListTablesCommand } = requirePluginDependency('@aws-sdk/client-dynamodb', 'DynamoDBReplicator') as unknown as { ListTablesCommand: new (params: unknown) => unknown };
      await this.client.send(new ListTablesCommand({ Limit: 1 }));
      return true;
    });

    if (!ok) {
      this.emit('connection_error', { replicator: 'DynamoDBReplicator', error: (err as Error).message });
      return false;
    }

    return true;
  }

  override async getStatus(): Promise<ReplicatorStatus & {
    connected: boolean;
    region: string;
    endpoint: string;
    resources: string[];
  }> {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.client,
      region: this.region,
      endpoint: this.endpoint || 'default',
      resources: Object.keys(this.resources)
    };
  }

  override async cleanup(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.docClient = null;
    }
    await super.cleanup();
  }
}

export default DynamoDBReplicator;
