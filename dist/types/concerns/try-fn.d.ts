/** Result tuple type for tryFn */
export type TryResult<T> = [ok: true, err: null, data: T] | [ok: false, err: Error, data: undefined];
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
export declare function tryFn<T>(fnOrPromise: null | undefined): TryResult<T>;
export declare function tryFn<T>(fnOrPromise: () => Promise<T>): Promise<TryResult<Awaited<T>>>;
export declare function tryFn<T>(fnOrPromise: Promise<T>): Promise<TryResult<Awaited<T>>>;
export declare function tryFn<T>(fnOrPromise: () => T): TryResult<T>;
export declare function tryFn<T>(fnOrPromise: T): TryResult<T>;
/**
 * Synchronous version of tryFn for cases where you know the function is synchronous
 */
export declare function tryFnSync<T>(fn: () => T): TryResult<T>;
export default tryFn;
//# sourceMappingURL=try-fn.d.ts.map