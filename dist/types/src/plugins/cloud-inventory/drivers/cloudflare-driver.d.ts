import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
export declare class CloudflareInventoryDriver extends BaseCloudDriver {
    private _apiToken;
    private _accountId;
    private _client;
    private _services;
    constructor(options?: BaseCloudDriverOptions);
    _initializeClient(): Promise<void>;
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    _collectWorkers(): AsyncGenerator<CloudResource>;
    _collectR2(): AsyncGenerator<CloudResource>;
    _collectPages(): AsyncGenerator<CloudResource>;
    _collectD1(): AsyncGenerator<CloudResource>;
    _collectKV(): AsyncGenerator<CloudResource>;
    _collectDurableObjects(): AsyncGenerator<CloudResource>;
    _collectZones(): AsyncGenerator<CloudResource>;
    _collectLoadBalancers(): AsyncGenerator<CloudResource>;
    _collectCertificates(): AsyncGenerator<CloudResource>;
    _collectWAF(): AsyncGenerator<CloudResource>;
    _collectAccess(): AsyncGenerator<CloudResource>;
    _sanitize(config: unknown): Record<string, unknown>;
}
//# sourceMappingURL=cloudflare-driver.d.ts.map