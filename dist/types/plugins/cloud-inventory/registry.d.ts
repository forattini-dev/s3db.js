import { BaseCloudDriver, BaseCloudDriverOptions } from './drivers/base-driver.js';
type DriverFactory = (options: BaseCloudDriverOptions) => BaseCloudDriver;
export declare function registerCloudDriver(name: string, factory: DriverFactory): void;
export declare function createCloudDriver(name: string, options?: Partial<BaseCloudDriverOptions>): Promise<BaseCloudDriver>;
export declare function listCloudDrivers(): string[];
export declare function validateCloudDefinition(cloud: unknown): void;
export { BaseCloudDriver } from './drivers/base-driver.js';
//# sourceMappingURL=registry.d.ts.map