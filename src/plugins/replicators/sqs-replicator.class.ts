import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';

import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';

export interface SqsResourceConfig {
  name?: string;
  queueUrl?: string;
  queueName?: string;
  queueAttributes?: Record<string, string>;
  queueTags?: Record<string, string>;
  transform?: (data: Record<string, unknown>) => Record<string, unknown>;
  [key: string]: unknown;
}

export interface SqsReplicatorConfig extends BaseReplicatorConfig {
  region?: string;
  endpoint?: string;
  queueUrl?: string;
  queueName?: string;
  queues?: Record<string, string>;
  queueNames?: Record<string, string>;
  defaultQueue?: string | null;
  defaultQueueName?: string | null;
  messageGroupId?: string;
  deduplicationId?: boolean;
  resourceQueueMap?: Record<string, string[]> | null;
  ensureQueues?: boolean;
  queueAttributes?: Record<string, string>;
  queueTags?: Record<string, string>;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export interface SqsMessage {
  resource: string;
  action: string;
  timestamp: string;
  source: string;
  data?: unknown;
  before?: unknown;
}

export interface ReplicateResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  results?: Array<{ queueUrl: string; messageId: string }>;
  total?: number;
  queueUrl?: string;
  errors?: Array<{ batch: number; error: string }>;
}

interface SQSClientLike {
  send(command: unknown): Promise<{ MessageId?: string; QueueUrl?: string }>;
  destroy?(): void;
}

type ResourcesInput =
  | string[]
  | Array<{
    name: string;
    queueUrl?: string;
    queueName?: string;
    queueAttributes?: Record<string, string>;
    queueTags?: Record<string, string>;
    [key: string]: unknown;
  }>
  | Record<string, SqsResourceConfig | boolean>;

class SqsReplicator extends BaseReplicator {
  client: SQSClientLike | null;
  queueUrl: string | undefined;
  queueName: string | null;
  queues: Record<string, string>;
  queueNames: Record<string, string>;
  defaultQueue: string | null;
  defaultQueueName: string | null;
  region: string;
  endpoint: string | undefined;
  sqsClient: SQSClientLike | null;
  messageGroupId: string | undefined;
  deduplicationId: boolean | undefined;
  resourceQueueMap: Record<string, string[]> | null;
  ensureQueues: boolean;
  queueAttributes: Record<string, string>;
  queueTags: Record<string, string>;
  resources: Record<string, SqsResourceConfig | boolean>;

  constructor(config: SqsReplicatorConfig = {}, resources: ResourcesInput = [], client: SQSClientLike | null = null) {
    super(config);
    this.client = client;
    this.queueUrl = config.queueUrl;
    this.queueName = config.queueName || this._extractQueueName(config.queueUrl) || null;
    this.queues = config.queues || {};
    this.queueNames = { ...(config.queueNames || {}) };
    this.defaultQueue = config.defaultQueue || null;
    this.defaultQueueName = config.defaultQueueName || this._extractQueueName(config.defaultQueue) || null;
    this.region = config.region || 'us-east-1';
    this.endpoint = config.endpoint;
    this.sqsClient = client || null;
    this.messageGroupId = config.messageGroupId;
    this.deduplicationId = config.deduplicationId;
    this.resourceQueueMap = config.resourceQueueMap || null;
    this.ensureQueues = config.ensureQueues !== false;
    this.queueAttributes = { ...(config.queueAttributes || {}) };
    this.queueTags = { ...(config.queueTags || {}) };

    if (Array.isArray(resources)) {
      this.resources = {};
      for (const resource of resources) {
        if (typeof resource === 'string') {
          this.resources[resource] = true;
        } else if (typeof resource === 'object' && resource.name) {
          this.resources[resource.name] = resource;
          if (resource.queueName) {
            this.queueNames[resource.name] = resource.queueName;
          } else if (resource.queueUrl) {
            const extractedQueueName = this._extractQueueName(resource.queueUrl);
            if (extractedQueueName) {
              this.queueNames[resource.name] = extractedQueueName;
            }
          }
          if (resource.queueUrl) {
            this.queues[resource.name] = resource.queueUrl;
          }
        }
      }
    } else if (typeof resources === 'object') {
      this.resources = resources as Record<string, SqsResourceConfig | boolean>;
      for (const [resourceName, resourceConfig] of Object.entries(resources)) {
        if (resourceConfig && typeof resourceConfig === 'object' && (resourceConfig as SqsResourceConfig).queueUrl) {
          this.queues[resourceName] = (resourceConfig as SqsResourceConfig).queueUrl!;
        }
        if (resourceConfig && typeof resourceConfig === 'object' && (resourceConfig as SqsResourceConfig).queueName) {
          this.queueNames[resourceName] = (resourceConfig as SqsResourceConfig).queueName!;
        } else if (resourceConfig && typeof resourceConfig === 'object' && (resourceConfig as SqsResourceConfig).queueUrl) {
          const extractedQueueName = this._extractQueueName((resourceConfig as SqsResourceConfig).queueUrl);
          if (extractedQueueName) {
            this.queueNames[resourceName] = extractedQueueName;
          }
        }
      }
    } else {
      this.resources = {};
    }
  }

  override validateConfig(): ValidationResult {
    const errors: string[] = [];
    if (!this.queueUrl && Object.keys(this.queues).length === 0 && !this.defaultQueue && !this.resourceQueueMap) {
      errors.push('Either queueUrl, queues object, defaultQueue, or resourceQueueMap must be provided');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getQueueUrlsForResource(resource: string): string[] {
    if (this.resourceQueueMap && this.resourceQueueMap[resource]) {
      return this.resourceQueueMap[resource];
    }
    if (this.queues[resource]) {
      return [this.queues[resource]];
    }
    if (this.queueUrl) {
      return [this.queueUrl];
    }
    if (this.defaultQueue) {
      return [this.defaultQueue];
    }
    throw this.createError(`No queue URL found for resource '${resource}'`, {
      operation: 'resolveQueue',
      resourceName: resource,
      statusCode: 404,
      retriable: false,
      suggestion: 'Provide queueUrl, defaultQueue, queues mapping, or resourceQueueMap for this resource.'
    });
  }

  private _extractQueueName(target: string | null | undefined): string | null {
    if (typeof target !== 'string') return null;
    const trimmed = target.trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;

    try {
      const parsed = new URL(trimmed);
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  }

  private _isMissingQueueError(error: unknown): boolean {
    const message = (error as { message?: string; name?: string })?.message || (error as { name?: string })?.name || '';
    return /non.?existentqueue|queuedoesnotexist|does not exist|not found/i.test(message);
  }

  private _buildQueueAttributes(
    queueName: string,
    resourceAttributes: Record<string, string> = {}
  ): Record<string, string> | undefined {
    const attributes = {
      ...this.queueAttributes,
      ...resourceAttributes
    };

    if (queueName.endsWith('.fifo') && !attributes.FifoQueue) {
      attributes.FifoQueue = 'true';
    }

    return Object.keys(attributes).length > 0 ? attributes : undefined;
  }

  private async _resolveQueueUrl(
    target: string | null | undefined,
    queueNameHint?: string | null,
    options: {
      resourceName?: string;
      queueAttributes?: Record<string, string>;
      queueTags?: Record<string, string>;
    } = {}
  ): Promise<string | null> {
    if (!target && !queueNameHint) {
      return null;
    }

    const queueName = queueNameHint || this._extractQueueName(target);
    if (!queueName) {
      throw this.createError('Unable to resolve queue name for SQS replicator', {
        operation: 'resolveQueue',
        resourceName: options.resourceName,
        suggestion: 'Provide queueName/defaultQueueName or a valid queueUrl so the replicator can ensure the queue during boot.'
      });
    }

    const sdk = await import('@aws-sdk/client-sqs');
    const { GetQueueUrlCommand, CreateQueueCommand } = sdk;

    const [existingOk, existingErr, existing] = await tryFn(() =>
      this.sqsClient!.send(new GetQueueUrlCommand({ QueueName: queueName }))
    );

    if (existingOk && existing?.QueueUrl) {
      return existing.QueueUrl;
    }

    if (!existingOk && !this._isMissingQueueError(existingErr)) {
      throw existingErr;
    }

    const createInput: {
      QueueName: string;
      Attributes?: Record<string, string>;
      tags?: Record<string, string>;
    } = {
      QueueName: queueName
    };
    const attributes = this._buildQueueAttributes(queueName, options.queueAttributes);
    if (attributes) createInput.Attributes = attributes;

    const tags = {
      ...this.queueTags,
      ...(options.queueTags || {})
    };
    if (Object.keys(tags).length > 0) createInput.tags = tags;

    const created = await this.sqsClient!.send(new CreateQueueCommand(createInput));
    if (!created?.QueueUrl) {
      throw this.createError(`SQS queue '${queueName}' was created without returning a QueueUrl`, {
        operation: 'createQueue',
        resourceName: options.resourceName,
        suggestion: 'Verify the AWS SQS endpoint and permissions allow queue creation.'
      });
    }

    this.emit('plg:replicator:queue-created', {
      replicator: this.name,
      resource: options.resourceName,
      queueName,
      queueUrl: created.QueueUrl
    });

    return created.QueueUrl;
  }

  private async _ensureConfiguredQueues(): Promise<void> {
    if (!this.sqsClient || !this.ensureQueues) {
      return;
    }

    if (this.queueUrl || this.queueName) {
      this.queueUrl = (await this._resolveQueueUrl(this.queueUrl, this.queueName)) || this.queueUrl;
      this.queueName = this._extractQueueName(this.queueUrl) || this.queueName;
    }

    if (this.defaultQueue || this.defaultQueueName) {
      this.defaultQueue = (await this._resolveQueueUrl(this.defaultQueue, this.defaultQueueName)) || this.defaultQueue;
      this.defaultQueueName = this._extractQueueName(this.defaultQueue) || this.defaultQueueName;
    }

    for (const [resourceName, queueTarget] of Object.entries(this.queues)) {
      const resourceConfig = this.resources[resourceName];
      const queueAttributes = typeof resourceConfig === 'object' ? resourceConfig.queueAttributes : undefined;
      const queueTags = typeof resourceConfig === 'object' ? resourceConfig.queueTags : undefined;
      const queueNameHint = this.queueNames[resourceName] || this._extractQueueName(queueTarget);
      const resolvedQueueUrl = await this._resolveQueueUrl(queueTarget, queueNameHint, {
        resourceName,
        queueAttributes,
        queueTags
      });

      if (resolvedQueueUrl) {
        this.queues[resourceName] = resolvedQueueUrl;
        this.queueNames[resourceName] = this._extractQueueName(resolvedQueueUrl) || queueNameHint || '';

        if (typeof resourceConfig === 'object') {
          resourceConfig.queueUrl = resolvedQueueUrl;
          resourceConfig.queueName = this.queueNames[resourceName];
        }
      }
    }

    if (this.resourceQueueMap) {
      for (const [resourceName, targets] of Object.entries(this.resourceQueueMap)) {
        const resourceConfig = this.resources[resourceName];
        const queueAttributes = typeof resourceConfig === 'object' ? resourceConfig.queueAttributes : undefined;
        const queueTags = typeof resourceConfig === 'object' ? resourceConfig.queueTags : undefined;

        this.resourceQueueMap[resourceName] = await Promise.all(
          targets.map((target, index) =>
            this._resolveQueueUrl(target, this._extractQueueName(target) || `${resourceName}-${index}`, {
              resourceName,
              queueAttributes,
              queueTags
            }).then(resolved => resolved || target)
          )
        );
      }
    }
  }

  private _applyTransformer(resource: string, data: Record<string, unknown>): Record<string, unknown> {
    let cleanData = this._cleanInternalFields(data);

    const entry = this.resources[resource];
    let result = cleanData;

    if (!entry) return cleanData;

    if (typeof entry === 'object' && typeof entry.transform === 'function') {
      result = entry.transform(cleanData);
    }

    return result || cleanData;
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

  createMessage(resource: string, operation: string, data: unknown, id: string, beforeData: unknown = null): SqsMessage {
    const baseMessage: SqsMessage = {
      resource: resource,
      action: operation,
      timestamp: new Date().toISOString(),
      source: 's3db-replicator'
    };

    switch (operation) {
      case 'insert':
        return {
          ...baseMessage,
          data: data
        };
      case 'update':
        return {
          ...baseMessage,
          before: beforeData,
          data: data
        };
      case 'delete':
        return {
          ...baseMessage,
          data: data
        };
      default:
        return {
          ...baseMessage,
          data: data
        };
    }
  }

  override async initialize(database: unknown, client?: SQSClientLike): Promise<void> {
    await super.initialize(database as { [key: string]: unknown });

    await requirePluginDependency('sqs-replicator');

    const [ok, err, sdk] = await tryFn(() => import('@aws-sdk/client-sqs'));
    if (!ok) {
      this.logger.warn({ error: (err as Error).message }, 'Failed to import SQS SDK');
      this.emit('initialization_error', {
        replicator: this.name,
        error: (err as Error).message
      });
      throw err;
    }

    if (!this.sqsClient) {
      const { SQSClient } = sdk;
      this.sqsClient = client || new SQSClient({
        region: this.region,
        credentials: this.config.credentials as SqsReplicatorConfig['credentials'],
        endpoint: this.endpoint
      }) as unknown as SQSClientLike;
    }

    await this._ensureConfiguredQueues();

    this.emit('db:plugin:initialized', {
      replicator: this.name,
      queueUrl: this.queueUrl,
      queueName: this.queueName,
      queues: this.queues,
      queueNames: this.queueNames,
      defaultQueue: this.defaultQueue,
      defaultQueueName: this.defaultQueueName
    });
  }

  override async replicate(resource: string, operation: string, data: Record<string, unknown>, id: string, beforeData: unknown = null): Promise<ReplicateResult> {
    if (this.enabled === false) {
      return { skipped: true, reason: 'replicator_disabled' };
    }
    if (!this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: 'resource_not_included' };
    }
    const [ok, err, result] = await tryFn(async () => {
      const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const queueUrls = this.getQueueUrlsForResource(resource);
      const transformedData = this._applyTransformer(resource, data);
      const message = this.createMessage(resource, operation, transformedData, id, beforeData);
      const results: Array<{ queueUrl: string; messageId: string }> = [];
      for (const queueUrl of queueUrls) {
        const command = new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
          MessageGroupId: this.messageGroupId,
          MessageDeduplicationId: this.deduplicationId ? `${resource}:${operation}:${id}` : undefined
        });
        const sendResult = await this.sqsClient!.send(command);
        results.push({ queueUrl, messageId: sendResult.MessageId! });
        this.emit('plg:replicator:replicated', {
          replicator: this.name,
          resource,
          operation,
          id,
          queueUrl,
          messageId: sendResult.MessageId,
          success: true
        });
      }
      return { success: true, results };
    });
    if (ok) return result!;
    this.logger.warn({ resource, error: (err as Error).message }, 'Replication failed');
    this.emit('plg:replicator:error', {
      replicator: this.name,
      resource,
      operation,
      id,
      error: (err as Error).message
    });
    return { success: false, error: (err as Error).message };
  }

  override async replicateBatch(resource: string, records: Array<{ operation: string; data: Record<string, unknown>; id: string; beforeData?: unknown }>): Promise<ReplicateResult> {
    if (this.enabled === false) {
      return { skipped: true, reason: 'replicator_disabled' };
    }
    if (!this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: 'resource_not_included' };
    }
    const [ok, err, result] = await tryFn(async () => {
      const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
      const queueUrls = this.getQueueUrlsForResource(resource);
      const batchSize = 10;
      const batches: Array<typeof records> = [];
      for (let i = 0; i < records.length; i += batchSize) {
        batches.push(records.slice(i, i + batchSize));
      }
      const results: unknown[] = [];
      const errors: Array<{ batch: number; error: string }> = [];
      for (const batch of batches) {
        const [okBatch, errBatch] = await tryFn(async () => {
          const entries = batch.map((record, index) => ({
            Id: `${record.id}-${index}`,
            MessageBody: JSON.stringify(this.createMessage(
              resource,
              record.operation,
              record.data,
              record.id,
              record.beforeData
            )),
            MessageGroupId: this.messageGroupId,
            MessageDeduplicationId: this.deduplicationId ?
              `${resource}:${record.operation}:${record.id}` : undefined
          }));
          const command = new SendMessageBatchCommand({
            QueueUrl: queueUrls[0],
            Entries: entries
          });
          const batchResult = await this.sqsClient!.send(command);
          results.push(batchResult);
        });
        if (!okBatch) {
          errors.push({ batch: batch.length, error: (errBatch as Error).message });
          if ((errBatch as Error).message && ((errBatch as Error).message.includes('Batch error') || (errBatch as Error).message.includes('Connection') || (errBatch as Error).message.includes('Network'))) {
            throw errBatch;
          }
        }
      }
      if (errors.length > 0) {
        this.logger.warn(
          { resource, errorCount: errors.length, errors },
          'Batch replication completed with errors'
        );
      }

      this.emit('batch_replicated', {
        replicator: this.name,
        resource,
        queueUrl: queueUrls[0],
        total: records.length,
        successful: results.length,
        errors: errors.length
      });
      return {
        success: errors.length === 0,
        results,
        errors,
        total: records.length,
        queueUrl: queueUrls[0]
      } as ReplicateResult;
    });
    if (ok) return result!;
    const errorMessage = (err as Error)?.message || String(err) || 'Unknown error';
    this.logger.warn({ resource, error: errorMessage }, 'Batch replication failed');
    this.emit('batch_replicator_error', {
      replicator: this.name,
      resource,
      error: errorMessage
    });
    return { success: false, error: errorMessage };
  }

  override async testConnection(): Promise<boolean> {
    const [ok, err] = await tryFn(async () => {
      if (!this.sqsClient) {
        await this.initialize(this.database);
      }
      const queueUrl = this.queueUrl || this.defaultQueue || Object.values(this.queues)[0] || this.resourceQueueMap?.[Object.keys(this.resourceQueueMap)[0] || '']?.[0];
      if (!queueUrl) {
        throw this.createError('No queue URL available for SQS connection test', {
          operation: 'testConnection',
          suggestion: 'Configure queueUrl, defaultQueue, queues, or resourceQueueMap before testing the SQS replicator connection.'
        });
      }
      const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['QueueArn']
      });
      await this.sqsClient!.send(command);
      return true;
    });
    if (ok) return true;
    this.logger.warn({ error: (err as Error).message }, 'Connection test failed');
    this.emit('connection_error', {
      replicator: this.name,
      error: (err as Error).message
    });
    return false;
  }

  override async getStatus(): Promise<ReplicatorStatus & {
    connected: boolean;
    queueUrl: string | undefined;
    region: string;
    resources: string[];
    totalreplicators: number;
    totalErrors: number;
  }> {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.sqsClient,
      queueUrl: this.queueUrl,
      region: this.region,
      resources: Object.keys(this.resources || {}),
      totalreplicators: this.listenerCount('replicated'),
      totalErrors: this.listenerCount('replicator_error')
    };
  }

  override async cleanup(): Promise<void> {
    if (this.sqsClient) {
      this.sqsClient.destroy?.();
    }
    await super.cleanup();
  }

  shouldReplicateResource(resource: string): boolean {
    const result = (this.resourceQueueMap && Object.keys(this.resourceQueueMap).includes(resource))
      || (this.queues && Object.keys(this.queues).includes(resource))
      || !!(this.defaultQueue || this.queueUrl)
      || (this.resources && Object.keys(this.resources).includes(resource))
      || false;
    return result;
  }
}

export default SqsReplicator;
