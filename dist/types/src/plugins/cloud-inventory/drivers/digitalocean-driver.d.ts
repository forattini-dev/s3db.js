import { BaseCloudDriver, CloudResource, ListResourcesOptions } from './base-driver.js';
interface DigitalOceanDriverOptions {
    driver?: string;
    credentials?: {
        token?: string;
        apiToken?: string;
    };
    config?: {
        accountId?: string;
        services?: string[];
        regions?: string[] | null;
    };
}
/**
 * Production-ready DigitalOcean inventory driver using digitalocean-js library.
 *
 * Covers 15+ services with 20+ resource types:
 * - Compute (droplets)
 * - Kubernetes (DOKS clusters)
 * - Databases (managed databases)
 * - Storage (volumes, snapshots, spaces)
 * - Networking (load balancers, firewalls, VPC, floating IPs)
 * - DNS (domains, records)
 * - CDN (endpoints)
 * - Container Registry
 * - App Platform
 * - SSH Keys
 *
 * @see https://docs.digitalocean.com/reference/api/
 * @see https://github.com/johnbwoodruff/digitalocean-js
 */
export declare class DigitalOceanInventoryDriver extends BaseCloudDriver {
    private _apiToken;
    private _client;
    private _accountId;
    private _services;
    private _regions;
    constructor(options?: DigitalOceanDriverOptions);
    /**
     * Initialize the DigitalOcean API client.
     */
    _initializeClient(): Promise<void>;
    /**
     * Main entry point - lists all resources from configured services.
     */
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    /**
     * Collect Droplets (VMs).
     */
    _collectDroplets(): AsyncGenerator<CloudResource>;
    /**
     * Collect Kubernetes clusters (DOKS).
     */
    _collectKubernetes(): AsyncGenerator<CloudResource>;
    /**
     * Collect Managed Databases.
     */
    _collectDatabases(): AsyncGenerator<CloudResource>;
    /**
     * Collect Block Storage Volumes.
     */
    _collectVolumes(): AsyncGenerator<CloudResource>;
    /**
     * Collect Snapshots.
     */
    _collectSnapshots(): AsyncGenerator<CloudResource>;
    /**
     * Collect Load Balancers.
     */
    _collectLoadBalancers(): AsyncGenerator<CloudResource>;
    /**
     * Collect Firewalls.
     */
    _collectFirewalls(): AsyncGenerator<CloudResource>;
    /**
     * Collect VPCs.
     */
    _collectVPC(): AsyncGenerator<CloudResource>;
    /**
     * Collect Floating IPs.
     */
    _collectFloatingIPs(): AsyncGenerator<CloudResource>;
    /**
     * Collect DNS Domains and Records.
     */
    _collectDomains(): AsyncGenerator<CloudResource>;
    /**
     * Collect CDN Endpoints.
     */
    _collectCDN(): AsyncGenerator<CloudResource>;
    /**
     * Collect Container Registry.
     */
    _collectRegistry(): AsyncGenerator<CloudResource>;
    /**
     * Collect App Platform apps.
     */
    _collectApps(): AsyncGenerator<CloudResource>;
    /**
     * Collect SSH Keys.
     */
    _collectSSHKeys(): AsyncGenerator<CloudResource>;
    /**
     * Collect Spaces (Object Storage).
     * Note: Spaces API is S3-compatible, not part of the main DO API.
     */
    _collectSpaces(): AsyncGenerator<CloudResource>;
    /**
     * Sanitize configuration by removing sensitive data.
     */
    _sanitize(config: Record<string, unknown> | null | undefined): Record<string, unknown>;
}
export {};
//# sourceMappingURL=digitalocean-driver.d.ts.map