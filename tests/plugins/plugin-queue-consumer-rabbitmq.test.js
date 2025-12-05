import { RabbitMqConsumer } from '#src/plugins/consumers/rabbitmq-consumer.js';

describe('RabbitMQ Consumer Tests', () => {
  let consumer;
  let mockOnMessage, mockOnError;

  beforeEach(() => {
    mockOnMessage = vi.fn().mockResolvedValue();
    mockOnError = vi.fn();
  });

  afterEach(async () => {
    if (consumer && typeof consumer.stop === 'function') {
      try {
        await consumer.stop();
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
  });

  describe('Constructor Tests', () => {
    test('should create consumer with required configuration', () => {
      consumer = new RabbitMqConsumer({
        amqpUrl: 'amqp://localhost:5672',
        queue: 'test-queue',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.amqpUrl).toBe('amqp://localhost:5672');
      expect(consumer.queue).toBe('test-queue');
      expect(consumer.onMessage).toBe(mockOnMessage);
      expect(consumer.onError).toBe(mockOnError);
      expect(consumer.driver).toBe('rabbitmq');
    });

    test('should use default values for optional configuration', () => {
      consumer = new RabbitMqConsumer({
        amqpUrl: 'amqp://localhost:5672',
        queue: 'test-queue',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.prefetch).toBe(10);
      expect(consumer.reconnectInterval).toBe(2000);
      expect(consumer._stopped).toBe(false);
    });

    test('should accept custom configuration values', () => {
      consumer = new RabbitMqConsumer({
        amqpUrl: 'amqp://user:pass@localhost:5672/vhost',
        queue: 'custom-queue',
        prefetch: 5,
        reconnectInterval: 5000,
        onMessage: mockOnMessage,
        onError: mockOnError,
        driver: 'custom-rabbitmq'
      });

      expect(consumer.amqpUrl).toBe('amqp://user:pass@localhost:5672/vhost');
      expect(consumer.queue).toBe('custom-queue');
      expect(consumer.prefetch).toBe(5);
      expect(consumer.reconnectInterval).toBe(5000);
      expect(consumer.driver).toBe('custom-rabbitmq');
    });
  });

  describe('State Management Tests', () => {
    test('should properly initialize all properties', () => {
      consumer = new RabbitMqConsumer({
        amqpUrl: 'amqp://localhost:5672',
        queue: 'test-queue',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.connection).toBeNull();
      expect(consumer.channel).toBeNull();
      expect(consumer._stopped).toBe(false);
    });

    test('should set stopped state when stop is called', async () => {
      consumer = new RabbitMqConsumer({
        amqpUrl: 'amqp://localhost:5672',
        queue: 'test-queue',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      await consumer.stop();
      expect(consumer._stopped).toBe(true);
    });

    test('should handle multiple stop calls gracefully', async () => {
      consumer = new RabbitMqConsumer({
        amqpUrl: 'amqp://localhost:5672',
        queue: 'test-queue',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      await consumer.stop();
      await consumer.stop(); // Second stop call

      expect(consumer._stopped).toBe(true);
    });
  });

  describe('Configuration Validation Tests', () => {
    test('should accept valid AMQP URLs', () => {
      const validUrls = [
        'amqp://localhost',
        'amqp://localhost:5672',
        'amqp://user:pass@localhost:5672',
        'amqp://user:pass@localhost:5672/vhost',
        'amqps://secure.example.com:5671'
      ];

      validUrls.forEach(url => {
        consumer = new RabbitMqConsumer({
          amqpUrl: url,
          queue: 'test-queue',
          onMessage: mockOnMessage,
          onError: mockOnError
        });

        expect(consumer.amqpUrl).toBe(url);
      });
    });

    test('should accept valid queue names', () => {
      const validQueues = [
        'simple-queue',
        'queue_with_underscores',
        'queue.with.dots',
        'queue123',
        'very-long-queue-name-that-should-still-work'
      ];

      validQueues.forEach(queue => {
        consumer = new RabbitMqConsumer({
          amqpUrl: 'amqp://localhost:5672',
          queue: queue,
          onMessage: mockOnMessage,
          onError: mockOnError
        });

        expect(consumer.queue).toBe(queue);
      });
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle missing onMessage callback gracefully', () => {
      expect(() => {
        consumer = new RabbitMqConsumer({
          amqpUrl: 'amqp://localhost:5672',
          queue: 'test-queue',
          onError: mockOnError
          // Note: onMessage is missing
        });
      }).not.toThrow();

      expect(consumer.onMessage).toBeUndefined();
    });

    test('should handle missing onError callback gracefully', () => {
      expect(() => {
        consumer = new RabbitMqConsumer({
          amqpUrl: 'amqp://localhost:5672',
          queue: 'test-queue',
          onMessage: mockOnMessage
          // Note: onError is missing
        });
      }).not.toThrow();

      expect(consumer.onError).toBeUndefined();
    });
  });

  describe('Default Values Tests', () => {
    test('should use correct default values', () => {
      consumer = new RabbitMqConsumer({
        amqpUrl: 'amqp://localhost:5672',
        queue: 'test-queue',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.prefetch).toBe(10);
      expect(consumer.reconnectInterval).toBe(2000);
      expect(consumer.driver).toBe('rabbitmq');
      expect(consumer._stopped).toBe(false);
      expect(consumer.connection).toBeNull();
      expect(consumer.channel).toBeNull();
    });
  });
}); 