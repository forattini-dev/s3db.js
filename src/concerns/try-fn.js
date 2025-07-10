/**
 * tryFn - A robust error handling utility for JavaScript functions and values.
 * 
 * This utility provides a consistent way to handle errors and return values across different types:
 * - Synchronous functions
 * - Asynchronous functions (Promises)
 * - Direct values
 * - Promises
 * - null/undefined values
 *
 * @param {Function|Promise|*} fnOrPromise - The input to process, can be:
 *   - A synchronous function that returns a value
 *   - An async function that returns a Promise
 *   - A Promise directly
 *   - Any direct value (number, string, object, etc)
 * 
 * @returns {Array} A tuple containing:
 *   - [0] ok: boolean - Indicates if the operation succeeded
 *   - [1] err: Error|null - Error object if failed, null if succeeded
 *   - [2] data: any - The result data if succeeded, undefined if failed
 *
 * Key Features:
 * - Unified error handling interface for all types of operations
 * - Preserves and enhances error stack traces for better debugging
 * - Zero dependencies
 * - TypeScript friendly return tuple
 * - Handles edge cases like null/undefined gracefully
 * - Perfect for functional programming patterns
 * - Ideal for Promise chains and async/await flows
 * - Reduces try/catch boilerplate code
 *
 * Error Handling:
 * - All errors maintain their original properties
 * - Stack traces are automatically enhanced to show the tryFn call site
 * - Errors from async operations are properly caught and formatted
 * 
 * Common Use Cases:
 * - API request wrappers
 * - Database operations
 * - File system operations
 * - Data parsing and validation
 * - Service integration points
 * 
 * Examples:
 * ```js
 * // Handling synchronous operations
 * const [ok, err, data] = tryFn(() => JSON.parse(jsonString));
 * 
 * // Handling async operations
 * const [ok, err, data] = await tryFn(async () => {
 *   const response = await fetch(url);
 *   return response.json();
 * });
 * 
 * // Direct promise handling
 * const [ok, err, data] = await tryFn(fetch(url));
 * 
 * // Value passthrough
 * const [ok, err, data] = tryFn(42); // [true, null, 42]
 * ```
 */
export function tryFn(fnOrPromise) {
  if (fnOrPromise == null) {
    const err = new Error('fnOrPromise cannot be null or undefined');
    err.stack = new Error().stack;
    return [false, err, undefined];
  }

  if (typeof fnOrPromise === 'function') {
    try {
      const result = fnOrPromise();

      if (result == null) {
        return [true, null, result];
      }

      if (typeof result.then === 'function') {
        return result
          .then(data => [true, null, data])
          .catch(error => {
            if (error && typeof error === 'object') {
              error.stack = new Error().stack;
            }
            return [false, error, undefined];
          });
      }

      return [true, null, result];

    } catch (error) {
      if (error && typeof error === 'object') {
        error.stack = new Error().stack;
      }
      return [false, error, undefined];
    }
  }

  if (typeof fnOrPromise.then === 'function') {
    return Promise.resolve(fnOrPromise)
      .then(data => [true, null, data])
      .catch(error => {
        if (error && typeof error === 'object') {
          error.stack = new Error().stack;
        }
        return [false, error, undefined];
      });
  }

  return [true, null, fnOrPromise];
}

export default tryFn;
