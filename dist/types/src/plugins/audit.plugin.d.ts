import { Plugin, ResourceLike } from './plugin.class.js';
import { type Logger } from '../concerns/logger.js';
export interface AuditPluginOptions {
    resourceNames?: {
        audit?: string;
    };
    resourceName?: string;
    includeData?: boolean;
    includePartitions?: boolean;
    maxDataSize?: number;
    namespace?: string;
    logger?: Logger;
    logLevel?: string;
    [key: string]: unknown;
}
export interface AuditQueryOptions {
    resourceName?: string;
    operation?: string;
    recordId?: string;
    partition?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
export interface AuditRecord {
    id: string;
    resourceName: string;
    operation: string;
    recordId: string;
    userId: string;
    timestamp: string;
    createdAt: string;
    oldData?: string | null;
    newData?: string | null;
    partition?: string | null;
    partitionValues?: string | null;
    metadata?: string;
}
export interface AuditStats {
    total: number;
    byOperation: Record<string, number>;
    byResource: Record<string, number>;
    byPartition: Record<string, number>;
    byUser: Record<string, number>;
    timeline: Record<string, number>;
}
export interface AuditConfig {
    includeData: boolean;
    includePartitions: boolean;
    maxDataSize: number;
    logLevel?: string;
}
interface ResourceDescriptor {
    defaultName: string;
    override?: string;
}
interface Resource {
    name: string;
    $schema: {
        partitions?: Record<string, {
            fields: Record<string, string>;
        }>;
    };
    on(event: string, callback: (data: unknown) => Promise<void>): void;
    insert(data: Record<string, unknown>): Promise<void>;
    get(id: string): Promise<Record<string, unknown>>;
    list(options?: {
        limit?: number;
    }): Promise<Record<string, unknown>[]>;
    query(filter: Record<string, unknown>, options?: {
        limit?: number;
    }): Promise<Record<string, unknown>[]>;
    page(options?: {
        size?: number;
        offset?: number;
    }): Promise<{
        items: Record<string, unknown>[];
    }>;
    delete(id: string): Promise<void>;
    deleteMany: (ids: string[]) => Promise<void>;
    _originalDeleteMany?: (ids: string[]) => Promise<void>;
}
export declare class AuditPlugin extends Plugin {
    namespace: string;
    auditResource: Resource | null;
    _auditResourceDescriptor: ResourceDescriptor;
    auditResourceName: string;
    config: AuditConfig;
    getCurrentUserId?: () => string;
    constructor(options?: AuditPluginOptions);
    _resolveAuditResourceName(): string;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    setupResourceAuditing(resource: Resource): void;
    logAudit(auditData: {
        resourceName: string;
        operation: string;
        recordId: string;
        oldData: string | null;
        newData: string | null;
        partition: string | null;
        partitionValues: string | null;
    }): Promise<void>;
    getPartitionValues(data: Record<string, unknown>, resource: ResourceLike): Record<string, Record<string, unknown>>;
    getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    getPrimaryPartition(partitionValues: Record<string, unknown>): string | null;
    truncateData(data: Record<string, unknown>): Record<string, unknown> | null;
    getAuditLogs(options?: AuditQueryOptions): Promise<AuditRecord[]>;
    _generateDateRange(startDate: string, endDate?: string): string[];
    getRecordHistory(resourceName: string, recordId: string): Promise<AuditRecord[]>;
    getPartitionHistory(resourceName: string, partitionName: string, partitionValues: Record<string, unknown>): Promise<AuditRecord[]>;
    getAuditStats(options?: AuditQueryOptions): Promise<AuditStats>;
    cleanupOldAudits(retentionDays?: number): Promise<number>;
}
export {};
//# sourceMappingURL=audit.plugin.d.ts.map