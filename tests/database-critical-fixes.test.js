import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from '#src/database.class.js';
import { MemoryClient } from '#src/clients/memory-client.class.js';
import { DatabaseError } from '#src/errors.js';

/**
 * Tests for critical fixes in database.class.js
 *
 * Critical Fix 1: Memory leak - process exit listener cleanup
 * Critical Fix 2: Race condition - emit before removeAllListeners
 * Critical Fix 3: Hook error handling - strict mode
 * Critical Fix 4: Missing await in disconnect
 */
describe('Database Critical Fixes', () => {
  let db;

  beforeEach(async () => {
    const client = new MemoryClient({ bucket: 'test' });
    db = new Database({ verbose: false, client });
    await db.connect();
  });

  afterEach(async () => {
    if (db && db.isConnected()) {
      await db.disconnect();
    }
  });

  describe('Fix 1: Memory Leak - Process Exit Listener Cleanup', () => {
    it('should register exit listener in constructor', async () => {
      const client = new MemoryClient({ bucket: 'test-exit' });
      const database = new Database({ verbose: false, client });

      // Listener should be registered immediately after construction
      expect(database._exitListenerRegistered).toBe(true);
      expect(database._exitListener).toBeDefined();
      expect(typeof database._exitListener).toBe('function');

      await database.connect();
      await database.disconnect();
    });

    it('should cleanup exit listener on disconnect', async () => {
      const client = new MemoryClient({ bucket: 'test-cleanup' });
      const database = new Database({ verbose: false, client });

      await database.connect();

      const listenerRef = database._exitListener;
      expect(listenerRef).toBeDefined();
      expect(database._exitListenerRegistered).toBe(true);

      await database.disconnect();

      expect(database._exitListener).toBeNull();
      expect(database._exitListenerRegistered).toBe(false);
    });

    it('should properly handle reconnection with new listener', async () => {
      const client = new MemoryClient({ bucket: 'test-multi' });
      const database = new Database({ verbose: false, client });

      await database.connect();
      const firstListener = database._exitListener;
      expect(firstListener).toBeDefined();

      await database.disconnect();

      // After disconnect, listener should be cleaned up
      expect(database._exitListener).toBeNull();
      expect(database._exitListenerRegistered).toBe(false);

      await database.connect();
      const secondListener = database._exitListener;

      // Should have a new function reference after reconnect
      expect(secondListener).toBeDefined();
      expect(secondListener).not.toBe(firstListener);
      expect(database._exitListenerRegistered).toBe(true);

      await database.disconnect();
    });
  });

  describe('Fix 2: Race Condition - Emit Before RemoveAllListeners', () => {
    it('should receive disconnected event before listeners are removed', async () => {
      const client = new MemoryClient({ bucket: 'test-race' });
      const database = new Database({ verbose: false, client });
      await database.connect();

      let eventReceived = false;
      let eventTimestamp = null;

      database.on('disconnected', (timestamp) => {
        eventReceived = true;
        eventTimestamp = timestamp;
      });

      await database.disconnect();

      // Event should have been received before listeners were removed
      expect(eventReceived).toBe(true);
      expect(eventTimestamp).toBeInstanceOf(Date);
    });

    it('should emit disconnected event to multiple listeners', async () => {
      const client = new MemoryClient({ bucket: 'test-multi-listeners' });
      const database = new Database({ verbose: false, client });
      await database.connect();

      const receivedEvents = [];

      database.on('disconnected', (ts) => receivedEvents.push({ listener: 1, ts }));
      database.on('disconnected', (ts) => receivedEvents.push({ listener: 2, ts }));
      database.on('disconnected', (ts) => receivedEvents.push({ listener: 3, ts }));

      await database.disconnect();

      // All listeners should have received the event
      expect(receivedEvents).toHaveLength(3);
      expect(receivedEvents[0].listener).toBe(1);
      expect(receivedEvents[1].listener).toBe(2);
      expect(receivedEvents[2].listener).toBe(3);
      expect(receivedEvents[0].ts).toBeInstanceOf(Date);
    });

    it('should await disconnected event emission call', async () => {
      const client = new MemoryClient({ bucket: 'test-await' });
      const database = new Database({ verbose: false, client });
      await database.connect();

      let eventEmitted = false;

      database.on('disconnected', () => {
        // Mark event as emitted synchronously
        eventEmitted = true;
      });

      await database.disconnect();

      // The await should ensure emit call completes
      // Note: EventEmitter doesn't wait for async listeners, but the emit itself is awaited
      expect(eventEmitted).toBe(true);
    });
  });

  describe('Fix 3: Hook Error Handling - Strict Mode', () => {
    it('should continue execution on hook errors in non-strict mode (default)', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-lenient' });
      const database = new Database({ verbose: false, client, strictHooks: false });
      await database.connect();

      const executionOrder = [];

      // Add hook that throws error
      database.addHook('afterConnect', () => {
        executionOrder.push('hook1-before');
        throw new Error('Hook 1 failed');
      });

      // Add hook that should still execute
      database.addHook('afterConnect', () => {
        executionOrder.push('hook2-success');
      });

      let hookErrorEmitted = false;
      database.on('hookError', ({ event, error }) => {
        hookErrorEmitted = true;
        expect(event).toBe('afterConnect');
        expect(error.message).toBe('Hook 1 failed');
      });

      // Execute hooks - should not throw
      await database._executeHooks('afterConnect', { test: true });

      // Both hooks should have executed
      expect(executionOrder).toEqual(['hook1-before', 'hook2-success']);
      expect(hookErrorEmitted).toBe(true);

      await database.disconnect();
    });

    it('should throw on first hook error in strict mode', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-strict' });
      const database = new Database({ verbose: false, client, strictHooks: true });
      await database.connect();

      const executionOrder = [];

      // Add hook that throws error
      database.addHook('beforeUploadMetadata', () => {
        executionOrder.push('hook1-fail');
        throw new Error('Critical hook failure');
      });

      // Add hook that should NOT execute
      database.addHook('beforeUploadMetadata', () => {
        executionOrder.push('hook2-never');
      });

      let hookErrorEmitted = false;
      database.on('hookError', () => {
        hookErrorEmitted = true;
      });

      // Execute hooks - should throw on first error
      await expect(async () => {
        await database._executeHooks('beforeUploadMetadata', { test: true });
      }).rejects.toThrow(DatabaseError);

      // Second hook should never execute
      expect(executionOrder).toEqual(['hook1-fail']);
      expect(hookErrorEmitted).toBe(true);

      // Need to clean up manually since disconnect would also trigger beforeDisconnect
      database._exitListenerRegistered = false;
      database._exitListener = null;
    });

    it('should include error context in strict mode exception', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-context' });
      const database = new Database({ verbose: false, client, strictHooks: true });
      await database.connect();

      database.addHook('beforeCreateResource', () => {
        throw new Error('Resource creation not allowed');
      });

      try {
        await database._executeHooks('beforeCreateResource', { config: { name: 'users' } });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error.message).toContain('beforeCreateResource');
        expect(error.message).toContain('Resource creation not allowed');
        // DatabaseError assigns details directly to error instance
        expect(error.event).toBe('beforeCreateResource');
        expect(error.context.config.name).toBe('users');
        expect(error.originalError.message).toBe('Resource creation not allowed');
      }

      await database.disconnect();
    });

    it('should execute all hooks successfully in strict mode when no errors', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-success' });
      const database = new Database({ verbose: false, client, strictHooks: true });
      await database.connect();

      const executionOrder = [];

      database.addHook('afterConnect', () => {
        executionOrder.push('hook1');
      });

      database.addHook('afterConnect', () => {
        executionOrder.push('hook2');
      });

      database.addHook('afterConnect', () => {
        executionOrder.push('hook3');
      });

      // Should not throw
      await database._executeHooks('afterConnect', {});

      expect(executionOrder).toEqual(['hook1', 'hook2', 'hook3']);

      await database.disconnect();
    });
  });

  describe('Fix 4: Missing Await in Disconnect', () => {
    it('should properly await emit during disconnect', async () => {
      const client = new MemoryClient({ bucket: 'test-await-emit' });
      const database = new Database({ verbose: false, client });
      await database.connect();

      let emitCompleted = false;

      database.on('disconnected', () => {
        emitCompleted = true;
      });

      // Disconnect should await the emit
      await database.disconnect();

      // Emit should have completed
      expect(emitCompleted).toBe(true);
    });

    it('should ensure proper cleanup order with await', async () => {
      const client = new MemoryClient({ bucket: 'test-cleanup-order' });
      const database = new Database({ verbose: false, client });
      await database.connect();

      await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const cleanupOrder = [];

      database.on('disconnected', () => {
        cleanupOrder.push('event-emitted');
        // At this point, listeners should still be active
        expect(database.listenerCount('disconnected')).toBeGreaterThan(0);
      });

      await database.disconnect();

      cleanupOrder.push('disconnect-completed');

      // Proper order: event emitted, then listeners removed, then disconnect completed
      expect(cleanupOrder).toEqual(['event-emitted', 'disconnect-completed']);

      // After disconnect, listeners should be removed
      expect(database.listenerCount('disconnected')).toBe(0);
    });
  });

  describe('Integration: All Fixes Together', () => {
    it('should handle complete lifecycle with all fixes', async () => {
      const client = new MemoryClient({ bucket: 'test-integration' });
      const database = new Database({ verbose: false, client, strictHooks: false });

      // Track lifecycle events
      const lifecycle = [];

      database.on('db:connected', () => lifecycle.push('db:connected'));
      database.on('disconnected', () => lifecycle.push('disconnected'));
      database.on('hookError', ({ event }) => lifecycle.push(`hookError:${event}`));

      await database.connect();

      // Add a failing hook AFTER connect to avoid triggering it during setup
      database.addHook('resourceCreated', () => {
        throw new Error('Test error');
      });

      // Execute hook manually (will fail but not throw in non-strict mode)
      await database._executeHooks('resourceCreated', {});

      await database.disconnect();

      expect(lifecycle).toEqual(['db:connected', 'hookError:resourceCreated', 'disconnected']);
      expect(database._exitListener).toBeNull();
      expect(database._exitListenerRegistered).toBe(false);
      expect(database.listenerCount('disconnected')).toBe(0);
    });

    it('should handle reconnection with all fixes', async () => {
      const client = new MemoryClient({ bucket: 'test-reconnect' });
      const database = new Database({ verbose: false, client, strictHooks: true });

      // First connection
      await database.connect();
      const firstListener = database._exitListener;
      await database.disconnect();

      expect(database._exitListener).toBeNull();

      // Reconnection
      await database.connect();
      const secondListener = database._exitListener;

      expect(secondListener).toBeDefined();
      expect(secondListener).not.toBe(firstListener);

      await database.disconnect();
      expect(database._exitListener).toBeNull();
    });
  });
});
