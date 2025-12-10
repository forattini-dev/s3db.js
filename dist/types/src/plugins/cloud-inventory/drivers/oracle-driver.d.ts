import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
interface OciRegion {
    regionName: string;
    region?: unknown;
}
export declare class OracleInventoryDriver extends BaseCloudDriver {
    private _provider;
    private _tenancyId;
    private _compartmentId;
    private _accountId;
    private _services;
    private _regions;
    constructor(options?: BaseCloudDriverOptions);
    _initializeProvider(): Promise<void>;
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    _collectCompute(): AsyncGenerator<CloudResource>;
    _collectKubernetes(): AsyncGenerator<CloudResource>;
    _collectDatabases(): AsyncGenerator<CloudResource>;
    _collectBlockStorage(): AsyncGenerator<CloudResource>;
    _collectObjectStorage(): AsyncGenerator<CloudResource>;
    _collectFileStorage(): AsyncGenerator<CloudResource>;
    _collectVCN(): AsyncGenerator<CloudResource>;
    _collectLoadBalancers(): AsyncGenerator<CloudResource>;
    _collectIdentity(): AsyncGenerator<CloudResource>;
    _collectDNS(): AsyncGenerator<CloudResource>;
    _getRegions(): Promise<OciRegion[]>;
    _extractTags(freeformTags?: Record<string, string>, definedTags?: Record<string, Record<string, string>>): Record<string, string>;
    _sanitize(config: unknown): Record<string, unknown>;
}
export {};
//# sourceMappingURL=oracle-driver.d.ts.map