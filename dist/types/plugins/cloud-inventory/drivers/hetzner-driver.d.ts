import { BaseCloudDriver, CloudResource, ListResourcesOptions } from './base-driver.js';
interface HetznerDriverOptions {
    driver?: string;
    credentials?: {
        token?: string;
        apiToken?: string;
    };
    config?: {
        accountId?: string;
        services?: string[];
    };
}
/**
 * Production-ready Hetzner Cloud inventory driver using hcloud-js library.
 *
 * Covers 12+ services with 15+ resource types:
 * - Compute (servers/VPS, placement groups)
 * - Storage (volumes)
 * - Networking (networks, load balancers, firewalls, floating IPs, primary IPs)
 * - SSH Keys, Images, Certificates, ISOs
 *
 * @see https://docs.hetzner.cloud/
 * @see https://github.com/dennisbruner/hcloud-js
 */
export declare class HetznerInventoryDriver extends BaseCloudDriver {
    private _apiToken;
    private _client;
    private _accountId;
    private _services;
    constructor(options?: HetznerDriverOptions);
    /**
     * Initialize Hetzner Cloud API client.
     */
    _initializeClient(): Promise<void>;
    /**
     * Main entry point - lists all resources from configured services.
     */
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    /**
     * Collect Servers (VPS).
     */
    _collectServers(): AsyncGenerator<CloudResource>;
    /**
     * Collect Volumes (block storage).
     */
    _collectVolumes(): AsyncGenerator<CloudResource>;
    /**
     * Collect Networks (private networks/VPC).
     */
    _collectNetworks(): AsyncGenerator<CloudResource>;
    /**
     * Collect Load Balancers.
     */
    _collectLoadBalancers(): AsyncGenerator<CloudResource>;
    /**
     * Collect Firewalls.
     */
    _collectFirewalls(): AsyncGenerator<CloudResource>;
    /**
     * Collect Floating IPs.
     */
    _collectFloatingIPs(): AsyncGenerator<CloudResource>;
    /**
     * Collect SSH Keys.
     */
    _collectSSHKeys(): AsyncGenerator<CloudResource>;
    /**
     * Collect custom Images.
     */
    _collectImages(): AsyncGenerator<CloudResource>;
    /**
     * Collect SSL Certificates.
     */
    _collectCertificates(): AsyncGenerator<CloudResource>;
    /**
     * Collect Primary IPs (independent public IPs).
     */
    _collectPrimaryIPs(): AsyncGenerator<CloudResource>;
    /**
     * Collect Placement Groups (server anti-affinity).
     */
    _collectPlacementGroups(): AsyncGenerator<CloudResource>;
    /**
     * Collect ISOs (custom installation images).
     */
    _collectISOs(): AsyncGenerator<CloudResource>;
    /**
     * Extract labels from Hetzner labels object.
     */
    _extractLabels(labels: Record<string, string> | undefined | null): Record<string, string>;
    /**
     * Sanitize configuration by removing sensitive data.
     */
    _sanitize(config: Record<string, unknown> | null | undefined): Record<string, unknown>;
}
export {};
//# sourceMappingURL=hetzner-driver.d.ts.map