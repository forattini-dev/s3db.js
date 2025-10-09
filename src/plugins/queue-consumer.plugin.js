import { createConsumer } from './consumers/index.js';
import tryFn from "../concerns/try-fn.js";

// Example configuration for SQS:
// const plugin = new QueueConsumerPlugin({
//   driver: 'sqs',
//   queues: { users: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue' },
//   region: 'us-east-1',
//   credentials: { accessKeyId: '...', secretAccessKey: '...' },
//   poolingInterval: 1000,
//   maxMessages: 10,
// });
//
// Example configuration for RabbitMQ:
// const plugin = new QueueConsumerPlugin({
//   driver: 'rabbitmq',
//   queues: { users: 'users-queue' },
//   amqpUrl: 'amqp://user:pass@localhost:5672',
//   prefetch: 10,
//   reconnectInterval: 2000,
// });

export class QueueConsumerPlugin {
  constructor(options = {}) {
    this.options = options;
    // New pattern: consumers = [{ driver, config, consumers: [{ queueUrl, resources, ... }] }]
    this.driversConfig = Array.isArray(options.consumers) ? options.consumers : [];
    this.consumers = [];
  }

  async setup(database) {
    this.database = database;
    
    for (const driverDef of this.driversConfig) {
      const { driver, config: driverConfig = {}, consumers: consumerDefs = [] } = driverDef;
      
      // Handle legacy format where config is mixed with driver definition
      if (consumerDefs.length === 0 && driverDef.resources) {
        // Legacy format: { driver: 'sqs', resources: 'users', config: {...} }
        const { resources, driver: defDriver, config: nestedConfig, ...directConfig } = driverDef;
        const resourceList = Array.isArray(resources) ? resources : [resources];
        
        // Flatten config - prioritize nested config if it exists, otherwise use direct config
        const flatConfig = nestedConfig ? { ...directConfig, ...nestedConfig } : directConfig;
        
        for (const resource of resourceList) {
          const consumer = createConsumer(driver, {
            ...flatConfig,
            onMessage: (msg) => this._handleMessage(msg, resource),
            onError: (err, raw) => this._handleError(err, raw, resource)
          });
          
          await consumer.start();
          this.consumers.push(consumer);
        }
      } else {
        // New format: { driver: 'sqs', config: {...}, consumers: [{ resources: 'users', ... }] }
        for (const consumerDef of consumerDefs) {
          const { resources, ...consumerConfig } = consumerDef;
          const resourceList = Array.isArray(resources) ? resources : [resources];
          for (const resource of resourceList) {
            const mergedConfig = { ...driverConfig, ...consumerConfig };
            const consumer = createConsumer(driver, {
              ...mergedConfig,
              onMessage: (msg) => this._handleMessage(msg, resource),
              onError: (err, raw) => this._handleError(err, raw, resource)
            });
            await consumer.start();
            this.consumers.push(consumer);
          }
        }
      }
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
    const opt = this.options;
    // Permitir resource/action/data tanto na raiz quanto em $body
    // Handle double nesting from SQS parsing
    let body = msg.$body || msg;
    if (body.$body && !body.resource && !body.action && !body.data) {
      // Double nested case - use the inner $body
      body = body.$body;
    }
    
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
    
    let result;
    const [ok, err, res] = await tryFn(async () => {
      if (action === 'insert') {
        result = await resourceObj.insert(data);
      } else if (action === 'update') {
        const { id: updateId, ...updateAttributes } = data;
        result = await resourceObj.update(updateId, updateAttributes);
      } else if (action === 'delete') {
        result = await resourceObj.delete(data.id);
      } else {
        throw new Error(`QueueConsumerPlugin: unsupported action '${action}'`);
      }
      return result;
    });
    
    if (!ok) {
      throw err;
    }
    return res;
  }

  _handleError(err, raw, resourceName) {
  }
}

export default QueueConsumerPlugin;