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
import {
  AwsMockDriver,
  GcpMockDriver,
  DigitalOceanMockDriver,
  OracleMockDriver,
  AzureMockDriver,
  VultrMockDriver,
  LinodeMockDriver,
  HetznerMockDriver,
  AlibabaMockDriver,
  CloudflareMockDriver,
  MongoDBAtlasMockDriver
} from './drivers/mock-drivers.js';

const CLOUD_DRIVERS = new Map();

/**
 * Register a cloud inventory driver.
 * @param {string} name
 * @param {Function} factory - (options) => BaseCloudDriver instance
 */
export function registerCloudDriver(name, factory) {
  if (!name || typeof name !== 'string') {
    throw new Error('registerCloudDriver: name must be a non-empty string');
  }

  if (typeof factory !== 'function') {
    throw new Error(`registerCloudDriver("${name}") expects a factory function`);
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
    throw new Error(`Cloud driver "${name}" is not registered. Registered drivers: ${[...CLOUD_DRIVERS.keys()].join(', ') || 'none'}`);
  }

  const driver = CLOUD_DRIVERS.get(name)(options);
  if (!(driver instanceof BaseCloudDriver)) {
    throw new Error(`Driver "${name}" factory must return an instance of BaseCloudDriver`);
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
    throw new Error('Each cloud configuration must be an object');
  }

  const { driver, credentials } = cloud;
  if (!driver || typeof driver !== 'string') {
    throw new Error('Cloud configuration requires a "driver" string');
  }

  if (!CLOUD_DRIVERS.has(driver)) {
    throw new Error(`Cloud driver "${driver}" is not registered`);
  }

  if (!credentials || typeof credentials !== 'object') {
    throw new Error(`Cloud "${driver}" requires a credentials object`);
  }
}

// Register a no-op driver as a placeholder / mock implementation.
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

function registerMockDriver(names, DriverClass) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    registerCloudDriver(name, (options = {}) => new DriverClass(options));
  }
}

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
registerMockDriver('aws-mock', AwsMockDriver);
registerMockDriver('gcp-mock', GcpMockDriver);
registerMockDriver('vultr-mock', VultrMockDriver);
registerMockDriver(['digitalocean-mock', 'do-mock'], DigitalOceanMockDriver);
registerMockDriver(['oracle-mock', 'oci-mock'], OracleMockDriver);
registerMockDriver(['azure-mock', 'az-mock'], AzureMockDriver);
registerMockDriver('linode-mock', LinodeMockDriver);
registerMockDriver('hetzner-mock', HetznerMockDriver);
registerMockDriver(['alibaba-mock', 'aliyun-mock'], AlibabaMockDriver);
registerMockDriver(['cloudflare-mock', 'cf-mock'], CloudflareMockDriver);
registerMockDriver(['mongodb-atlas-mock', 'atlas-mock'], MongoDBAtlasMockDriver);

export { BaseCloudDriver } from './drivers/base-driver.js';
