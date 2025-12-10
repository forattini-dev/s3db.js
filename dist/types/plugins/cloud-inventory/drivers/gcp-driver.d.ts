import { BaseCloudDriver, CloudResource, ListResourcesOptions } from './base-driver.js';
interface GCPZone {
    name?: string;
    region?: string;
}
interface GCPDriverOptions {
    driver?: string;
    credentials?: {
        keyFile?: string;
        credentials?: Record<string, unknown>;
    };
    config?: {
        projectId?: string;
        services?: string[];
        regions?: string[];
        region?: string;
    };
}
interface ListResourcesWithDiscovery extends ListResourcesOptions {
    discovery?: {
        include?: string | string[];
        exclude?: string | string[];
    };
    runtime?: {
        emitProgress?: (data: {
            service: string;
            resourceId?: string;
            resourceType?: string;
        }) => void;
    };
}
/**
 * Production-ready GCP inventory driver using official Google Cloud client libraries.
 *
 * Covers 20+ services with many resource types:
 * - Compute (instances, zones)
 * - GKE (clusters)
 * - Cloud Run (services)
 * - Cloud Functions
 * - Storage (buckets)
 * - Cloud SQL (instances)
 * - BigQuery (datasets)
 * - Pub/Sub (topics, subscriptions)
 * - VPC (networks, subnets, firewalls)
 * - IAM (service accounts)
 * - KMS (key rings)
 * - Secret Manager (secrets)
 *
 * @see https://cloud.google.com/nodejs/docs/reference
 */
export declare class GcpInventoryDriver extends BaseCloudDriver {
    private _clients;
    private _auth;
    private _projectId;
    private _services;
    private _regions;
    constructor(options?: GCPDriverOptions);
    initialize(): Promise<void>;
    _initializeAuth(): Promise<void>;
    _collectComputeInstances(): AsyncGenerator<CloudResource>;
    _collectGKEClusters(): AsyncGenerator<CloudResource>;
    _collectCloudRunServices(): AsyncGenerator<CloudResource>;
    _collectCloudFunctions(): AsyncGenerator<CloudResource>;
    _collectStorageBuckets(): AsyncGenerator<CloudResource>;
    _collectCloudSQLInstances(): AsyncGenerator<CloudResource>;
    _collectBigQueryDatasets(): AsyncGenerator<CloudResource>;
    _collectPubSubTopics(): AsyncGenerator<CloudResource>;
    _collectPubSubSubscriptions(): AsyncGenerator<CloudResource>;
    _collectVPCNetworks(): AsyncGenerator<CloudResource>;
    _collectVPCSubnets(): AsyncGenerator<CloudResource>;
    _collectVPCFirewalls(): AsyncGenerator<CloudResource>;
    _collectIAMServiceAccounts(): AsyncGenerator<CloudResource>;
    _collectKMSKeyRings(): AsyncGenerator<CloudResource>;
    _collectSecretManagerSecrets(): AsyncGenerator<CloudResource>;
    _listZonesInRegion(region: string): Promise<GCPZone[]>;
    listResources(options?: ListResourcesWithDiscovery): AsyncGenerator<CloudResource>;
}
export {};
//# sourceMappingURL=gcp-driver.d.ts.map