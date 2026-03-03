import { RedisListConsumer } from '#src/plugins/consumers/redis-list-consumer.js';

describe('Redis List Consumer Tests', () => {
  let consumer;
  let mockOnMessage, mockOnError;

  beforeEach(() => {
    mockOnMessage = vi.fn().mockResolvedValue(undefined);
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
      consumer = new RedisListConsumer({
        key: 'my-queue',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.key).toBe('my-queue');
      expect(consumer.onMessage).toBe(mockOnMessage);
      expect(consumer.onError).toBe(mockOnError);
      expect(consumer.driver).toBe('redis-list');
    });

    test('should use default values for optional configuration', () => {
      consumer = new RedisListConsumer({
        key: 'my-queue',
        onMessage: mockOnMessage
      });

      expect(consumer.direction).toBe('fifo');
      expect(consumer.blockTimeout).toBe(5);
      expect(consumer.reconnectInterval).toBe(2000);
      expect(consumer.driver).toBe('redis-list');
      expect(consumer._stopped).toBe(false);
      expect(consumer.client).toBeNull();
    });

    test('should accept custom configuration values', () => {
      consumer = new RedisListConsumer({
        host: '10.0.0.1',
        port: 6380,
        password: 'secret',
        db: 2,
        key: 'custom-queue',
        direction: 'lifo',
        blockTimeout: 10,
        reconnectInterval: 5000,
        onMessage: mockOnMessage,
        onError: mockOnError,
        driver: 'custom-redis-list',
        redisOptions: { enableReadyCheck: false }
      });

      expect(consumer.key).toBe('custom-queue');
      expect(consumer.direction).toBe('lifo');
      expect(consumer.blockTimeout).toBe(10);
      expect(consumer.reconnectInterval).toBe(5000);
      expect(consumer.driver).toBe('custom-redis-list');
    });

    test('should accept fifo direction (BRPOP)', () => {
      consumer = new RedisListConsumer({
        key: 'fifo-queue',
        direction: 'fifo',
        onMessage: mockOnMessage
      });

      expect(consumer.direction).toBe('fifo');
    });

    test('should accept lifo direction (BLPOP)', () => {
      consumer = new RedisListConsumer({
        key: 'lifo-queue',
        direction: 'lifo',
        onMessage: mockOnMessage
      });

      expect(consumer.direction).toBe('lifo');
    });
  });

  describe('State Management Tests', () => {
    test('should properly initialize all properties', () => {
      consumer = new RedisListConsumer({
        key: 'test-queue',
        onMessage: mockOnMessage
      });

      expect(consumer.client).toBeNull();
      expect(consumer._stopped).toBe(false);
    });

    test('should set stopped state when stop is called', async () => {
      consumer = new RedisListConsumer({
        key: 'test-queue',
        onMessage: mockOnMessage
      });

      await consumer.stop();
      expect(consumer._stopped).toBe(true);
    });

    test('should handle multiple stop calls gracefully', async () => {
      consumer = new RedisListConsumer({
        key: 'test-queue',
        onMessage: mockOnMessage
      });

      await consumer.stop();
      await consumer.stop();
      expect(consumer._stopped).toBe(true);
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle missing onError callback gracefully', () => {
      expect(() => {
        consumer = new RedisListConsumer({
          key: 'test-queue',
          onMessage: mockOnMessage
        });
      }).not.toThrow();

      expect(consumer.onError).toBeUndefined();
    });
  });

  describe('Interface Tests', () => {
    test('should have start and stop methods', () => {
      consumer = new RedisListConsumer({
        key: 'test-queue',
        onMessage: mockOnMessage
      });

      expect(typeof consumer.start).toBe('function');
      expect(typeof consumer.stop).toBe('function');
    });
  });
});
