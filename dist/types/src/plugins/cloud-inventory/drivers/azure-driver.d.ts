import { BaseCloudDriver, CloudResource, ListResourcesOptions } from './base-driver.js';
interface AzureDriverOptions {
    driver?: string;
    credentials?: {
        clientId?: string;
        clientSecret?: string;
        tenantId?: string;
        subscriptionId?: string;
    };
    config?: {
        accountId?: string;
        subscriptionId?: string;
        services?: string[];
        resourceGroups?: string[] | null;
    };
}
/**
 * Production-ready Microsoft Azure inventory driver using official @azure SDK.
 *
 * Covers 15+ services with 25+ resource types:
 * - Compute (VMs, VM scale sets, availability sets)
 * - Kubernetes (AKS clusters, node pools)
 * - Storage (storage accounts, disks, snapshots)
 * - Databases (SQL databases, Cosmos DB accounts)
 * - Networking (VNets, subnets, load balancers, public IPs, NSGs, app gateways)
 * - Container Registry (ACR)
 * - DNS (zones, record sets)
 * - Identity (managed identities)
 *
 * @see https://github.com/Azure/azure-sdk-for-js
 * @see https://learn.microsoft.com/en-us/javascript/api/overview/azure/
 */
export declare class AzureInventoryDriver extends BaseCloudDriver {
    private _credential;
    private _subscriptionId;
    private _accountId;
    private _services;
    private _resourceGroups;
    constructor(options?: AzureDriverOptions);
    /**
     * Initialize Azure credential and subscription.
     */
    _initializeCredential(): Promise<void>;
    /**
     * Main entry point - lists all resources from configured services.
     */
    listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource>;
    /**
     * Collect Compute resources (VMs, VM scale sets).
     */
    _collectCompute(): AsyncGenerator<CloudResource>;
    /**
     * Collect Kubernetes (AKS) clusters.
     */
    _collectKubernetes(): AsyncGenerator<CloudResource>;
    /**
     * Collect Storage Accounts.
     */
    _collectStorage(): AsyncGenerator<CloudResource>;
    /**
     * Collect Disks and Snapshots.
     */
    _collectDisks(): AsyncGenerator<CloudResource>;
    /**
     * Collect SQL Databases.
     */
    _collectDatabases(): AsyncGenerator<CloudResource>;
    /**
     * Collect Cosmos DB accounts.
     */
    _collectCosmosDB(): AsyncGenerator<CloudResource>;
    /**
     * Collect Network resources (VNets, Subnets, Load Balancers, Public IPs).
     */
    _collectNetwork(): AsyncGenerator<CloudResource>;
    /**
     * Collect Container Registry.
     */
    _collectContainerRegistry(): AsyncGenerator<CloudResource>;
    /**
     * Collect DNS zones.
     */
    _collectDNS(): AsyncGenerator<CloudResource>;
    /**
     * Collect Managed Identities.
     */
    _collectIdentity(): AsyncGenerator<CloudResource>;
    /**
     * Extract resource group name from Azure resource ID.
     */
    _extractResourceGroup(resourceId: string | undefined): string | null;
    /**
     * Sanitize configuration by removing sensitive data.
     */
    _sanitize(config: Record<string, unknown> | null | undefined): Record<string, unknown>;
}
export {};
//# sourceMappingURL=azure-driver.d.ts.map