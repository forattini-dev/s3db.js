import { BaseCloudDriver } from './drivers/base-driver.js';
import { AwsInventoryDriver } from './drivers/aws-driver.js';
import { GcpInventoryDriver } from './drivers/gcp-driver.js';
import { VultrInventoryDriver } from './drivers/vultr-driver.js';
import { DigitalOceanInventoryDriver } from './drivers/digitalocean-driver.js';
import { OracleInventoryDriver } from './drivers/oracle-driver.js';
import { AzureInventoryDriver } from './drivers/azure-driver.js';
import { LinodeInventoryDriver } from './drivers/linode-driver.js';
import { HetznerInventoryDriver } from './drivers/hetzner-driver.js';
import { AlibabaInventoryDriver } from './drivers/alibaba-driver.js';
import { CloudflareInventoryDriver } from './drivers/cloudflare-driver.js';
import { MongoDBAtlasInventoryDriver } from './drivers/mongodb-atlas-driver.js';
import { PluginError } from '../../errors.js';
const CLOUD_DRIVERS = new Map();

/**
 * Register a cloud inventory driver.
 * @param {string} name
 * @param {Function} factory - (options) => BaseCloudDriver instance
 */
export function registerCloudDriver(name, factory) {
  if (!name || typeof name !== 'string') {
    throw new PluginError('registerCloudDriver: name must be a non-empty string', {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:register',
      statusCode: 400,
      retriable: false,
      suggestion: 'Call registerCloudDriver with a string identifier, e.g. registerCloudDriver("aws", factory).'
    });
  }

  if (typeof factory !== 'function') {
    throw new PluginError(`registerCloudDriver("${name}") expects a factory function`, {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:register',
      statusCode: 400,
      retriable: false,
      suggestion: 'Pass a factory function that returns an instance of BaseCloudDriver.'
    });
  }

  CLOUD_DRIVERS.set(name, factory);
}

/**
 * Instantiate a driver using the registry.
 * @param {string} name
 * @param {Object} options
 * @returns {BaseCloudDriver}
 */
export function createCloudDriver(name, options) {
  if (!CLOUD_DRIVERS.has(name)) {
    throw new PluginError(`Cloud driver "${name}" is not registered.`, {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:create',
      statusCode: 400,
      retriable: false,
      suggestion: `Register the driver via registerCloudDriver before creating it. Registered drivers: ${[...CLOUD_DRIVERS.keys()].join(', ') || 'none'}`
    });
  }

  const driver = CLOUD_DRIVERS.get(name)(options);
  if (!(driver instanceof BaseCloudDriver)) {
    throw new PluginError(`Driver "${name}" factory must return an instance of BaseCloudDriver`, {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:create',
      statusCode: 500,
      retriable: false,
      suggestion: 'Ensure the factory returns a class extending BaseCloudDriver.'
    });
  }
  return driver;
}

/**
 * List registered driver names.
 * @returns {string[]}
 */
export function listCloudDrivers() {
  return [...CLOUD_DRIVERS.keys()];
}

/**
 * Utility for validating a cloud definition.
 * Ensures driver exists and required fields are present.
 * @param {Object} cloud
 */
export function validateCloudDefinition(cloud) {
  if (!cloud || typeof cloud !== 'object') {
    throw new PluginError('Each cloud configuration must be an object', {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:validateDefinition',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide cloud definitions as objects (e.g. { driver: "aws", credentials: {...} }).'
    });
  }

  const { driver, credentials } = cloud;
  if (!driver || typeof driver !== 'string') {
    throw new PluginError('Cloud configuration requires a "driver" string', {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:validateDefinition',
      statusCode: 400,
      retriable: false,
      suggestion: 'Set the driver field to a registered driver name.'
    });
  }

  if (!CLOUD_DRIVERS.has(driver)) {
    throw new PluginError(`Cloud driver "${driver}" is not registered`, {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:validateDefinition',
      statusCode: 400,
      retriable: false,
      suggestion: 'Register the driver via registerCloudDriver before referencing it in configuration.'
    });
  }

  if (!credentials || typeof credentials !== 'object') {
    throw new PluginError(`Cloud "${driver}" requires a credentials object`, {
      pluginName: 'CloudInventoryPlugin',
      operation: 'registry:validateDefinition',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide credentials for each cloud entry (e.g. credentials: { token: "..." }).'
    });
  }
}

// Register a no-op driver as a placeholder implementation.
registerCloudDriver('noop', (options = {}) => {
  class NoopDriver extends BaseCloudDriver {
    async listResources() {
      const { sampleResources = [] } = options.config || {};
      return Array.isArray(sampleResources) ? sampleResources : [];
    }
  }
  return new NoopDriver({
    ...options,
    driver: options.driver || 'noop'
  });
});

registerCloudDriver('aws', (options = {}) => new AwsInventoryDriver(options));
registerCloudDriver('gcp', (options = {}) => new GcpInventoryDriver(options));
registerCloudDriver('vultr', (options = {}) => new VultrInventoryDriver(options));
registerCloudDriver('digitalocean', (options = {}) => new DigitalOceanInventoryDriver(options));
registerCloudDriver('do', (options = {}) => new DigitalOceanInventoryDriver(options));
registerCloudDriver('oracle', (options = {}) => new OracleInventoryDriver(options));
registerCloudDriver('oci', (options = {}) => new OracleInventoryDriver(options));
registerCloudDriver('azure', (options = {}) => new AzureInventoryDriver(options));
registerCloudDriver('az', (options = {}) => new AzureInventoryDriver(options));
registerCloudDriver('linode', (options = {}) => new LinodeInventoryDriver(options));
registerCloudDriver('hetzner', (options = {}) => new HetznerInventoryDriver(options));
registerCloudDriver('alibaba', (options = {}) => new AlibabaInventoryDriver(options));
registerCloudDriver('aliyun', (options = {}) => new AlibabaInventoryDriver(options));
registerCloudDriver('cloudflare', (options = {}) => new CloudflareInventoryDriver(options));
registerCloudDriver('cf', (options = {}) => new CloudflareInventoryDriver(options));
registerCloudDriver('mongodb-atlas', (options = {}) => new MongoDBAtlasInventoryDriver(options));
registerCloudDriver('atlas', (options = {}) => new MongoDBAtlasInventoryDriver(options));

export { BaseCloudDriver } from './drivers/base-driver.js';
