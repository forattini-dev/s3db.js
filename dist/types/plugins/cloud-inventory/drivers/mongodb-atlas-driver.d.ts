import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
interface HttpClient {
    get(endpoint: string): Promise<Response>;
    post(endpoint: string, options?: {
        body?: string;
    }): Promise<Response>;
    put(endpoint: string, options?: {
        body?: string;
    }): Promise<Response>;
    delete(endpoint: string): Promise<Response>;
}
interface AtlasProject {
    id: string;
    name?: string;
    orgId?: string;
    clusterCount?: number;
}
export declare class MongoDBAtlasInventoryDriver extends BaseCloudDriver {
    private _publicKey;
    private _privateKey;
    private _baseUrl;
    private _organizationId;
    private _httpClient;
    private _services;
    private _projectIds;
    constructor(options?: BaseCloudDriverOptions);
    _initializeCredentials(): Promise<void>;
    _getHttpClient(): Promise<HttpClient>;
    _makeRequest(endpoint: string, options?: {
        method?: string;
        body?: unknown;
    }): Promise<unknown>;
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    _getProjects(): Promise<AtlasProject[]>;
    _collectProjects(): AsyncGenerator<CloudResource>;
    _collectClusters(): AsyncGenerator<CloudResource>;
    _collectServerless(): AsyncGenerator<CloudResource>;
    _collectUsers(): AsyncGenerator<CloudResource>;
    _collectAccessLists(): AsyncGenerator<CloudResource>;
    _collectBackups(): AsyncGenerator<CloudResource>;
    _collectAlerts(): AsyncGenerator<CloudResource>;
    _collectDataLakes(): AsyncGenerator<CloudResource>;
    _collectSearchIndexes(): AsyncGenerator<CloudResource>;
    _collectCustomRoles(): AsyncGenerator<CloudResource>;
    _collectEvents(): AsyncGenerator<CloudResource>;
    _sanitize(config: unknown): Record<string, unknown>;
}
export {};
//# sourceMappingURL=mongodb-atlas-driver.d.ts.map