import { RedisPubSubConsumer } from '#src/plugins/consumers/redis-pubsub-consumer.js';

describe('Redis PubSub Consumer Tests', () => {
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
    test('should create consumer with channels', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['orders', 'events'],
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.channels).toEqual(['orders', 'events']);
      expect(consumer.patterns).toEqual([]);
      expect(consumer.onMessage).toBe(mockOnMessage);
      expect(consumer.onError).toBe(mockOnError);
      expect(consumer.driver).toBe('redis-pubsub');
    });

    test('should create consumer with patterns', () => {
      consumer = new RedisPubSubConsumer({
        patterns: ['orders.*', 'events.*'],
        onMessage: mockOnMessage
      });

      expect(consumer.channels).toEqual([]);
      expect(consumer.patterns).toEqual(['orders.*', 'events.*']);
      expect(consumer.driver).toBe('redis-pubsub');
    });

    test('should create consumer with both channels and patterns', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['direct-channel'],
        patterns: ['prefix.*'],
        onMessage: mockOnMessage
      });

      expect(consumer.channels).toEqual(['direct-channel']);
      expect(consumer.patterns).toEqual(['prefix.*']);
    });

    test('should throw if neither channels nor patterns provided', () => {
      expect(() => {
        consumer = new RedisPubSubConsumer({
          onMessage: mockOnMessage
        });
      }).toThrow('RedisPubSubConsumer requires at least one channel or pattern');
    });

    test('should throw if both channels and patterns are empty', () => {
      expect(() => {
        consumer = new RedisPubSubConsumer({
          channels: [],
          patterns: [],
          onMessage: mockOnMessage
        });
      }).toThrow('RedisPubSubConsumer requires at least one channel or pattern');
    });

    test('should use default values for optional configuration', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      expect(consumer.reconnectInterval).toBe(2000);
      expect(consumer.driver).toBe('redis-pubsub');
      expect(consumer._stopped).toBe(false);
      expect(consumer.client).toBeNull();
    });

    test('should accept custom configuration values', () => {
      consumer = new RedisPubSubConsumer({
        host: '10.0.0.1',
        port: 6380,
        password: 'secret',
        db: 2,
        channels: ['custom-channel'],
        reconnectInterval: 5000,
        onMessage: mockOnMessage,
        onError: mockOnError,
        driver: 'custom-redis-pubsub',
        redisOptions: { enableReadyCheck: false }
      });

      expect(consumer.channels).toEqual(['custom-channel']);
      expect(consumer.reconnectInterval).toBe(5000);
      expect(consumer.driver).toBe('custom-redis-pubsub');
    });
  });

  describe('State Management Tests', () => {
    test('should properly initialize all properties', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      expect(consumer.client).toBeNull();
      expect(consumer._stopped).toBe(false);
    });

    test('should set stopped state when stop is called', async () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      await consumer.stop();
      expect(consumer._stopped).toBe(true);
    });

    test('should handle multiple stop calls gracefully', async () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      await consumer.stop();
      await consumer.stop();
      expect(consumer._stopped).toBe(true);
    });
  });

  describe('Message Handling Tests', () => {
    test('should parse JSON message in _handleIncoming', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      consumer._handleIncoming('test', '{"action":"insert","data":{"id":1}}');

      expect(mockOnMessage).toHaveBeenCalledWith({
        $body: { action: 'insert', data: { id: 1 } },
        $raw: { channel: 'test', message: '{"action":"insert","data":{"id":1}}' }
      });
    });

    test('should fallback to raw string for non-JSON message', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      consumer._handleIncoming('test', 'plain-text-message');

      expect(mockOnMessage).toHaveBeenCalledWith({
        $body: 'plain-text-message',
        $raw: { channel: 'test', message: 'plain-text-message' }
      });
    });

    test('should include pattern in $raw for pattern messages', () => {
      consumer = new RedisPubSubConsumer({
        patterns: ['events.*'],
        onMessage: mockOnMessage
      });

      consumer._handleIncoming('events.created', '{"id":1}', 'events.*');

      expect(mockOnMessage).toHaveBeenCalledWith({
        $body: { id: 1 },
        $raw: { channel: 'events.created', message: '{"id":1}', pattern: 'events.*' }
      });
    });

    test('should not include pattern in $raw for channel messages', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      consumer._handleIncoming('test', '{"data":true}');

      const call = mockOnMessage.mock.calls[0][0];
      expect(call.$raw).not.toHaveProperty('pattern');
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle missing onError callback gracefully', () => {
      expect(() => {
        consumer = new RedisPubSubConsumer({
          channels: ['test'],
          onMessage: mockOnMessage
        });
      }).not.toThrow();

      expect(consumer.onError).toBeUndefined();
    });

    test('should call onError when onMessage throws', () => {
      const error = new Error('Handler failed');
      const throwingHandler = vi.fn(() => { throw error; });

      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: throwingHandler,
        onError: mockOnError
      });

      consumer._handleIncoming('test', '{"data":true}');

      expect(mockOnError).toHaveBeenCalledWith(
        error,
        { channel: 'test', message: '{"data":true}', pattern: undefined }
      );
    });
  });

  describe('Interface Tests', () => {
    test('should have start and stop methods', () => {
      consumer = new RedisPubSubConsumer({
        channels: ['test'],
        onMessage: mockOnMessage
      });

      expect(typeof consumer.start).toBe('function');
      expect(typeof consumer.stop).toBe('function');
    });
  });
});
