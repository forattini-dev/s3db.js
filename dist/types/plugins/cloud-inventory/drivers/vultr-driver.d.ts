import { BaseCloudDriver, CloudResource, ListResourcesOptions } from './base-driver.js';
interface VultrDriverOptions {
    driver?: string;
    credentials?: {
        apiKey?: string;
        token?: string;
    };
    config?: {
        accountId?: string;
        services?: string[];
    };
}
/**
 * Production-ready Vultr inventory driver using official @vultr/vultr-node SDK.
 *
 * Covers 12+ services with 15+ resource types:
 * - Compute (instances, bare metal)
 * - Kubernetes (VKE clusters)
 * - Storage (block storage, snapshots, object storage)
 * - Networking (load balancers, firewalls, VPC)
 * - DNS (domains, records)
 * - Databases (managed databases)
 * - SSH Keys
 *
 * @see https://www.vultr.com/api/
 * @see https://github.com/vultr/vultr-node
 */
export declare class VultrInventoryDriver extends BaseCloudDriver {
    private _apiKey;
    private _client;
    private _accountId;
    private _services;
    constructor(options?: VultrDriverOptions);
    /**
     * Initialize the Vultr API client.
     */
    _initializeClient(): Promise<void>;
    /**
     * Main entry point - lists all resources from configured services.
     */
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    /**
     * Collect Compute Instances (VPS).
     */
    _collectInstances(): AsyncGenerator<CloudResource>;
    /**
     * Collect Bare Metal servers.
     */
    _collectBareMetal(): AsyncGenerator<CloudResource>;
    /**
     * Collect Kubernetes clusters (VKE).
     */
    _collectKubernetes(): AsyncGenerator<CloudResource>;
    /**
     * Collect Block Storage volumes.
     */
    _collectBlockStorage(): AsyncGenerator<CloudResource>;
    /**
     * Collect Snapshots.
     */
    _collectSnapshots(): AsyncGenerator<CloudResource>;
    /**
     * Collect Load Balancers.
     */
    _collectLoadBalancers(): AsyncGenerator<CloudResource>;
    /**
     * Collect Firewall Groups.
     */
    _collectFirewalls(): AsyncGenerator<CloudResource>;
    /**
     * Collect VPC/VPC 2.0 networks.
     */
    _collectVPC(): AsyncGenerator<CloudResource>;
    /**
     * Collect DNS domains and records.
     */
    _collectDNS(): AsyncGenerator<CloudResource>;
    /**
     * Collect Managed Databases.
     */
    _collectDatabases(): AsyncGenerator<CloudResource>;
    /**
     * Collect SSH Keys.
     */
    _collectSSHKeys(): AsyncGenerator<CloudResource>;
    /**
     * Collect Object Storage buckets.
     */
    _collectObjectStorage(): AsyncGenerator<CloudResource>;
    /**
     * Sanitize configuration by removing sensitive data.
     */
    _sanitize(config: Record<string, unknown> | null | undefined): Record<string, unknown>;
}
export {};
//# sourceMappingURL=vultr-driver.d.ts.map