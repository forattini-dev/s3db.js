import { QueueConsumerPlugin } from '../../../src/plugins/queue-consumer.plugin.js';

describe('QueueConsumerPlugin - Config normalization', () => {
  test('should accept new drivers/queues format', () => {
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      drivers: [{
        driver: 'sqs',
        region: 'us-east-1',
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/my-queue',
        queues: [
          { resources: 'users' },
          { resources: ['orders', 'emails'] }
        ]
      }]
    });

    expect(plugin.driversConfig).toHaveLength(1);
    expect(plugin.driversConfig[0].driver).toBe('sqs');
    expect(plugin.driversConfig[0].region).toBe('us-east-1');
    expect(plugin.driversConfig[0].queues).toHaveLength(2);
    expect(plugin.driversConfig[0].queues![0].resources).toBe('users');
    expect(plugin.driversConfig[0].queues![1].resources).toEqual(['orders', 'emails']);
  });

  test('should accept legacy consumers format (backwards compat)', () => {
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      consumers: [{
        driver: 'sqs',
        config: {
          region: 'us-east-1',
          queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/my-queue',
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
        },
        consumers: [
          { resources: 'users' },
          { resources: 'orders' }
        ]
      }]
    });

    expect(plugin.driversConfig).toHaveLength(1);
    expect(plugin.driversConfig[0].driver).toBe('sqs');
    expect(plugin.driversConfig[0].region).toBe('us-east-1');
    expect(plugin.driversConfig[0].queueUrl).toBe('https://sqs.us-east-1.amazonaws.com/123/my-queue');
    expect(plugin.driversConfig[0].queues).toHaveLength(2);
    expect(plugin.driversConfig[0].queues![0].resources).toBe('users');
  });

  test('legacy config should flatten driver config to top level', () => {
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      consumers: [{
        driver: 'redis-list',
        config: {
          host: 'localhost',
          port: 6379,
          key: 'my-queue'
        },
        consumers: [
          { resources: 'events' }
        ]
      }]
    });

    const driverDef = plugin.driversConfig[0];
    expect(driverDef.driver).toBe('redis-list');
    expect(driverDef.host).toBe('localhost');
    expect(driverDef.port).toBe(6379);
    expect(driverDef.key).toBe('my-queue');
    expect(driverDef).not.toHaveProperty('config');
  });

  test('should accept queue with custom onMessage (no resource required)', () => {
    const handler = vi.fn();
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      drivers: [{
        driver: 'sqs',
        region: 'us-east-1',
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/events',
        queues: [{
          name: 'event-listener',
          onMessage: handler
        }]
      }]
    });

    expect(plugin.driversConfig[0].queues![0].onMessage).toBe(handler);
    expect(plugin.driversConfig[0].queues![0].resources).toBeUndefined();
  });

  test('should handle empty config gracefully', () => {
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });
    expect(plugin.driversConfig).toEqual([]);
  });

  test('drivers takes precedence over consumers when both provided', () => {
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      drivers: [{
        driver: 'bullmq',
        queues: [{ resources: 'jobs' }]
      }],
      consumers: [{
        driver: 'sqs',
        consumers: [{ resources: 'old' }]
      }]
    });

    expect(plugin.driversConfig).toHaveLength(1);
    expect(plugin.driversConfig[0].driver).toBe('bullmq');
  });

  test('should derive queue name correctly', () => {
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });

    expect(plugin._deriveQueueName('sqs', { queueUrl: 'https://sqs/my-queue' }, 'users'))
      .toBe('sqs:https://sqs/my-queue');
    expect(plugin._deriveQueueName('bullmq', { queue: 'email-jobs' }, 'emails'))
      .toBe('bullmq:email-jobs');
    expect(plugin._deriveQueueName('redis-list', { key: 'events' }, 'events'))
      .toBe('redis-list:events');
    expect(plugin._deriveQueueName('redis-stream', { stream: 'logs' }, 'logs'))
      .toBe('redis-stream:logs');
    expect(plugin._deriveQueueName('sqs', {}, 'fallback'))
      .toBe('sqs:fallback');
  });

  test('_deriveConsumerName should be alias for _deriveQueueName', () => {
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });
    const result1 = plugin._deriveQueueName('sqs', { queueUrl: 'x' }, 'r');
    const result2 = plugin._deriveConsumerName('sqs', { queueUrl: 'x' }, 'r');
    expect(result1).toBe(result2);
  });
});
