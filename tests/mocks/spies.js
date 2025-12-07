/**
 * Test Spies and Assertion Helpers
 *
 * Utilities for tracking function calls, creating spies,
 * and making assertions in tests.
 */

import { vi } from 'vitest';

// ============================================
// Spy Factory
// ============================================

/**
 * Create a spy that tracks calls and can be configured
 */
export function createSpy(name = 'spy') {
  const calls = [];
  let returnValue = undefined;
  let shouldThrow = null;
  let implementation = null;

  const spy = function(...args) {
    calls.push({
      args,
      timestamp: Date.now(),
      context: this
    });

    if (shouldThrow) {
      throw shouldThrow;
    }

    if (implementation) {
      return implementation.apply(this, args);
    }

    return returnValue;
  };

  // Spy metadata
  spy.spyName = name;
  spy.calls = calls;

  // Configuration methods
  spy.returns = (value) => {
    returnValue = value;
    return spy;
  };

  spy.throws = (error) => {
    shouldThrow = error instanceof Error ? error : new Error(error);
    return spy;
  };

  spy.implements = (fn) => {
    implementation = fn;
    return spy;
  };

  // Assertion helpers
  spy.wasCalled = () => calls.length > 0;
  spy.wasCalledTimes = (n) => calls.length === n;
  spy.wasCalledWith = (...expectedArgs) => {
    return calls.some(call =>
      expectedArgs.every((arg, i) =>
        JSON.stringify(arg) === JSON.stringify(call.args[i])
      )
    );
  };
  spy.getCall = (index) => calls[index];
  spy.getLastCall = () => calls[calls.length - 1];
  spy.reset = () => {
    calls.length = 0;
    returnValue = undefined;
    shouldThrow = null;
    implementation = null;
    return spy;
  };

  return spy;
}

/**
 * Create an async spy
 */
export function createAsyncSpy(name = 'asyncSpy') {
  const spy = createSpy(name);
  const originalImplements = spy.implements;

  spy.implements = (fn) => {
    originalImplements(async (...args) => fn(...args));
    return spy;
  };

  spy.resolves = (value) => {
    spy.implements(async () => value);
    return spy;
  };

  spy.rejects = (error) => {
    spy.implements(async () => {
      throw error instanceof Error ? error : new Error(error);
    });
    return spy;
  };

  return spy;
}

// ============================================
// Method Spying
// ============================================

/**
 * Spy on object methods
 */
export function spyOnMethod(obj, methodName) {
  const original = obj[methodName];
  const spy = createSpy(methodName);

  spy.implements(function(...args) {
    return original.apply(this, args);
  });

  obj[methodName] = spy;
  spy.restore = () => {
    obj[methodName] = original;
  };

  return spy;
}

/**
 * Spy on multiple methods
 */
export function spyOnMethods(obj, methodNames) {
  const spies = {};

  for (const name of methodNames) {
    spies[name] = spyOnMethod(obj, name);
  }

  spies.restoreAll = () => {
    for (const spy of Object.values(spies)) {
      if (spy.restore) spy.restore();
    }
  };

  return spies;
}

// ============================================
// Client Spying Helpers
// ============================================

/**
 * Create spies for all client methods
 */
export function spyOnClient(client) {
  const methods = [
    'putObject',
    'getObject',
    'headObject',
    'copyObject',
    'deleteObject',
    'deleteObjects',
    'listObjects',
    'exists',
    'getAllKeys',
    'count',
    'deleteAll'
  ];

  return spyOnMethods(client, methods);
}

/**
 * Create spies for resource methods
 */
export function spyOnResource(resource) {
  const methods = [
    'insert',
    'insertMany',
    'get',
    'update',
    'patch',
    'replace',
    'delete',
    'deleteAll',
    'list',
    'listIds',
    'query',
    'count',
    'exists'
  ];

  return spyOnMethods(resource, methods);
}

/**
 * Create spies for database methods
 */
export function spyOnDatabase(database) {
  const methods = [
    'connect',
    'disconnect',
    'createResource',
    'getResource',
    'deleteResource',
    'usePlugin'
  ];

  return spyOnMethods(database, methods);
}

// ============================================
// Vitest Integration
// ============================================

/**
 * Create a vitest mock function with tracking
 */
export function createVitestSpy(name = 'mock') {
  const mock = vi.fn();
  mock.spyName = name;
  return mock;
}

/**
 * Create vitest spies for client
 */
export function createClientMocks() {
  return {
    putObject: vi.fn().mockResolvedValue({ ETag: '"mock-etag"' }),
    getObject: vi.fn().mockResolvedValue({
      Body: { async *[Symbol.asyncIterator]() {} },
      Metadata: {},
      ContentType: 'application/json'
    }),
    headObject: vi.fn().mockResolvedValue({
      Metadata: {},
      ContentType: 'application/json'
    }),
    copyObject: vi.fn().mockResolvedValue({
      CopyObjectResult: { ETag: '"mock-etag"' }
    }),
    deleteObject: vi.fn().mockResolvedValue({}),
    deleteObjects: vi.fn().mockResolvedValue({ Deleted: [], Errors: [] }),
    listObjects: vi.fn().mockResolvedValue({
      Contents: [],
      IsTruncated: false
    }),
    exists: vi.fn().mockResolvedValue(false),
    getAllKeys: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0)
  };
}

// ============================================
// Assertion Helpers
// ============================================

/**
 * Assert that a spy was called with specific arguments
 */
export function assertCalledWith(spy, ...expectedArgs) {
  const calls = spy.calls || spy.mock?.calls || [];

  const found = calls.some(call => {
    const args = Array.isArray(call) ? call : call.args;
    return expectedArgs.every((arg, i) =>
      JSON.stringify(arg) === JSON.stringify(args[i])
    );
  });

  if (!found) {
    const actualCalls = calls.map(c =>
      JSON.stringify(Array.isArray(c) ? c : c.args)
    ).join('\n  ');

    throw new Error(
      `Expected spy to be called with ${JSON.stringify(expectedArgs)}\n` +
      `Actual calls:\n  ${actualCalls || '(none)'}`
    );
  }
}

/**
 * Assert call count
 */
export function assertCallCount(spy, expected) {
  const actual = spy.calls?.length || spy.mock?.calls?.length || 0;

  if (actual !== expected) {
    throw new Error(
      `Expected ${expected} calls, but got ${actual}`
    );
  }
}

/**
 * Assert spy was not called
 */
export function assertNotCalled(spy) {
  assertCallCount(spy, 0);
}

/**
 * Wait for spy to be called
 */
export async function waitForCall(spy, timeout = 1000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const callCount = spy.calls?.length || spy.mock?.calls?.length || 0;
    if (callCount > 0) {
      return true;
    }
    await new Promise(r => setTimeout(r, 10));
  }

  throw new Error(`Spy was not called within ${timeout}ms`);
}

/**
 * Wait for spy to be called n times
 */
export async function waitForCallCount(spy, count, timeout = 1000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const callCount = spy.calls?.length || spy.mock?.calls?.length || 0;
    if (callCount >= count) {
      return true;
    }
    await new Promise(r => setTimeout(r, 10));
  }

  const actual = spy.calls?.length || spy.mock?.calls?.length || 0;
  throw new Error(`Expected ${count} calls, got ${actual} within ${timeout}ms`);
}

// ============================================
// Event Tracking
// ============================================

/**
 * Track events emitted by an EventEmitter
 */
export function trackEvents(emitter, eventNames) {
  const events = {};

  for (const name of eventNames) {
    events[name] = [];
    emitter.on(name, (...args) => {
      events[name].push({
        args,
        timestamp: Date.now()
      });
    });
  }

  return {
    events,
    getEvents: (name) => events[name] || [],
    getLastEvent: (name) => {
      const list = events[name] || [];
      return list[list.length - 1];
    },
    hasEvent: (name) => (events[name]?.length || 0) > 0,
    clear: () => {
      for (const name of eventNames) {
        events[name] = [];
      }
    }
  };
}

/**
 * Wait for an event to be emitted
 */
export function waitForEvent(emitter, eventName, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event "${eventName}" not emitted within ${timeout}ms`));
    }, timeout);

    emitter.once(eventName, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

export default {
  createSpy,
  createAsyncSpy,
  spyOnMethod,
  spyOnMethods,
  spyOnClient,
  spyOnResource,
  spyOnDatabase,
  createVitestSpy,
  createClientMocks,
  assertCalledWith,
  assertCallCount,
  assertNotCalled,
  waitForCall,
  waitForCallCount,
  trackEvents,
  waitForEvent
};
