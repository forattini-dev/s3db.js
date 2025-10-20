/**
 * Base Driver Class for TfState Plugin
 *
 * All tfstate drivers must extend this class and implement the required methods.
 */
export class TfStateDriver {
  constructor(config = {}) {
    this.config = config;
    this.selector = config.selector || '**/*.tfstate';
  }

  /**
   * Initialize the driver
   * Called during plugin installation
   */
  async initialize() {
    throw new Error('Driver must implement initialize()');
  }

  /**
   * List all state files matching the selector
   * @returns {Promise<Array>} Array of state file metadata { path, lastModified, size }
   */
  async listStateFiles() {
    throw new Error('Driver must implement listStateFiles()');
  }

  /**
   * Read a state file content
   * @param {string} path - Path to the state file
   * @returns {Promise<Object>} Parsed state file content
   */
  async readStateFile(path) {
    throw new Error('Driver must implement readStateFile()');
  }

  /**
   * Get state file metadata
   * @param {string} path - Path to the state file
   * @returns {Promise<Object>} Metadata { path, lastModified, size, etag }
   */
  async getStateFileMetadata(path) {
    throw new Error('Driver must implement getStateFileMetadata()');
  }

  /**
   * Check if a state file has been modified since last check
   * @param {string} path - Path to the state file
   * @param {Date} since - Check modifications since this date
   * @returns {Promise<boolean>} True if modified
   */
  async hasBeenModified(path, since) {
    const metadata = await this.getStateFileMetadata(path);
    return new Date(metadata.lastModified) > new Date(since);
  }

  /**
   * Match a path against the selector pattern
   * @param {string} path - Path to check
   * @returns {boolean} True if matches
   */
  matchesSelector(path) {
    const pattern = this.selector
      .replace(/\*\*/g, '__DOUBLE_STAR__')
      .replace(/\*/g, '[^/]*')
      .replace(/__DOUBLE_STAR__/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[([^\]]+)\]/g, '[$1]');

    const regex = new RegExp(`^${pattern}$`);
    return regex.test(path);
  }

  /**
   * Close/cleanup driver resources
   */
  async close() {
    // Optional cleanup, override if needed
  }
}
