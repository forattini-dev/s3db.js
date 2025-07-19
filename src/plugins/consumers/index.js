import { SqsConsumer } from './sqs-consumer.js';
import { RabbitMqConsumer } from './rabbitmq-consumer.js';

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
    throw new Error(`Unknown consumer driver: ${driver}. Available: ${Object.keys(CONSUMER_DRIVERS).join(', ')}`);
  }
  return new ConsumerClass(config);
} 