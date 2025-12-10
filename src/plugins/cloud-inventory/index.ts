import { BaseCloudDriver, BaseCloudDriverOptions } from './drivers/base-driver.js';

export {
  registerCloudDriver,
  createCloudDriver,
  listCloudDrivers,
  validateCloudDefinition,
  BaseCloudDriver
} from './registry.js';

export type { BaseCloudDriverOptions, CloudResource, ListResourcesOptions } from './drivers/base-driver.js';

type DriverClass = new (options: BaseCloudDriverOptions) => BaseCloudDriver;
type DriverLoader = () => Promise<DriverClass>;

const CLOUD_DRIVER_LOADERS: Record<string, DriverLoader> = {
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

export const loadCloudDriver = async (provider: string): Promise<DriverClass> => {
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

export const loadAwsInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('aws');
export const loadGcpInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('gcp');
export const loadAzureInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('azure');
export const loadDigitalOceanInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('digitalocean');
export const loadOracleInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('oracle');
export const loadVultrInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('vultr');
export const loadLinodeInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('linode');
export const loadHetznerInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('hetzner');
export const loadAlibabaInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('alibaba');
export const loadCloudflareInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('cloudflare');
export const loadMongoDBAtlasInventoryDriver = (): Promise<DriverClass> => loadCloudDriver('mongodbatlas');
