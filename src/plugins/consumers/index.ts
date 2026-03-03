import { PluginError } from '../../errors.js';
import { SqsConsumer } from './sqs-consumer.js';
import { RabbitMqConsumer } from './rabbitmq-consumer.js';
import { RedisListConsumer } from './redis-list-consumer.js';
import { RedisStreamConsumer } from './redis-stream-consumer.js';
import { RedisPubSubConsumer } from './redis-pubsub-consumer.js';
import { BullMqConsumer } from './bullmq-consumer.js';

export { SqsConsumer } from './sqs-consumer.js';
export { RabbitMqConsumer } from './rabbitmq-consumer.js';
export { RedisListConsumer } from './redis-list-consumer.js';
export { RedisStreamConsumer } from './redis-stream-consumer.js';
export { RedisPubSubConsumer } from './redis-pubsub-consumer.js';
export { BullMqConsumer } from './bullmq-consumer.js';

type ConsumerClass = typeof SqsConsumer | typeof RabbitMqConsumer | typeof RedisListConsumer | typeof RedisStreamConsumer | typeof RedisPubSubConsumer | typeof BullMqConsumer;

const CONSUMER_DRIVER_LOADERS: Record<string, () => Promise<ConsumerClass>> = {
  sqs: () => import('./sqs-consumer.js').then(m => m.SqsConsumer),
  rabbitmq: () => import('./rabbitmq-consumer.js').then(m => m.RabbitMqConsumer),
  'redis-list': () => import('./redis-list-consumer.js').then(m => m.RedisListConsumer),
  'redis-stream': () => import('./redis-stream-consumer.js').then(m => m.RedisStreamConsumer),
  'redis-pubsub': () => import('./redis-pubsub-consumer.js').then(m => m.RedisPubSubConsumer),
  bullmq: () => import('./bullmq-consumer.js').then(m => m.BullMqConsumer),
};

export async function createConsumer<T extends Record<string, unknown>>(
  driver: string,
  config: T
): Promise<SqsConsumer | RabbitMqConsumer | RedisListConsumer | RedisStreamConsumer | RedisPubSubConsumer | BullMqConsumer> {
  const loader = CONSUMER_DRIVER_LOADERS[driver];
  if (!loader) {
    throw new PluginError(`Unknown consumer driver: ${driver}`, {
      pluginName: 'ConsumersPlugin',
      operation: 'createConsumer',
      statusCode: 400,
      retriable: false,
      suggestion: `Use one of the available drivers: ${Object.keys(CONSUMER_DRIVER_LOADERS).join(', ')}`,
      driver
    });
  }

  const ConsumerClass = await loader();
  return new (ConsumerClass as unknown as new (config: T) => SqsConsumer | RabbitMqConsumer | RedisListConsumer | RedisStreamConsumer | RedisPubSubConsumer | BullMqConsumer)(config);
}

export const loadSqsConsumer = (): Promise<typeof SqsConsumer> =>
  CONSUMER_DRIVER_LOADERS.sqs!() as Promise<typeof SqsConsumer>;

export const loadRabbitMqConsumer = (): Promise<typeof RabbitMqConsumer> =>
  CONSUMER_DRIVER_LOADERS.rabbitmq!() as Promise<typeof RabbitMqConsumer>;

export const loadRedisListConsumer = (): Promise<typeof RedisListConsumer> =>
  CONSUMER_DRIVER_LOADERS['redis-list']!() as Promise<typeof RedisListConsumer>;

export const loadRedisStreamConsumer = (): Promise<typeof RedisStreamConsumer> =>
  CONSUMER_DRIVER_LOADERS['redis-stream']!() as Promise<typeof RedisStreamConsumer>;

export const loadRedisPubSubConsumer = (): Promise<typeof RedisPubSubConsumer> =>
  CONSUMER_DRIVER_LOADERS['redis-pubsub']!() as Promise<typeof RedisPubSubConsumer>;

export const loadBullMqConsumer = (): Promise<typeof BullMqConsumer> =>
  CONSUMER_DRIVER_LOADERS.bullmq!() as Promise<typeof BullMqConsumer>;
