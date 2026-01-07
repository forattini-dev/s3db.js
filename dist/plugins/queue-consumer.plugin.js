import { TasksPool } from '../tasks/tasks-pool.class.js';
import { Plugin } from './plugin.class.js';
import { createConsumer } from './consumers/index.js';
import tryFn from '../concerns/try-fn.js';
import { QueueError } from './queue.errors.js';
import { createLogger } from '../concerns/logger.js';
export class QueueConsumerPlugin extends Plugin {
    driversConfig;
    consumers = [];
    startConcurrency;
    stopConcurrency;
    constructor(options = {}) {
        super(options);
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = this.logLevel || 'info';
            this.logger = createLogger({ name: 'QueueConsumerPlugin', level: logLevel });
        }
        this.driversConfig = Array.isArray(options.consumers) ? options.consumers : [];
        this.consumers = [];
        this.startConcurrency = Math.max(1, options.startConcurrency ?? 5);
        this.stopConcurrency = Math.max(1, options.stopConcurrency ?? this.startConcurrency);
    }
    async onInstall() {
        const startTasks = [];
        for (const driverDef of this.driversConfig) {
            const { driver, config: driverConfig = {}, consumers: consumerDefs = [] } = driverDef;
            for (const consumerDef of consumerDefs) {
                const { resources, ...consumerConfig } = consumerDef;
                const resourceList = Array.isArray(resources) ? resources : [resources];
                for (const resource of resourceList) {
                    startTasks.push({
                        driver,
                        resource,
                        start: async () => {
                            const mergedConfig = { ...driverConfig, ...consumerConfig };
                            const consumer = await createConsumer(driver, {
                                ...mergedConfig,
                                onMessage: (msg) => this._handleMessage(msg, resource),
                                onError: (err, raw) => this._handleError(err, raw, resource)
                            });
                            await consumer.start();
                            this.consumers.push(consumer);
                        }
                    });
                }
            }
        }
        if (startTasks.length === 0) {
            return;
        }
        const { errors } = await TasksPool.map(startTasks, async (task) => {
            await task.start();
            return `${task.driver}:${task.resource}`;
        }, { concurrency: this.startConcurrency });
        if (errors.length > 0) {
            const messages = errors.map((errorInfo) => {
                const task = errorInfo.item;
                const reason = errorInfo.error;
                const identifier = task ? `${task.driver || 'unknown'}:${task.resource || 'unknown'}` : 'unknown';
                return `[${identifier}] ${reason?.message || reason}`;
            });
            throw new QueueError('Failed to start one or more queue consumers', {
                operation: 'onInstall',
                details: messages.join('; '),
                suggestion: 'Review queue consumer configuration and connectivity before retrying.'
            });
        }
    }
    async stop() {
        if (!Array.isArray(this.consumers))
            this.consumers = [];
        if (this.consumers.length === 0) {
            return;
        }
        const stopTasks = this.consumers
            .filter((consumer) => consumer != null && typeof consumer.stop === 'function')
            .map(consumer => ({
            consumer,
            stop: () => consumer.stop()
        }));
        const { errors } = await TasksPool.map(stopTasks, async (task) => {
            await task.stop();
            return task.consumer;
        }, { concurrency: this.stopConcurrency });
        if (errors.length > 0) {
            errors.forEach((errorInfo) => {
                const reason = errorInfo.error;
                this.logger.warn({ error: reason?.message || reason }, `Failed to stop consumer: ${reason?.message || reason}`);
            });
        }
        this.consumers = [];
    }
    async _handleMessage(msg, configuredResource) {
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
        let result;
        const [ok, err, res] = await tryFn(async () => {
            if (action === 'insert') {
                result = await resourceObj.insert(data || {});
            }
            else if (action === 'update') {
                const { id: updateId, ...updateAttributes } = data || {};
                result = await resourceObj.update(updateId, updateAttributes);
            }
            else if (action === 'delete') {
                result = await resourceObj.delete(data?.id);
            }
            else {
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
    _handleError(_err, _raw, _resourceName) {
        // Error handling hook - can be extended by subclasses
    }
}
//# sourceMappingURL=queue-consumer.plugin.js.map