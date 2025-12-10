/**
 * Partition configuration for EventualConsistencyPlugin
 * @module eventual-consistency/partitions
 */
export interface PartitionFieldConfig {
    [field: string]: string;
}
export interface PartitionConfig {
    [partitionName: string]: {
        fields: PartitionFieldConfig;
    };
}
/**
 * Create partition configuration for transaction resource
 *
 * Partitions enable O(1) queries instead of O(n) scans for common access patterns:
 * - byCohortHour: Query pending transactions for a specific hour
 * - byApplied: Query all applied/unapplied transactions
 * - byOriginalId: Query transactions for a specific record
 *
 * @returns Partition configuration object
 */
export declare function createPartitionConfig(): PartitionConfig;
//# sourceMappingURL=partitions.d.ts.map