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
export type CloudProviderName = 'aws' | 'azure' | 'gcp' | 'digitalocean' | 'vultr' | 'linode' | 'hetzner' | 'cloudflare' | 'oracle' | 'alibaba' | 'mongodb-atlas';
export declare const DRIVER_MAP: {
    readonly aws: () => Promise<typeof import("./aws-driver.js").AwsInventoryDriver>;
    readonly azure: () => Promise<typeof import("./azure-driver.js").AzureInventoryDriver>;
    readonly gcp: () => Promise<typeof import("./gcp-driver.js").GcpInventoryDriver>;
    readonly digitalocean: () => Promise<typeof import("./digitalocean-driver.js").DigitalOceanInventoryDriver>;
    readonly vultr: () => Promise<typeof import("./vultr-driver.js").VultrInventoryDriver>;
    readonly linode: () => Promise<typeof import("./linode-driver.js").LinodeInventoryDriver>;
    readonly hetzner: () => Promise<typeof import("./hetzner-driver.js").HetznerInventoryDriver>;
    readonly cloudflare: () => Promise<typeof import("./cloudflare-driver.js").CloudflareInventoryDriver>;
    readonly oracle: () => Promise<typeof import("./oracle-driver.js").OracleInventoryDriver>;
    readonly alibaba: () => Promise<typeof import("./alibaba-driver.js").AlibabaInventoryDriver>;
    readonly 'mongodb-atlas': () => Promise<typeof import("./mongodb-atlas-driver.js").MongoDBAtlasInventoryDriver>;
};
export declare function getDriver(provider: CloudProviderName): Promise<new (options: import('./base-driver.js').BaseCloudDriverOptions) => import('./base-driver.js').BaseCloudDriver>;
export declare function getSupportedProviders(): CloudProviderName[];
//# sourceMappingURL=index.d.ts.map