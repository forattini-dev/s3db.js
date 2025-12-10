import { BaseCloudDriver, BaseCloudDriverOptions } from './drivers/base-driver.js';
export { registerCloudDriver, createCloudDriver, listCloudDrivers, validateCloudDefinition, BaseCloudDriver } from './registry.js';
export type { BaseCloudDriverOptions, CloudResource, ListResourcesOptions } from './drivers/base-driver.js';
type DriverClass = new (options: BaseCloudDriverOptions) => BaseCloudDriver;
export declare const loadCloudDriver: (provider: string) => Promise<DriverClass>;
export declare const loadAwsInventoryDriver: () => Promise<DriverClass>;
export declare const loadGcpInventoryDriver: () => Promise<DriverClass>;
export declare const loadAzureInventoryDriver: () => Promise<DriverClass>;
export declare const loadDigitalOceanInventoryDriver: () => Promise<DriverClass>;
export declare const loadOracleInventoryDriver: () => Promise<DriverClass>;
export declare const loadVultrInventoryDriver: () => Promise<DriverClass>;
export declare const loadLinodeInventoryDriver: () => Promise<DriverClass>;
export declare const loadHetznerInventoryDriver: () => Promise<DriverClass>;
export declare const loadAlibabaInventoryDriver: () => Promise<DriverClass>;
export declare const loadCloudflareInventoryDriver: () => Promise<DriverClass>;
export declare const loadMongoDBAtlasInventoryDriver: () => Promise<DriverClass>;
//# sourceMappingURL=index.d.ts.map