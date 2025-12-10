import { Plugin } from '../plugin.class.js';
export interface TfStatePluginConfig {
    logger?: any;
    logLevel?: string;
    driver?: 's3' | 'filesystem';
    config?: any;
    resources?: {
        resources?: string;
        stateFiles?: string;
        diffs?: string;
        lineages?: string;
    };
    resourceNames?: {
        resources?: string;
        stateFiles?: string;
        diffs?: string;
        lineages?: string;
    };
    resourceName?: string;
    stateFilesName?: string;
    diffsName?: string;
    monitor?: {
        enabled?: boolean;
        cron?: string;
    };
    diffs?: {
        enabled?: boolean;
        lookback?: number;
    };
    trackDiffs?: boolean;
    asyncPartitions?: boolean;
    autoSync?: boolean;
    watchPaths?: string[];
    filters?: {
        types?: string[];
        providers?: string[];
        exclude?: string[];
        include?: string[];
    };
    [key: string]: unknown;
}
export declare class TfStatePlugin extends Plugin {
    driverType: string | null;
    driverConfig: any;
    _resourceDescriptors: any;
    resourceName: string;
    stateFilesName: string;
    diffsName: string;
    lineagesName: string;
    monitorEnabled: boolean;
    monitorCron: string;
    trackDiffs: boolean;
    diffsLookback: number;
    asyncPartitions: boolean;
    autoSync: boolean;
    watchPaths: string[];
    filters: {
        types?: string[];
        providers?: string[];
        exclude?: string[];
        include?: string[];
    };
    logLevel: string;
    supportedVersions: number[];
    driver: any | null;
    resource: any | null;
    stateFilesResource: any | null;
    diffsResource: any | null;
    lineagesResource: any | null;
    watchers: any[];
    cronTask: any | null;
    lastProcessedSerial: number | null;
    _partitionCache: Map<string, string | null>;
    stats: {
        statesProcessed: number;
        resourcesExtracted: number;
        resourcesInserted: number;
        diffsCalculated: number;
        errors: number;
        lastProcessedSerial: number | null;
        partitionCacheHits: number;
        partitionQueriesOptimized: number;
    };
    constructor(config?: TfStatePluginConfig);
    _resolveResourceNames(): any;
    onNamespaceChanged(): void;
    /**
     * Install the plugin
     * @override
     */
    onInstall(): Promise<void>;
    /**
     * Start the plugin
     * @override
     */
    onStart(): Promise<void>;
    /**
     * Stop the plugin
     * @override
     */
    onStop(): Promise<void>;
    /**
     * Import multiple Terraform/OpenTofu states from local filesystem using glob pattern
     */
    importStatesGlob(pattern: string, options?: any): Promise<any>;
    /**
     * Find files matching glob pattern
     * @private
     */
    _findFilesGlob(pattern: string): Promise<string[]>;
    /**
     * Import Terraform/OpenTofu state from remote S3 bucket
     */
    importStateFromS3(bucket: string, key: string, options?: any): Promise<any>;
    /**
     * Import multiple Terraform/OpenTofu states from S3 using glob pattern
     */
    importStatesFromS3Glob(bucket: string, pattern: string, options?: any): Promise<any>;
    /**
     * Match S3 key against glob pattern
     * Simple glob matching supporting *, **, ?, and []
     * @private
     */
    _matchesGlobPattern(key: string, pattern: string): boolean;
    /**
     * Ensure lineage record exists and is up-to-date
     * Creates or updates the lineage tracking record
     * @private
     */
    _ensureLineage(lineageUuid: string, stateMeta: any): Promise<any>;
    /**
     * Import Terraform/OpenTofu state from file
     */
    importState(filePath: string): Promise<any>;
    /**
     * Read and parse Tfstate file
     * @private
     */
    _readStateFile(filePath: string): Promise<any>;
    /**
     * Validate basic state structure
     * @private
     */
    _validateState(state: any, filePath: string): void;
    /**
     * Validate Tfstate version
     * @private
     */
    _validateStateVersion(state: any): void;
    /**
     * Extract resources from Tfstate
     * @private
     */
    _extractResources(state: any, filePath: string, stateFileId: string, lineageId: string | null): Promise<any[]>;
    /**
     * Extract single resource instance
     * @private
     */
    _extractResourceInstance(resource: any, instance: any, stateSerial: number, stateVersion: number, importedAt: number, sourceFile: string, stateFileId: string, lineageId: string | null): any;
    /**
     * Detect provider from resource type
     * @private
     */
    _detectProvider(resourceType: string): string;
    /**
     * Check if resource should be included based on filters
     * @private
     */
    _shouldIncludeResource(resource: any): boolean;
    /**
     * Match resource address against pattern (supports wildcards)
     * @private
     */
    _matchesPattern(address: string, pattern: string): boolean;
    /**
     * Calculate diff between current and previous state
     * NEW: Uses lineage-based tracking for O(1) lookup
     * @private
     */
    _calculateDiff(currentState: any, lineageId: string, currentStateFileId: string): Promise<any>;
    /**
     * Compute diff between two state serials
     * NEW: Uses lineage-based partition for efficient resource lookup
     * @private
     */
    _computeDiff(oldSerial: number, newSerial: number, lineageId: string): Promise<any>;
    /**
     * Compute changes between old and new attributes
     * @private
     */
    _computeAttributeChanges(oldAttrs: any, newAttrs: any): any[];
    /**
     * Save diff to diffsResource
     * NEW: Includes lineage-based fields for efficient querying
     * @private
     */
    _saveDiff(diff: any, lineageId: string, newStateFileId: string): Promise<any>;
    /**
     * Calculate SHA256 hash of state content
     * @private
     */
    _calculateSHA256(state: any): string;
    /**
     * Insert resources into database with controlled parallelism
     * @private
     */
    _insertResources(resources: any[]): Promise<any[]>;
    /**
     * Setup cron-based monitoring for state file changes
     * @private
     */
    _setupCronMonitoring(): Promise<void>;
    /**
     * Monitor state files for changes
     * Called by cron task
     * @private
     */
    _monitorStateFiles(): Promise<any>;
    /**
     * Setup file watchers for auto-sync
     * @private
     */
    _setupFileWatchers(): Promise<void>;
    /**
     * Export resources to Tfstate format
     */
    exportState(options?: any): Promise<any>;
    /**
     * Export state to local file
     */
    exportStateToFile(filePath: string, options?: any): Promise<any>;
    /**
     * Export state to S3
     */
    exportStateToS3(bucket: string, key: string, options?: any): Promise<any>;
    /**
     * Get diffs with lookback support
     */
    getDiffsWithLookback(sourceFile: string, options?: any): Promise<any[]>;
    /**
     * Get diff timeline for a state file
     */
    getDiffTimeline(sourceFile: string, options?: any): Promise<any>;
    /**
     * Compare two specific state serials
     */
    compareStates(sourceFile: string, oldSerial: number, newSerial: number): Promise<any>;
    /**
     * Trigger monitoring check manually
     */
    triggerMonitoring(): Promise<any>;
    /**
     * Get resources by type (uses partition for fast queries)
     */
    getResourcesByType(type: string): Promise<any[]>;
    /**
     * Get resources by provider (uses partition for fast queries)
     */
    getResourcesByProvider(provider: string): Promise<any[]>;
    /**
     * Get resources by provider and type (uses partition for ultra-fast queries)
     */
    getResourcesByProviderAndType(provider: string, type: string): Promise<any[]>;
    /**
     * Get diff between two state serials
     */
    getDiff(sourceFile: string, oldSerial: number, newSerial: number): Promise<any>;
    /**
     * Get statistics by provider
     */
    getStatsByProvider(): Promise<Record<string, number>>;
    /**
     * Get statistics by resource type
     */
    getStatsByType(): Promise<Record<string, number>>;
    /**
     * Find partition by field name (for efficient queries)
     * Uses cache to avoid repeated lookups
     * @private
     */
    _findPartitionByField(resource: any, fieldName: string): string | null;
    /**
     * Get plugin statistics
     */
    getStats(): Promise<any>;
}
//# sourceMappingURL=index.d.ts.map