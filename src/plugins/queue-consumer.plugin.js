import { SqsConsumer } from './consumers/sqs-consumer.js';

export default class QueueConsumerPlugin {
  constructor(options = {}) {
    this.options = {
      queues: options.queues || {},
      resourceAttribute: options.resourceAttribute || 'resource',
      resourceBodyField: options.resourceBodyField || 'resource',
      actionAttribute: options.actionAttribute || 'action',
      actionBodyField: options.actionBodyField || 'action',
      region: options.region || 'us-east-1',
      credentials: options.credentials,
      endpoint: options.endpoint,
      poolingInterval: options.poolingInterval || 5000,
      maxMessages: options.maxMessages || 10,
      startConsumers: options.startConsumers !== false, // default true
      ...options
    };
    this.consumers = [];
  }

  async setup(database) {
    this.database = database;
    const { queues, region, credentials, poolingInterval, maxMessages, startConsumers, endpoint } = this.options;
    if (!queues || typeof queues !== 'object' || Object.keys(queues).length === 0) {
      throw new Error('QueueConsumerPlugin: No queues configured');
    }
    if (!startConsumers) {
      this.consumers = [];
      return;
    }
    const { SqsConsumer } = await import('./consumers/sqs-consumer.js');
    for (const [resource, queueUrl] of Object.entries(queues)) {
      if (!queueUrl) continue;
      const consumer = new SqsConsumer({
        queueUrl,
        region,
        credentials,
        endpoint,
        poolingInterval,
        maxMessages,
        onMessage: (msg) => this._handleMessage(msg, resource),
        onError: (err, raw) => this._handleError(err, raw, resource)
      });
      await consumer.start();
      this.consumers.push(consumer);
    }
  }

  async stop() {
    if (!Array.isArray(this.consumers)) this.consumers = [];
    for (const consumer of this.consumers) {
      if (consumer && typeof consumer.stop === 'function') {
        await consumer.stop();
      }
    }
    this.consumers = [];
  }

  async _handleMessage(msg, configuredResource) {
    // Remover log de debug
    const opt = this.options;
    // Permitir resource/action/data tanto na raiz quanto em $body
    const body = msg.$body || msg;
    let resource = body.resource || msg.resource;
    let action = body.action || msg.action;
    let data = body.data || msg.data;
    if (!resource) {
      throw new Error('QueueConsumerPlugin: resource not found in message');
    }
    if (!action) {
      throw new Error('QueueConsumerPlugin: action not found in message');
    }
    const resourceObj = this.database.resources[resource];
    if (!resourceObj) throw new Error(`QueueConsumerPlugin: resource '${resource}' not found`);
    try {
      let result;
      if (action === 'insert') result = await resourceObj.insert({ ...data });
      else if (action === 'update') result = await resourceObj.update(data.id, data);
      else if (action === 'delete') result = await resourceObj.delete(data.id);
      else throw new Error(`QueueConsumerPlugin: unsupported action '${action}'`);
      return result;
    } catch (err) {
      throw err;
    }
  }

  _handleError(err, raw, resourceName) {
  }
} 