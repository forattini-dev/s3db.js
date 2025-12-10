import { PluginError } from '../../errors.js';
import { SqsConsumer } from './sqs-consumer.js';
import { RabbitMqConsumer } from './rabbitmq-consumer.js';

export { SqsConsumer } from './sqs-consumer.js';
export { RabbitMqConsumer } from './rabbitmq-consumer.js';

type ConsumerClass = typeof SqsConsumer | typeof RabbitMqConsumer;

const CONSUMER_DRIVER_LOADERS: Record<string, () => Promise<ConsumerClass>> = {
  sqs: () => import('./sqs-consumer.js').then(m => m.SqsConsumer),
  rabbitmq: () => import('./rabbitmq-consumer.js').then(m => m.RabbitMqConsumer),
};

export async function createConsumer<T extends Record<string, unknown>>(
  driver: string,
  config: T
): Promise<SqsConsumer | RabbitMqConsumer> {
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
  return new (ConsumerClass as unknown as new (config: T) => SqsConsumer | RabbitMqConsumer)(config);
}

export const loadSqsConsumer = (): Promise<typeof SqsConsumer> =>
  CONSUMER_DRIVER_LOADERS.sqs!() as Promise<typeof SqsConsumer>;

export const loadRabbitMqConsumer = (): Promise<typeof RabbitMqConsumer> =>
  CONSUMER_DRIVER_LOADERS.rabbitmq!() as Promise<typeof RabbitMqConsumer>;
