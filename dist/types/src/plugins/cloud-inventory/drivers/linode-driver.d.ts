import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
export declare class LinodeInventoryDriver extends BaseCloudDriver {
    private _apiToken;
    private _accountId;
    private _services;
    private _regions;
    constructor(options?: BaseCloudDriverOptions);
    _initializeClient(): Promise<void>;
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    _collectLinodes(): AsyncGenerator<CloudResource>;
    _collectKubernetes(): AsyncGenerator<CloudResource>;
    _collectVolumes(): AsyncGenerator<CloudResource>;
    _collectNodeBalancers(): AsyncGenerator<CloudResource>;
    _collectFirewalls(): AsyncGenerator<CloudResource>;
    _collectVLANs(): AsyncGenerator<CloudResource>;
    _collectDomains(): AsyncGenerator<CloudResource>;
    _collectImages(): AsyncGenerator<CloudResource>;
    _collectObjectStorage(): AsyncGenerator<CloudResource>;
    _collectDatabases(): AsyncGenerator<CloudResource>;
    _collectStackScripts(): AsyncGenerator<CloudResource>;
    _collectPlacementGroups(): AsyncGenerator<CloudResource>;
    _sanitize(config: unknown): Record<string, unknown>;
}
//# sourceMappingURL=linode-driver.d.ts.map