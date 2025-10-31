import { SqsConsumer } from './sqs-consumer.js';
import { RabbitMqConsumer } from './rabbitmq-consumer.js';
import { PluginError } from '../../errors.js';

export { SqsConsumer, RabbitMqConsumer };

export const CONSUMER_DRIVERS = {
  sqs: SqsConsumer,
  rabbitmq: RabbitMqConsumer,
  // kafka: KafkaConsumer, // futuro
};

/**
 * Creates a consumer instance based on the driver
 * @param {string} driver - Driver type (sqs, rabbitmq, kafka...)
 * @param {Object} config - Consumer configuration
 * @returns {SqsConsumer|RabbitMqConsumer|KafkaConsumer}
 */
export function createConsumer(driver, config) {
  const ConsumerClass = CONSUMER_DRIVERS[driver];
  if (!ConsumerClass) {
    throw new PluginError(`Unknown consumer driver: ${driver}`, {
      pluginName: 'ConsumersPlugin',
      operation: 'createConsumer',
      statusCode: 400,
      retriable: false,
      suggestion: `Use one of the available drivers: ${Object.keys(CONSUMER_DRIVERS).join(', ')}`,
      driver
    });
  }
  return new ConsumerClass(config);
} 
