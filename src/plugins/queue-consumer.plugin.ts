import { TasksPool } from '../tasks/tasks-pool.class.js';
import { Plugin } from './plugin.class.js';
import { createConsumer } from './consumers/index.js';
import tryFn from '../concerns/try-fn.js';
import { QueueError } from './queue.errors.js';
import { createLogger } from '../concerns/logger.js';

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Database {
  resources: Record<string, Resource>;
}

interface Resource {
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<void>;
}

interface Consumer {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(data: unknown, options?: unknown): Promise<unknown>;
}

export interface QueueDefinition {
  name?: string;
  resources?: string | string[];
  onMessage?: (message: QueueMessage, context: QueueMessageContext) => Promise<unknown>;
  queueUrl?: string;
  queueName?: string;
  [key: string]: unknown;
}

export interface DriverDefinition {
  driver: string;
  queues?: QueueDefinition[];
  [key: string]: unknown;
}

export interface QueueMessageContext {
  driver: string;
  queueName: string;
  raw: unknown;
}

interface QueueMessage {
  resource?: string;
  action?: string;
  data?: Record<string, unknown>;
  $body?: QueueMessage;
  [key: string]: unknown;
}

interface StartTask {
  driver: string;
  queueName: string;
  start: () => Promise<void>;
}

interface StopTask {
  consumer: Consumer;
  stop: () => Promise<void>;
}

/** @deprecated Use DriverDefinition instead */
interface LegacyDriverDefinition {
  driver: string;
  config?: Record<string, unknown>;
  consumers?: LegacyConsumerDefinition[];
}

/** @deprecated Use QueueDefinition instead */
interface LegacyConsumerDefinition {
  name?: string;
  resources: string | string[];
  queueUrl?: string;
  queueName?: string;
  [key: string]: unknown;
}

export interface QueueConsumerPluginOptions {
  drivers?: DriverDefinition[];
  startConcurrency?: number;
  stopConcurrency?: number;
  logger?: Logger;
  logLevel?: string;
  /** @deprecated Use `drivers` instead */
  consumers?: LegacyDriverDefinition[];
}

export class QueueConsumerPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  driversConfig: DriverDefinition[];
  consumers: Consumer[] = [];
  _consumersByName: Map<string, Consumer> = new Map();
  startConcurrency: number;
  stopConcurrency: number;

  constructor(options: QueueConsumerPluginOptions = {}) {
    super(options as any);

    if (options.logger) {
      this.logger = options.logger as any;
    } else {
      const logLevel = this.logLevel || 'info';
      this.logger = createLogger({ name: 'QueueConsumerPlugin', level: logLevel as any });
    }

    this.driversConfig = this._normalizeDriversConfig(options);
    this.consumers = [];
    this.startConcurrency = Math.max(1, options.startConcurrency ?? 5);
    this.stopConcurrency = Math.max(1, options.stopConcurrency ?? this.startConcurrency);
  }

  private _normalizeDriversConfig(options: QueueConsumerPluginOptions): DriverDefinition[] {
    if (options.drivers) {
      return options.drivers;
    }

    if (options.consumers) {
      return options.consumers.map((legacy: LegacyDriverDefinition) => {
        const { driver, config = {}, consumers: legacyQueues = [], ...rest } = legacy;
        return {
          driver,
          ...config,
          ...rest,
          queues: legacyQueues.map((q: LegacyConsumerDefinition) => ({ ...q }))
        } as DriverDefinition;
      });
    }

    return [];
  }

  override async onInstall(): Promise<void> {
    const startTasks: StartTask[] = [];

    for (const driverDef of this.driversConfig) {
      const { driver, queues = [], ...driverConfig } = driverDef;

      for (const queueDef of queues) {
        const { resources, name: explicitName, onMessage: customHandler, ...queueConfig } = queueDef;
        const queueName = explicitName || this._deriveQueueName(driver, { ...driverConfig, ...queueConfig }, String(resources || 'custom'));

        if (customHandler) {
          startTasks.push({
            driver,
            queueName,
            start: async () => {
              const mergedConfig = { ...driverConfig, ...queueConfig };
              const consumer = await createConsumer(driver, {
                ...mergedConfig,
                onMessage: (msg: QueueMessage) => customHandler(msg, { driver, queueName, raw: msg }),
                onError: (err: Error, raw: unknown) => this._handleError(err, raw, queueName)
              });
              await consumer.start();
              this.consumers.push(consumer);
              this._consumersByName.set(queueName, consumer);
            }
          });
        } else {
          const resourceList = Array.isArray(resources) ? resources : [resources].filter(Boolean);

          for (const resource of resourceList) {
            const resourceQueueName = explicitName || this._deriveQueueName(driver, { ...driverConfig, ...queueConfig }, resource as string);

            startTasks.push({
              driver,
              queueName: resourceQueueName,
              start: async () => {
                const mergedConfig = { ...driverConfig, ...queueConfig };
                const consumer = await createConsumer(driver, {
                  ...mergedConfig,
                  onMessage: (msg: QueueMessage) => this._handleMessage(msg, resource as string),
                  onError: (err: Error, raw: unknown) => this._handleError(err, raw, resource as string)
                });
                await consumer.start();
                this.consumers.push(consumer);
                this._consumersByName.set(resourceQueueName, consumer);
              }
            });
          }
        }
      }
    }

    if (startTasks.length === 0) {
      return;
    }

    const { errors } = await TasksPool.map(
      startTasks,
      async (task: StartTask) => {
        await task.start();
        return `${task.driver}:${task.queueName}`;
      },
      { concurrency: this.startConcurrency }
    );

    if (errors.length > 0) {
      const messages = errors.map((errorInfo) => {
        const task = errorInfo.item as StartTask | undefined;
        const reason = errorInfo.error;
        const identifier = task ? `${task.driver || 'unknown'}:${task.queueName || 'unknown'}` : 'unknown';
        return `[${identifier}] ${reason?.message || reason}`;
      });

      throw new QueueError('Failed to start one or more queue consumers', {
        operation: 'onInstall',
        details: messages.join('; '),
        suggestion: 'Review queue consumer configuration and connectivity before retrying.'
      });
    }
  }

  override async stop(): Promise<void> {
    if (!Array.isArray(this.consumers)) this.consumers = [];
    if (this.consumers.length === 0) {
      return;
    }

    const stopTasks: StopTask[] = this.consumers
      .filter((consumer): consumer is Consumer => consumer != null && typeof consumer.stop === 'function')
      .map(consumer => ({
        consumer,
        stop: () => consumer.stop()
      }));

    const { errors } = await TasksPool.map(
      stopTasks,
      async (task: StopTask) => {
        await task.stop();
        return task.consumer;
      },
      { concurrency: this.stopConcurrency }
    );

    if (errors.length > 0) {
      errors.forEach((errorInfo) => {
        const reason = errorInfo.error;
        this.logger.warn(
          { error: reason?.message || reason },
          `Failed to stop consumer: ${reason?.message || reason}`
        );
      });
    }

    this.consumers = [];
    this._consumersByName.clear();
  }

  async _handleMessage(msg: QueueMessage, configuredResource: string): Promise<unknown> {
    let body = msg.$body || msg;
    if (body.$body && !body.resource && !body.action && !body.data) {
      body = body.$body;
    }

    const resource = body.resource || msg.resource;
    const action = body.action || msg.action;
    const data = body.data || msg.data;

    if (!resource) {
      throw new QueueError('Resource not found in message', {
        operation: 'handleMessage',
        queueName: configuredResource,
        messageBody: body,
        suggestion: 'Ensure message includes a "resource" field specifying the target resource name'
      });
    }
    if (!action) {
      throw new QueueError('Action not found in message', {
        operation: 'handleMessage',
        queueName: configuredResource,
        resource,
        messageBody: body,
        suggestion: 'Ensure message includes an "action" field (insert, update, or delete)'
      });
    }
    const resourceObj = this.database.resources[resource];
    if (!resourceObj) {
      throw new QueueError(`Resource '${resource}' not found`, {
        operation: 'handleMessage',
        queueName: configuredResource,
        resource,
        availableResources: Object.keys(this.database.resources),
        suggestion: 'Check resource name or ensure resource is created before consuming messages'
      });
    }

    let result: unknown;
    const [ok, err, res] = await tryFn(async () => {
      if (action === 'insert') {
        result = await resourceObj.insert(data || {});
      } else if (action === 'update') {
        const { id: updateId, ...updateAttributes } = data || {};
        result = await resourceObj.update(updateId as string, updateAttributes);
      } else if (action === 'delete') {
        result = await resourceObj.delete((data as { id: string })?.id);
      } else {
        throw new QueueError(`Unsupported action '${action}'`, {
          operation: 'handleMessage',
          queueName: configuredResource,
          resource,
          action,
          supportedActions: ['insert', 'update', 'delete'],
          suggestion: 'Use one of the supported actions: insert, update, or delete'
        });
      }
      return result;
    });

    if (!ok) {
      throw err;
    }
    return res;
  }

  async publish(target: string, data: unknown, options?: unknown): Promise<unknown> {
    const consumer = this._consumersByName.get(target);
    if (!consumer) {
      const available = Array.from(this._consumersByName.keys());
      throw new QueueError(`Publisher '${target}' not found`, {
        operation: 'publish',
        queueName: target,
        suggestion: available.length > 0
          ? `Available publishers: ${available.join(', ')}`
          : 'No consumers registered. Ensure the plugin is installed and consumers are configured.'
      });
    }
    return consumer.publish(data, options);
  }

  getPublisher(target: string): Consumer | undefined {
    return this._consumersByName.get(target);
  }

  listPublishers(): string[] {
    return Array.from(this._consumersByName.keys());
  }

  _deriveQueueName(driver: string, config: Record<string, unknown>, resource: string): string {
    const queueId = config.queueUrl || config.queue || config.key || config.stream || (config.channels as string[])?.[0] || resource;
    return `${driver}:${queueId}`;
  }

  /** @deprecated Use _deriveQueueName instead */
  _deriveConsumerName(driver: string, config: Record<string, unknown>, resource: string): string {
    return this._deriveQueueName(driver, config, resource);
  }

  _handleError(_err: Error, _raw: unknown, _resourceName: string): void {
    // Error handling hook - can be extended by subclasses
  }
}
