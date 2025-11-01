/**
 * BaseCloudDriver - abstract class for cloud inventory drivers
 *
 * Concrete drivers must implement at least:
 *  - async initialize(): Perform any lazy connections or credential checks
 *  - async listResources(options): Return an iterable of discovered resources
 *
 * A discovered resource should follow the shape:
 * {
 *   provider: 'aws' | 'gcp' | ...,
 *   accountId: string,
 *   subscriptionId?: string,
 *   organizationId?: string,
 *   projectId?: string,
 *   region?: string,
 *   service?: string,
 *   resourceType: string,
 *   resourceId: string,
 *   name?: string,
 *   tags?: Record<string,string>,
 *   labels?: Record<string,string>,
 *   attributes?: Record<string, unknown>,
 *   configuration: Record<string, unknown>,
 *   raw?: unknown
 * }
 *
 * The plugin normalizes the payload, computes configuration digests and
 * manages versioning/diffing.
 */
import { PluginError } from '../../../errors.js';

export class BaseCloudDriver {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique identifier for this cloud source
   * @param {string} options.driver - Driver name (aws, gcp, do, ...)
   * @param {Object} options.credentials - Authentication material
   * @param {Object} options.config - Driver specific configuration
   * @param {Object} options.globals - Global plugin options
   * @param {Function} options.logger - Optional logger fn (level, msg, meta)
   */
  constructor(options = {}) {
    const {
      id,
      driver,
      credentials = {},
      config = {},
      globals = {},
      logger = null
    } = options;

    if (!driver) {
      throw new PluginError('Cloud driver requires a "driver" identifier', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'cloudDriver:constructor',
        statusCode: 500,
        retriable: false,
        suggestion: 'Specify the driver key (e.g. "aws", "gcp") when instantiating a cloud inventory driver.'
      });
    }

    this.id = id || driver;
    this.driver = driver;
    this.credentials = credentials;
    this.config = config;
    this.globals = globals;
    this.logger = typeof logger === 'function'
      ? logger
      : () => {};
  }

  /**
   * Perform driver bootstrapping (auth warm-up, SDK clients, etc).
   * Default implementation is a no-op.
   */
  async initialize() {
    return;
  }

  /**
   * Fetch resources from the cloud API.
   * Must be implemented by subclasses.
   * @param {Object} options
   * @returns {Promise<Array<Object>|AsyncIterable<Object>>}
   */
  // eslint-disable-next-line no-unused-vars
  async listResources(options = {}) {
    throw new PluginError(`Driver "${this.driver}" does not implement listResources()`, {
      pluginName: 'CloudInventoryPlugin',
      operation: 'cloudDriver:listResources',
      statusCode: 500,
      retriable: false,
      suggestion: 'Implement listResources(options) in the concrete cloud driver to fetch inventory data.'
    });
  }

  /**
   * Optional health check hook.
   * @returns {Promise<{ok: boolean, details?: any}>}
   */
  async healthCheck() {
    return { ok: true };
  }

  /**
   * Graceful shutdown hook for long-lived SDK clients.
   */
  async destroy() {
    return;
  }
}

export default BaseCloudDriver;
