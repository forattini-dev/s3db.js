/**
 * Cloud Inventory Drivers - Lazy Loading
 *
 * Each cloud provider driver is loaded on-demand to avoid loading
 * massive peer dependencies (AWS SDK, GCP SDKs, Azure SDKs, etc.)
 *
 * Usage:
 *   const AwsInventoryDriver = await loadAwsInventoryDriver();
 *   const driver = new AwsInventoryDriver({ region: 'us-east-1' });
 *
 * Or use createCloudDriver() for dynamic driver selection:
 *   const driver = await createCloudDriver('aws', { region: 'us-east-1' });
 */

// Core registry (no external dependencies)
export {
  registerCloudDriver,
  createCloudDriver,  // Now supports lazy loading
  listCloudDrivers,
  validateCloudDefinition,
  BaseCloudDriver
} from './registry.js';

/**
 * Lazy loader map for cloud inventory drivers
 */
const CLOUD_DRIVER_LOADERS = {
  aws: () => import('./drivers/aws-driver.js').then(m => m.AwsInventoryDriver),
  gcp: () => import('./drivers/gcp-driver.js').then(m => m.GcpInventoryDriver),
  azure: () => import('./drivers/azure-driver.js').then(m => m.AzureInventoryDriver),
  digitalocean: () => import('./drivers/digitalocean-driver.js').then(m => m.DigitalOceanInventoryDriver),
  oracle: () => import('./drivers/oracle-driver.js').then(m => m.OracleInventoryDriver),
  vultr: () => import('./drivers/vultr-driver.js').then(m => m.VultrInventoryDriver),
  linode: () => import('./drivers/linode-driver.js').then(m => m.LinodeInventoryDriver),
  hetzner: () => import('./drivers/hetzner-driver.js').then(m => m.HetznerInventoryDriver),
  alibaba: () => import('./drivers/alibaba-driver.js').then(m => m.AlibabaInventoryDriver),
  cloudflare: () => import('./drivers/cloudflare-driver.js').then(m => m.CloudflareInventoryDriver),
  mongodbatlas: () => import('./drivers/mongodb-atlas-driver.js').then(m => m.MongoDBAtlasInventoryDriver),
};

/**
 * Load a cloud inventory driver by name (lazy-loaded)
 * @param {string} provider - Provider name (aws, gcp, azure, etc.)
 * @returns {Promise<Class>} - Driver class
 */
export const loadCloudDriver = async (provider) => {
  const loader = CLOUD_DRIVER_LOADERS[provider.toLowerCase()];
  if (!loader) {
    throw new Error(
      `Unknown cloud provider: ${provider}.\n` +
      `Available providers: ${Object.keys(CLOUD_DRIVER_LOADERS).join(', ')}\n\n` +
      `Usage:\n` +
      `  const driver = await loadCloudDriver('${provider}');\n` +
      `  const instance = new driver({ /* config */ });`
    );
  }
  return await loader();
};

/**
 * Individual lazy loaders for better DX
 */
export const loadAwsInventoryDriver = () => loadCloudDriver('aws');
export const loadGcpInventoryDriver = () => loadCloudDriver('gcp');
export const loadAzureInventoryDriver = () => loadCloudDriver('azure');
export const loadDigitalOceanInventoryDriver = () => loadCloudDriver('digitalocean');
export const loadOracleInventoryDriver = () => loadCloudDriver('oracle');
export const loadVultrInventoryDriver = () => loadCloudDriver('vultr');
export const loadLinodeInventoryDriver = () => loadCloudDriver('linode');
export const loadHetznerInventoryDriver = () => loadCloudDriver('hetzner');
export const loadAlibabaInventoryDriver = () => loadCloudDriver('alibaba');
export const loadCloudflareInventoryDriver = () => loadCloudDriver('cloudflare');
export const loadMongoDBAtlasInventoryDriver = () => loadCloudDriver('mongodbatlas');
