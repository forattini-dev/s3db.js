import { sleep } from '../config.js';

/**
 * Polls the provided async function until it returns a truthy value or the timeout is reached.
 * Returns the first truthy result so callers can reuse fetched data.
 */
export async function waitFor(conditionFn, { timeout = 2000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await conditionFn();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(interval);
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`waitFor: condition not met within ${timeout}ms`);
}
