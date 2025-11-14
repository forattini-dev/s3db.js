/**
 * Map over an array with controlled concurrency
 * Similar to PromisePool but without external dependency
 *
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to apply to each item
 * @param {Object} options - Options
 * @param {number} options.concurrency - Max concurrent operations (default: 10)
 * @param {Function} options.onError - Error handler (optional)
 * @returns {Promise<{results: Array, errors: Array}>}
 *
 * @example
 * const { results, errors } = await mapWithConcurrency(
 *   items,
 *   async (item) => await process(item),
 *   { concurrency: 5 }
 * );
 */
export async function mapWithConcurrency(items, fn, options = {}) {
  const {
    concurrency = 10,
    onError = null
  } = options;

  const results = [];
  const errors = [];
  const executing = new Set();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Create promise for this item
    const promise = (async () => {
      try {
        const result = await fn(item, i);
        results.push(result);
        return result;
      } catch (error) {
        if (onError) {
          await onError(error, item);
        }
        errors.push({ item, index: i, message: error.message, raw: error });
        return null;
      }
    })();

    // Add to executing set
    executing.add(promise);

    // When promise completes, remove from executing set
    promise.finally(() => executing.delete(promise));

    // If we hit concurrency limit, wait for one to finish
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  // Wait for all remaining promises to complete
  await Promise.all(executing);

  return { results, errors };
}

/**
 * For Each with controlled concurrency
 * Similar to mapWithConcurrency but doesn't collect results
 *
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to apply to each item
 * @param {Object} options - Options
 * @param {number} options.concurrency - Max concurrent operations (default: 10)
 * @param {Function} options.onError - Error handler (optional)
 * @returns {Promise<{errors: Array}>}
 */
export async function forEachWithConcurrency(items, fn, options = {}) {
  const {
    concurrency = 10,
    onError = null
  } = options;

  const errors = [];
  const executing = new Set();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const promise = (async () => {
      try {
        await fn(item, i);
      } catch (error) {
        if (onError) {
          await onError(error, item);
        }
        errors.push({ item, index: i, message: error.message, raw: error });
      }
    })();

    executing.add(promise);
    promise.finally(() => executing.delete(promise));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);

  return { errors };
}

export default mapWithConcurrency;
