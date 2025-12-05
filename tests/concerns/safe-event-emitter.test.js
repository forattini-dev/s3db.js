/**
 * Tests for SafeEventEmitter - Auto-cleanup EventEmitter
 */


import { SafeEventEmitter, createSafeEventEmitter } from '../../src/concerns/safe-event-emitter.js';

describe('SafeEventEmitter', () => {
  let emitter;

  beforeEach(() => {
    emitter = new SafeEventEmitter({ logLevel: 'silent', autoCleanup: false });
  });

  afterEach(() => {
    if (emitter && !emitter.isDestroyed()) {
      emitter.destroy();
      emitter.removeSignalHandlers();
    }
  });

  describe('Basic EventEmitter Functionality', () => {
    it('should work as a drop-in EventEmitter replacement', () => {
      const handler = vi.fn();
      emitter.on('test', handler);

      emitter.emit('test', 'data');

      expect(handler).toHaveBeenCalledWith('data');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support once() listeners', () => {
      const handler = vi.fn();
      emitter.once('test', handler);

      emitter.emit('test', 'first');
      emitter.emit('test', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('should support multiple listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.on('test', handler3);

      emitter.emit('test', 'data');

      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
      expect(handler3).toHaveBeenCalledWith('data');
    });

    it('should support removeListener()', () => {
      const handler = vi.fn();
      emitter.on('test', handler);

      emitter.removeListener('test', handler);
      emitter.emit('test', 'data');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support removeAllListeners()', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('event1', handler1);
      emitter.on('event2', handler2);

      emitter.removeAllListeners();

      emitter.emit('event1', 'data1');
      emitter.emit('event2', 'data2');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('Listener Statistics', () => {
    it('should report listener stats', () => {
      emitter.on('event1', () => {});
      emitter.on('event1', () => {});
      emitter.on('event2', () => {});

      const stats = emitter.getListenerStats();

      expect(stats.event1).toBe(2);
      expect(stats.event2).toBe(1);
    });

    it('should report total listener count', () => {
      emitter.on('event1', () => {});
      emitter.on('event1', () => {});
      emitter.on('event2', () => {});

      const total = emitter.getTotalListenerCount();

      expect(total).toBe(3);
    });

    it('should update stats after removing listeners', () => {
      const handler = () => {};
      emitter.on('event1', handler);
      emitter.on('event2', () => {});

      emitter.removeListener('event1', handler);

      const total = emitter.getTotalListenerCount();
      expect(total).toBe(1);
    });
  });

  describe('Destroy and Cleanup', () => {
    it('should remove all listeners on destroy()', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('event1', handler1);
      emitter.on('event2', handler2);

      emitter.destroy();

      emitter.emit('event1', 'data1');
      emitter.emit('event2', 'data2');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should mark emitter as destroyed', () => {
      expect(emitter.isDestroyed()).toBe(false);

      emitter.destroy();

      expect(emitter.isDestroyed()).toBe(true);
    });

    it('should prevent adding listeners after destruction', () => {
      emitter.destroy();

      emitter.on('test', () => {});

      expect(emitter.listenerCount('test')).toBe(0);
    });

    it('should prevent emitting after destruction', () => {
      const handler = vi.fn();
      emitter.on('test', handler);

      emitter.destroy();

      const result = emitter.emit('test', 'data');

      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple destroy() calls gracefully', () => {
      emitter.destroy();
      emitter.destroy();
      emitter.destroy();

      expect(emitter.isDestroyed()).toBe(true);
    });
  });

  describe('Factory Function', () => {
    it('should create emitter via factory function', () => {
      const created = createSafeEventEmitter({ logLevel: 'silent' });
      const handler = vi.fn();

      created.on('test', handler);
      created.emit('test', 'data');

      expect(handler).toHaveBeenCalledWith('data');

      created.destroy();
      created.removeSignalHandlers();
    });
  });

  describe('Max Listeners', () => {
    it('should respect maxListeners option', () => {
      const limited = new SafeEventEmitter({
        logLevel: 'silent',
        autoCleanup: false,
        maxListeners: 2
      });

      // Add 2 listeners (within limit)
      limited.on('test', () => {});
      limited.on('test', () => {});

      expect(limited.listenerCount('test')).toBe(2);

      limited.destroy();
      limited.removeSignalHandlers();
    });
  });

  describe('Real-World Usage', () => {
    it('should work as base class', () => {
      class MyService extends SafeEventEmitter {
        constructor() {
          super({ logLevel: 'silent', autoCleanup: false });
          this.data = [];
        }

        addData(item) {
          this.data.push(item);
          this.emit('data:added', item);
        }
      }

      const service = new MyService();
      const handler = vi.fn();

      service.on('data:added', handler);
      service.addData('test');

      expect(handler).toHaveBeenCalledWith('test');
      expect(service.data).toEqual(['test']);

      service.destroy();
      service.removeSignalHandlers();
    });

    it('should handle multiple event types', () => {
      const onStart = vi.fn();
      const onProgress = vi.fn();
      const onComplete = vi.fn();

      emitter.on('start', onStart);
      emitter.on('progress', onProgress);
      emitter.on('complete', onComplete);

      emitter.emit('start');
      emitter.emit('progress', 50);
      emitter.emit('progress', 100);
      emitter.emit('complete');

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('should clean up properly in complex scenarios', () => {
      const handlers = {
        event1: vi.fn(),
        event2: vi.fn(),
        event3: vi.fn()
      };

      // Setup multiple listeners
      emitter.on('event1', handlers.event1);
      emitter.on('event2', handlers.event2);
      emitter.once('event3', handlers.event3);

      // Emit some events
      emitter.emit('event1', 'a');
      emitter.emit('event2', 'b');

      // Destroy
      emitter.destroy();

      // Try to emit after destruction
      emitter.emit('event1', 'c');
      emitter.emit('event2', 'd');
      emitter.emit('event3', 'e');

      // Verify cleanup
      expect(handlers.event1).toHaveBeenCalledTimes(1);
      expect(handlers.event2).toHaveBeenCalledTimes(1);
      expect(handlers.event3).not.toHaveBeenCalled();
      expect(emitter.getTotalListenerCount()).toBe(0);
    });
  });
});
