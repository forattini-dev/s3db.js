import { describe, test, it, expect, beforeAll, afterAll } from "vitest";
import { tryFn } from '#src/concerns/try-fn.js';

describe('tryFn', () => {
  it('should handle sync function that returns value', () => {
    const [ok, err, data] = tryFn(() => 42);
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe(42);
  });

  it('should handle sync function that throws', () => {
    const [ok, err, data] = tryFn(() => { throw new Error('fail'); });
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('fail');
    expect(data).toBeUndefined();
  });

  it('should handle async function that resolves', async () => {
    const result = await tryFn(() => Promise.resolve('ok'));
    expect(result[0]).toBe(true);
    expect(result[1]).toBeNull();
    expect(result[2]).toBe('ok');
  });

  it('should handle async function that rejects', async () => {
    const result = await tryFn(() => Promise.reject(new Error('bad')));
    expect(result[0]).toBe(false);
    expect(result[1]).toBeInstanceOf(Error);
    expect(result[1].message).toBe('bad');
    expect(result[2]).toBeUndefined();
  });

  it('should handle Promise passed directly (resolve)', async () => {
    const result = await tryFn(Promise.resolve(123));
    expect(result[0]).toBe(true);
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(123);
  });

  it('should handle Promise passed directly (reject)', async () => {
    const result = await tryFn(Promise.reject(new Error('nope')));
    expect(result[0]).toBe(false);
    expect(result[1]).toBeInstanceOf(Error);
    expect(result[1].message).toBe('nope');
    expect(result[2]).toBeUndefined();
  });

  it('should handle value passed directly', () => {
    const [ok, err, data] = tryFn('hello');
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe('hello');
  });

  it('should handle null/undefined as input', () => {
    const [ok1, err1, data1] = tryFn(null);
    expect(ok1).toBe(false);
    expect(err1).toBeInstanceOf(Error);
    expect(data1).toBeUndefined();
    const [ok2, err2, data2] = tryFn(undefined);
    expect(ok2).toBe(false);
    expect(err2).toBeInstanceOf(Error);
    expect(data2).toBeUndefined();
  });

  it('should handle function that returns null/undefined', () => {
    const [ok1, err1, data1] = tryFn(() => null);
    expect(ok1).toBe(true);
    expect(err1).toBeNull();
    expect(data1).toBeNull();
    const [ok2, err2, data2] = tryFn(() => undefined);
    expect(ok2).toBe(true);
    expect(err2).toBeNull();
    expect(data2).toBeUndefined();
  });

  it('should handle function that returns Promise resolving to undefined/null', async () => {
    const result1 = await tryFn(() => Promise.resolve(undefined));
    expect(result1[0]).toBe(true);
    expect(result1[1]).toBeNull();
    expect(result1[2]).toBeUndefined();
    const result2 = await tryFn(() => Promise.resolve(null));
    expect(result2[0]).toBe(true);
    expect(result2[1]).toBeNull();
    expect(result2[2]).toBeNull();
  });

  it('should handle function that returns object, array, string, number, boolean', () => {
    expect(tryFn(() => ({ a: 1 }))[2]).toEqual({ a: 1 });
    expect(tryFn(() => [1, 2, 3])[2]).toEqual([1, 2, 3]);
    expect(tryFn(() => 'abc')[2]).toBe('abc');
    expect(tryFn(() => 0)[2]).toBe(0);
    expect(tryFn(() => true)[2]).toBe(true);
    expect(tryFn(() => false)[2]).toBe(false);
  });

  it('should handle function that returns Promise resolving to object, array, string, number, boolean', async () => {
    expect((await tryFn(() => Promise.resolve({ b: 2 })))[2]).toEqual({ b: 2 });
    expect((await tryFn(() => Promise.resolve([4, 5])))[2]).toEqual([4, 5]);
    expect((await tryFn(() => Promise.resolve('xyz')))[2]).toBe('xyz');
    expect((await tryFn(() => Promise.resolve(7)))[2]).toBe(7);
    expect((await tryFn(() => Promise.resolve(false)))[2]).toBe(false);
  });

  it('should handle function with side effects', () => {
    let x = 0;
    const [ok, err, data] = tryFn(() => { x = 5; return x; });
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe(5);
    expect(x).toBe(5);
  });

  it('should handle chaining multiple functions (sync and async) inside tryFn', async () => {
    // Encadeamento: sync -> sync -> async -> sync
    const chain = () => {
      const a = 2;
      const b = a + 3;
      return Promise.resolve(b * 2).then(c => c + 1);
    };
    const result = await tryFn(chain);
    expect(result[0]).toBe(true);
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(11); // (2+3)*2+1 = 11
  });

  it('should propagate error if any function in the chain throws', async () => {
    const chain = () => {
      const a = 1;
      if (a === 1) throw new Error('chain fail');
      return a;
    };
    const result = tryFn(chain);
    expect(result[0]).toBe(false);
    expect(result[1]).toBeInstanceOf(Error);
    expect(result[1].message).toBe('chain fail');
    expect(result[2]).toBeUndefined();
  });

  it('should propagate error if any promise in the chain rejects', async () => {
    const chain = () => Promise.resolve(1).then(() => { throw new Error('promise fail'); });
    const result = await tryFn(chain);
    expect(result[0]).toBe(false);
    expect(result[1]).toBeInstanceOf(Error);
    expect(result[1].message).toBe('promise fail');
    expect(result[2]).toBeUndefined();
  });

  // New tests to cover missing lines related to error stack handling
  it('should handle error without stack property in sync function', () => {
    const customError = { message: 'custom error', name: 'CustomError' };
    Object.preventExtensions(customError); // Make it non-extensible
    
    const [ok, err, data] = tryFn(() => { throw customError; });
    expect(ok).toBe(false);
    expect(err).toBe(customError);
    expect(data).toBeUndefined();
  });

  it('should handle error without stack property in async function', async () => {
    const customError = { message: 'custom async error', name: 'CustomAsyncError' };
    Object.preventExtensions(customError); // Make it non-extensible
    
    const result = await tryFn(() => Promise.reject(customError));
    expect(result[0]).toBe(false);
    expect(result[1]).toBe(customError);
    expect(result[2]).toBeUndefined();
  });

  it('should handle error with non-writable stack property', () => {
    const errorWithReadOnlyStack = new Error('readonly stack');
    Object.defineProperty(errorWithReadOnlyStack, 'stack', {
      value: 'original stack',
      writable: false,
      configurable: true
    });
    
    const [ok, err, data] = tryFn(() => { throw errorWithReadOnlyStack; });
    expect(ok).toBe(false);
    expect(err).toBe(errorWithReadOnlyStack);
    expect(data).toBeUndefined();
  });

  it('should handle error with non-configurable stack property', () => {
    const errorWithNonConfigurableStack = new Error('non-configurable stack');
    Object.defineProperty(errorWithNonConfigurableStack, 'stack', {
      value: 'original stack',
      writable: true,
      configurable: false
    });
    
    const [ok, err, data] = tryFn(() => { throw errorWithNonConfigurableStack; });
    expect(ok).toBe(false);
    expect(err).toBe(errorWithNonConfigurableStack);
    expect(data).toBeUndefined();
  });

  it('should handle error that throws when setting stack property', () => {
    const errorWithStackSetter = new Error('stack setter error');
    Object.defineProperty(errorWithStackSetter, 'stack', {
      get() { return 'original stack'; },
      set() { throw new Error('Cannot set stack'); },
      configurable: true
    });
    
    const [ok, err, data] = tryFn(() => { throw errorWithStackSetter; });
    expect(ok).toBe(false);
    expect(err).toBe(errorWithStackSetter);
    expect(data).toBeUndefined();
  });

  it('should handle non-Error objects being thrown', () => {
    const stringError = 'This is a string error';
    const [ok, err, data] = tryFn(() => { throw stringError; });
    expect(ok).toBe(false);
    expect(err).toBe(stringError);
    expect(data).toBeUndefined();
  });

  it('should handle error without hasOwnProperty method', () => {
    const errorWithoutHasOwnProperty = Object.create(null);
    errorWithoutHasOwnProperty.message = 'error without hasOwnProperty';
    errorWithoutHasOwnProperty.stack = 'original stack';
    
    const [ok, err, data] = tryFn(() => { throw errorWithoutHasOwnProperty; });
    expect(ok).toBe(false);
    expect(err).toBe(errorWithoutHasOwnProperty);
    expect(data).toBeUndefined();
  });
}); 