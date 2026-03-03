/** Result tuple type for tryFn */
export type TryResult<T> = [ok: true, err: null, data: T] | [ok: false, err: Error, data: undefined];

/** Promise-like object */
interface PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

/** Input type for tryFn */
type TryInput<T> = (() => T | PromiseLike<T>) | PromiseLike<T> | T;

type CapturedError = Error & { capturedAtStack?: string };

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function attachCapturedStack(error: Error): Error {
  const err = error as CapturedError;
  if (!Object.isExtensible(err)) {
    return err;
  }

  if (typeof err.capturedAtStack !== 'string') {
    try {
      Object.defineProperty(err, 'capturedAtStack', {
        value: new Error().stack,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // Ignore
    }
  }

  return err;
}

/**
 * tryFn - A robust error handling utility for JavaScript functions and values.
 *
 * This utility provides a consistent way to handle errors and return values across different types:
 * - Synchronous functions
 * - Asynchronous functions (Promises)
 * - Direct values
 * - Promises
 * - null/undefined values
 */
export function tryFn<T>(fnOrPromise: null | undefined): TryResult<T>;
export function tryFn<T>(fnOrPromise: () => Promise<T>): Promise<TryResult<Awaited<T>>>;
export function tryFn<T>(fnOrPromise: Promise<T>): Promise<TryResult<Awaited<T>>>;
export function tryFn<T>(fnOrPromise: () => T): TryResult<T>;
export function tryFn<T>(fnOrPromise: T): TryResult<T>;
export function tryFn<T>(fnOrPromise: TryInput<T>): TryResult<T> | Promise<TryResult<T>> {
  if (fnOrPromise == null) {
    return [false, new Error('fnOrPromise cannot be null or undefined'), undefined];
  }

  if (typeof fnOrPromise === 'function') {
    try {
      const result = (fnOrPromise as () => T | PromiseLike<T>)();

      if (result == null) {
        return [true, null, result as T];
      }

      if (typeof (result as PromiseLike<T>).then === 'function') {
        return (result as Promise<T>)
          .then((data): TryResult<T> => [true, null, data])
          .catch((error: unknown): TryResult<T> => {
            return [false, attachCapturedStack(normalizeError(error)), undefined];
          });
      }

      return [true, null, result as T];
    } catch (error: unknown) {
      return [false, attachCapturedStack(normalizeError(error)), undefined];
    }
  }

  if (typeof (fnOrPromise as PromiseLike<T>).then === 'function') {
    return Promise.resolve(fnOrPromise as Promise<T>)
      .then((data): TryResult<T> => [true, null, data])
      .catch((error: unknown): TryResult<T> => {
        return [false, attachCapturedStack(normalizeError(error)), undefined];
      });
  }

  return [true, null, fnOrPromise as T];
}

/**
 * Synchronous version of tryFn for cases where you know the function is synchronous
 */
export function tryFnSync<T>(fn: () => T): TryResult<T> {
  try {
    const result = fn();
    return [true, null, result];
  } catch (err: unknown) {
    return [false, err instanceof Error ? err : new Error(String(err)), undefined];
  }
}

export default tryFn;
