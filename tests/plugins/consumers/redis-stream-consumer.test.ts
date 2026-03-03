import { RedisStreamConsumer } from '#src/plugins/consumers/redis-stream-consumer.js';

describe('Redis Stream Consumer Tests', () => {
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
      consumer = new RedisStreamConsumer({
        stream: 'my-stream',
        group: 'my-group',
        consumer: 'worker-1',
        onMessage: mockOnMessage,
        onError: mockOnError
      });

      expect(consumer.stream).toBe('my-stream');
      expect(consumer.group).toBe('my-group');
      expect(consumer.consumer).toBe('worker-1');
      expect(consumer.onMessage).toBe(mockOnMessage);
      expect(consumer.onError).toBe(mockOnError);
      expect(consumer.driver).toBe('redis-stream');
    });

    test('should use default values for optional configuration', () => {
      consumer = new RedisStreamConsumer({
        stream: 'my-stream',
        group: 'my-group',
        consumer: 'worker-1',
        onMessage: mockOnMessage
      });

      expect(consumer.blockTimeout).toBe(5000);
      expect(consumer.count).toBe(10);
      expect(consumer.startId).toBe('0');
      expect(consumer.claimInterval).toBe(30000);
      expect(consumer.claimMinIdleTime).toBe(60000);
      expect(consumer.reconnectInterval).toBe(2000);
      expect(consumer.driver).toBe('redis-stream');
      expect(consumer._stopped).toBe(false);
      expect(consumer.client).toBeNull();
    });

    test('should accept custom configuration values', () => {
      consumer = new RedisStreamConsumer({
        host: '10.0.0.1',
        port: 6380,
        password: 'secret',
        db: 2,
        stream: 'custom-stream',
        group: 'custom-group',
        consumer: 'custom-worker',
        blockTimeout: 10000,
        count: 50,
        startId: '$',
        claimInterval: 60000,
        claimMinIdleTime: 120000,
        reconnectInterval: 5000,
        onMessage: mockOnMessage,
        onError: mockOnError,
        driver: 'custom-redis-stream',
        redisOptions: { enableReadyCheck: false }
      });

      expect(consumer.stream).toBe('custom-stream');
      expect(consumer.group).toBe('custom-group');
      expect(consumer.consumer).toBe('custom-worker');
      expect(consumer.blockTimeout).toBe(10000);
      expect(consumer.count).toBe(50);
      expect(consumer.startId).toBe('$');
      expect(consumer.claimInterval).toBe(60000);
      expect(consumer.claimMinIdleTime).toBe(120000);
      expect(consumer.reconnectInterval).toBe(5000);
      expect(consumer.driver).toBe('custom-redis-stream');
    });
  });

  describe('State Management Tests', () => {
    test('should properly initialize all properties', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      expect(consumer.client).toBeNull();
      expect(consumer._stopped).toBe(false);
    });

    test('should set stopped state when stop is called', async () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      await consumer.stop();
      expect(consumer._stopped).toBe(true);
    });

    test('should handle multiple stop calls gracefully', async () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      await consumer.stop();
      await consumer.stop();
      expect(consumer._stopped).toBe(true);
    });
  });

  describe('Field Parsing Tests', () => {
    test('should parse field array into object via _parseFields', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const fields = consumer._parseFields(['name', 'John', 'age', '30', 'city', 'NYC']);
      expect(fields).toEqual({ name: 'John', age: '30', city: 'NYC' });
    });

    test('should parse empty field array', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const fields = consumer._parseFields([]);
      expect(fields).toEqual({});
    });
  });

  describe('Body Extraction Tests', () => {
    test('should extract JSON from data field', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const body = consumer._extractBody({ data: '{"name":"John"}' });
      expect(body).toEqual({ name: 'John' });
    });

    test('should extract JSON from payload field', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const body = consumer._extractBody({ payload: '{"action":"insert"}' });
      expect(body).toEqual({ action: 'insert' });
    });

    test('should extract JSON from message field', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const body = consumer._extractBody({ message: '{"event":"created"}' });
      expect(body).toEqual({ event: 'created' });
    });

    test('should extract JSON from body field', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const body = consumer._extractBody({ body: '{"id":1}' });
      expect(body).toEqual({ id: 1 });
    });

    test('should return raw string if JSON parse fails', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const body = consumer._extractBody({ data: 'not-json' });
      expect(body).toBe('not-json');
    });

    test('should return fields object when no known data key exists', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const fields = { custom1: 'val1', custom2: 'val2' };
      const body = consumer._extractBody(fields);
      expect(body).toEqual(fields);
    });

    test('should parse single value field as JSON if possible', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      const body = consumer._extractBody({ value: '{"single":true}' });
      expect(body).toEqual({ single: true });
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle missing onError callback gracefully', () => {
      expect(() => {
        consumer = new RedisStreamConsumer({
          stream: 'test-stream',
          group: 'test-group',
          consumer: 'test-worker',
          onMessage: mockOnMessage
        });
      }).not.toThrow();

      expect(consumer.onError).toBeUndefined();
    });
  });

  describe('Interface Tests', () => {
    test('should have start and stop methods', () => {
      consumer = new RedisStreamConsumer({
        stream: 'test-stream',
        group: 'test-group',
        consumer: 'test-worker',
        onMessage: mockOnMessage
      });

      expect(typeof consumer.start).toBe('function');
      expect(typeof consumer.stop).toBe('function');
    });
  });
});
