import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
interface RPCClient {
    request(action: string, params: Record<string, unknown>, options: {
        method: string;
    }): Promise<Record<string, unknown>>;
}
export declare class AlibabaInventoryDriver extends BaseCloudDriver {
    private _accessKeyId;
    private _accessKeySecret;
    private _accountId;
    private _services;
    private _regions;
    constructor(options?: BaseCloudDriverOptions);
    _initializeCredentials(): Promise<void>;
    _createRPCClient(endpoint: string, apiVersion: string): Promise<RPCClient>;
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    _collectECS(): AsyncGenerator<CloudResource>;
    _collectACK(): AsyncGenerator<CloudResource>;
    _collectOSS(): AsyncGenerator<CloudResource>;
    _collectRDS(): AsyncGenerator<CloudResource>;
    _collectRedis(): AsyncGenerator<CloudResource>;
    _collectVPC(): AsyncGenerator<CloudResource>;
    _collectSLB(): AsyncGenerator<CloudResource>;
    _collectEIP(): AsyncGenerator<CloudResource>;
    _collectCDN(): AsyncGenerator<CloudResource>;
    _collectDNS(): AsyncGenerator<CloudResource>;
    _collectSecurityGroups(): AsyncGenerator<CloudResource>;
    _collectSnapshots(): AsyncGenerator<CloudResource>;
    _collectAutoScaling(): AsyncGenerator<CloudResource>;
    _collectNATGateway(): AsyncGenerator<CloudResource>;
    _collectACR(): AsyncGenerator<CloudResource>;
    _extractTags(tags?: Array<{
        TagKey: string;
        TagValue?: string;
    }>): Record<string, string>;
    _sanitize(config: unknown): Record<string, unknown>;
}
export {};
//# sourceMappingURL=alibaba-driver.d.ts.map