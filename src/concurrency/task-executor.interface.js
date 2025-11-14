/**
 * TaskExecutor Interface
 *
 * Unified interface for task execution and concurrency management.
 * Both OperationsPool and TaskManager implement this contract,
 * allowing them to be used interchangeably by clients.
 */

export class TaskExecutor {
  /**
   * Configure concurrency level
   * @param {number} concurrency - Max concurrent tasks
   */
  setConcurrency(concurrency) {
    throw new Error('setConcurrency() must be implemented');
  }

  /**
   * Get current concurrency setting
   * @returns {number} Current concurrency level
   */
  getConcurrency() {
    throw new Error('getConcurrency() must be implemented');
  }

  /**
   * Enqueue a single task for execution
   * @param {Function} fn - async function to execute
   * @param {Object} options - Task options (priority, retries, timeout, metadata)
   * @returns {Promise} Result of task execution
   */
  async enqueue(fn, options) {
    throw new Error('enqueue() must be implemented');
  }

  /**
   * Process an array of items through a processor function
   * @param {Array} items - Items to process
   * @param {Function} processor - async processor function
   * @param {Object} options - Processing options (callbacks, priority, retries, timeout)
   * @returns {Promise<{results, errors}>} Results and errors
   */
  async process(items, processor, options) {
    throw new Error('process() must be implemented');
  }

  /**
   * Pause execution of new tasks
   */
  pause() {
    throw new Error('pause() must be implemented');
  }

  /**
   * Resume execution of paused tasks
   */
  resume() {
    throw new Error('resume() must be implemented');
  }

  /**
   * Stop executor gracefully
   */
  async stop() {
    throw new Error('stop() must be implemented');
  }

  /**
   * Destroy executor completely
   */
  async destroy() {
    throw new Error('destroy() must be implemented');
  }

  /**
   * Get current executor stats
   * @returns {Object} Statistics (processed, errors, active, queued, etc)
   */
  getStats() {
    throw new Error('getStats() must be implemented');
  }
}
