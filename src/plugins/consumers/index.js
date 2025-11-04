import { PluginError } from '../../errors.js';

/**
 * Lazy-loaded consumer drivers to avoid loading peer dependencies at initialization.
 * Peer dependencies required:
 * - sqs: @aws-sdk/client-sqs
 * - rabbitmq: amqplib
 */
const CONSUMER_DRIVER_LOADERS = {
  sqs: () => import('./sqs-consumer.js').then(m => m.SqsConsumer),
  rabbitmq: () => import('./rabbitmq-consumer.js').then(m => m.RabbitMqConsumer),
  // kafka: () => import('./kafka-consumer.js').then(m => m.KafkaConsumer), // futuro
};

/**
 * Creates a consumer instance based on the driver (lazy-loaded)
 * @param {string} driver - Driver type (sqs, rabbitmq, kafka...)
 * @param {Object} config - Consumer configuration
 * @returns {Promise<SqsConsumer|RabbitMqConsumer|KafkaConsumer>}
 */
export async function createConsumer(driver, config) {
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
  return new ConsumerClass(config);
}

/**
 * Individual lazy loaders for consumers
 */
export const loadSqsConsumer = () => CONSUMER_DRIVER_LOADERS.sqs();
export const loadRabbitMqConsumer = () => CONSUMER_DRIVER_LOADERS.rabbitmq(); 
