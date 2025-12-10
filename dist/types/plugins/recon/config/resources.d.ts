/**
 * ReconPlugin Database Resources Configuration
 *
 * Defines 7 database resources for storing reconnaissance data:
 * 1. plg_recon_hosts - Full host profiles with fingerprints
 * 2. plg_recon_reports - Historical scan reports
 * 3. plg_recon_stages - Per-stage execution metadata
 * 4. plg_recon_diffs - Change detection between scans
 * 5. plg_recon_subdomains - Consolidated subdomain lists
 * 6. plg_recon_paths - Discovered web paths/endpoints
 * 7. plg_recon_targets - Dynamic target management
 */
export interface ResourceAttribute {
    [key: string]: string | ResourceAttribute;
}
export interface PartitionFieldConfig {
    [field: string]: string;
}
export interface PartitionConfig {
    fields: PartitionFieldConfig;
}
export interface ResourceConfig {
    name: string;
    attributes: Record<string, any>;
    partitions?: Record<string, PartitionConfig>;
    behavior: 'body-overflow' | 'body-only' | 'enforce-limits' | 'truncate-data' | 'user-managed';
    timestamps: boolean;
}
export type ResourceName = 'hosts' | 'reports' | 'stages' | 'diffs' | 'subdomains' | 'paths' | 'targets';
export declare const RESOURCE_CONFIGS: Record<ResourceName, ResourceConfig>;
export declare function getResourceConfig(resourceName: ResourceName): ResourceConfig;
export declare function getResourceNames(): ResourceName[];
export declare function getAllResourceConfigs(): ResourceConfig[];
//# sourceMappingURL=resources.d.ts.map