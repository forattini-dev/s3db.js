export { BaseCloudDriver, type CloudResource, type BaseCloudDriverOptions } from './base-driver.js';

export { AwsInventoryDriver } from './aws-driver.js';
export { AzureInventoryDriver } from './azure-driver.js';
export { GcpInventoryDriver } from './gcp-driver.js';
export { DigitalOceanInventoryDriver } from './digitalocean-driver.js';
export { VultrInventoryDriver } from './vultr-driver.js';
export { LinodeInventoryDriver } from './linode-driver.js';
export { HetznerInventoryDriver } from './hetzner-driver.js';
export { CloudflareInventoryDriver } from './cloudflare-driver.js';
export { OracleInventoryDriver } from './oracle-driver.js';
export { AlibabaInventoryDriver } from './alibaba-driver.js';
export { MongoDBAtlasInventoryDriver } from './mongodb-atlas-driver.js';

export type CloudProviderName =
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'digitalocean'
  | 'vultr'
  | 'linode'
  | 'hetzner'
  | 'cloudflare'
  | 'oracle'
  | 'alibaba'
  | 'mongodb-atlas';

export const DRIVER_MAP = {
  aws: () => import('./aws-driver.js').then(m => m.AwsInventoryDriver),
  azure: () => import('./azure-driver.js').then(m => m.AzureInventoryDriver),
  gcp: () => import('./gcp-driver.js').then(m => m.GcpInventoryDriver),
  digitalocean: () => import('./digitalocean-driver.js').then(m => m.DigitalOceanInventoryDriver),
  vultr: () => import('./vultr-driver.js').then(m => m.VultrInventoryDriver),
  linode: () => import('./linode-driver.js').then(m => m.LinodeInventoryDriver),
  hetzner: () => import('./hetzner-driver.js').then(m => m.HetznerInventoryDriver),
  cloudflare: () => import('./cloudflare-driver.js').then(m => m.CloudflareInventoryDriver),
  oracle: () => import('./oracle-driver.js').then(m => m.OracleInventoryDriver),
  alibaba: () => import('./alibaba-driver.js').then(m => m.AlibabaInventoryDriver),
  'mongodb-atlas': () => import('./mongodb-atlas-driver.js').then(m => m.MongoDBAtlasInventoryDriver)
} as const;

export async function getDriver(provider: CloudProviderName): Promise<new (options: import('./base-driver.js').BaseCloudDriverOptions) => import('./base-driver.js').BaseCloudDriver> {
  const loader = DRIVER_MAP[provider];
  if (!loader) {
    throw new Error(`Unknown cloud provider: ${provider}`);
  }
  return loader();
}

export function getSupportedProviders(): CloudProviderName[] {
  return Object.keys(DRIVER_MAP) as CloudProviderName[];
}
