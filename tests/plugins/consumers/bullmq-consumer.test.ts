import { BullMqConsumer } from '#src/plugins/consumers/bullmq-consumer.js';

describe('BullMQ Consumer Tests', () => {
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
      consumer = new BullMqConsumer({
        queue: 'jobs',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.queue).toBe('jobs');
      expect(consumer.onMessage).toBe(mockOnMessage);
      expect(consumer.onError).toBe(mockOnError);
      expect(consumer.driver).toBe('bullmq');
    });

    test('should use default values for optional configuration', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        onMessage: mockOnMessage
      });

      expect(consumer.concurrency).toBe(1);
      expect(consumer.lockDuration).toBe(30000);
      expect(consumer.stalledInterval).toBe(30000);
      expect(consumer.maxStalledCount).toBe(1);
      expect(consumer.limiter).toBeUndefined();
      expect(consumer.removeOnComplete).toBe(true);
      expect(consumer.removeOnFail).toBe(false);
      expect(consumer.driver).toBe('bullmq');
      expect(consumer.worker).toBeNull();
    });

    test('should accept custom configuration values', () => {
      consumer = new BullMqConsumer({
        queue: 'custom-jobs',
        connection: {
          host: '10.0.0.1',
          port: 6380,
          password: 'secret',
          db: 2
        },
        concurrency: 5,
        lockDuration: 60000,
        stalledInterval: 60000,
        maxStalledCount: 3,
        limiter: { max: 100, duration: 60000 },
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 5000 },
        onMessage: mockOnMessage,
        onError: mockOnError,
        driver: 'custom-bullmq',
        workerOptions: { skipStalledCheck: true }
      });

      expect(consumer.queue).toBe('custom-jobs');
      expect(consumer.concurrency).toBe(5);
      expect(consumer.lockDuration).toBe(60000);
      expect(consumer.stalledInterval).toBe(60000);
      expect(consumer.maxStalledCount).toBe(3);
      expect(consumer.limiter).toEqual({ max: 100, duration: 60000 });
      expect(consumer.removeOnComplete).toEqual({ count: 1000, age: 3600 });
      expect(consumer.removeOnFail).toEqual({ count: 5000 });
      expect(consumer.driver).toBe('custom-bullmq');
    });

    test('should use default connection when not provided', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        onMessage: mockOnMessage
      });

      expect(consumer._connection).toEqual({
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0
      });
    });

    test('should accept partial connection config', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        connection: { host: 'redis.example.com' },
        onMessage: mockOnMessage
      });

      expect(consumer._connection).toEqual({
        host: 'redis.example.com',
        port: 6379,
        password: undefined,
        db: 0
      });
    });
  });

  describe('State Management Tests', () => {
    test('should properly initialize all properties', () => {
      consumer = new BullMqConsumer({
        queue: 'test-jobs',
        onMessage: mockOnMessage
      });

      expect(consumer.worker).toBeNull();
    });

    test('should handle stop when worker is null', async () => {
      consumer = new BullMqConsumer({
        queue: 'test-jobs',
        onMessage: mockOnMessage
      });

      await expect(consumer.stop()).resolves.not.toThrow();
    });

    test('should handle multiple stop calls gracefully', async () => {
      consumer = new BullMqConsumer({
        queue: 'test-jobs',
        onMessage: mockOnMessage
      });

      await consumer.stop();
      await consumer.stop();
      expect(consumer.worker).toBeNull();
    });
  });

  describe('Configuration Tests', () => {
    test('should accept boolean removeOnComplete', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        removeOnComplete: false,
        onMessage: mockOnMessage
      });

      expect(consumer.removeOnComplete).toBe(false);
    });

    test('should accept object removeOnComplete', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        removeOnComplete: { count: 100, age: 7200 },
        onMessage: mockOnMessage
      });

      expect(consumer.removeOnComplete).toEqual({ count: 100, age: 7200 });
    });

    test('should accept boolean removeOnFail', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        removeOnFail: true,
        onMessage: mockOnMessage
      });

      expect(consumer.removeOnFail).toBe(true);
    });

    test('should accept object removeOnFail', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        removeOnFail: { count: 500 },
        onMessage: mockOnMessage
      });

      expect(consumer.removeOnFail).toEqual({ count: 500 });
    });

    test('should accept limiter config', () => {
      consumer = new BullMqConsumer({
        queue: 'jobs',
        limiter: { max: 50, duration: 30000 },
        onMessage: mockOnMessage
      });

      expect(consumer.limiter).toEqual({ max: 50, duration: 30000 });
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle missing onError callback gracefully', () => {
      expect(() => {
        consumer = new BullMqConsumer({
          queue: 'test-jobs',
          onMessage: mockOnMessage
        });
      }).not.toThrow();

      expect(consumer.onError).toBeUndefined();
    });
  });

  describe('Start Dependency Check', () => {
    test('should call requirePluginDependency on start', async () => {
      consumer = new BullMqConsumer({
        queue: 'test-jobs',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      const startPromise = consumer.start();
      await expect(startPromise).rejects.toThrow();
    });
  });
});
