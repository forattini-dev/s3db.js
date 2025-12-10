/**
 * StorageManager
 *
 * Handles all storage operations for the ReconPlugin:
 * - Report persistence to PluginStorage
 * - Resource updates (hosts, reports, diffs, stages, etc.)
 * - History pruning
 * - Diff computation and alerts
 */
import type { NormalizedTarget } from '../concerns/target-normalizer.js';
export interface ReconPlugin {
    database: any;
    namespace?: string;
    config: {
        storage: {
            historyLimit: number;
        };
        resources: {
            persist: boolean;
        };
    };
    getStorage(): PluginStorage;
    _getResource(name: string): Promise<any>;
    emit(event: string, data: any): void;
}
export interface PluginStorage {
    getPluginKey(arg1: null, ...args: string[]): string;
    set(key: string, data: any, options?: {
        behavior?: string;
    }): Promise<void>;
    get(key: string): Promise<any>;
    delete(key: string): Promise<void>;
}
export interface StageData {
    status?: string;
    duration?: number;
    error?: string;
    _individual?: Record<string, any>;
    _aggregated?: any;
    tools?: Record<string, any>;
    records?: Record<string, any>;
    openPorts?: any[];
    list?: any[];
    paths?: any[];
    total?: number;
}
export interface ReportFingerprint {
    primaryIp?: string;
    ipAddresses?: string[];
    cdn?: string;
    server?: string;
    latencyMs?: number | null;
    subdomains?: string[];
    subdomainCount?: number;
    openPorts?: any[];
    technologies?: string[] | {
        detected?: string[];
    };
    infrastructure?: {
        ips?: {
            ipv4?: string[];
        };
    };
    attackSurface?: {
        openPorts?: any[];
        subdomains?: {
            total?: number;
        };
        discoveredPaths?: {
            total?: number;
        };
    };
}
export interface Report {
    id?: string;
    target: NormalizedTarget;
    timestamp?: string;
    endedAt: string;
    status: string;
    duration?: number;
    results?: Record<string, StageData>;
    fingerprint: ReportFingerprint;
    storageKey?: string;
    stageStorageKeys?: Record<string, string>;
    toolStorageKeys?: Record<string, string>;
    diffs?: DiffEntry[];
    riskLevel?: string;
    uptime?: any;
}
export interface DiffEntry {
    type: string;
    values?: any[];
    previous?: any;
    current?: any;
    description: string;
    severity: string;
    critical: boolean;
    detectedAt: string;
}
export interface HistoryEntry {
    timestamp: string;
    status: string;
    reportKey: string;
    stageKeys?: Record<string, string>;
    toolKeys?: Record<string, string>;
    summary: {
        latencyMs: number | null;
        openPorts: number;
        subdomains: number;
        primaryIp: string | null;
    };
}
export interface IndexData {
    target: string;
    history: HistoryEntry[];
}
export interface HostRecord {
    id: string;
    target: string;
    summary: any;
    fingerprint: ReportFingerprint;
    lastScanAt: string;
    storageKey: string | null;
}
export declare class StorageManager {
    private plugin;
    private resources;
    private logger;
    constructor(plugin: ReconPlugin);
    listNamespaces(): Promise<string[]>;
    initialize(): Promise<void>;
    getResource(name: string): any;
    _extractTimestampDay(isoTimestamp: string | undefined): string | null;
    persistReport(target: NormalizedTarget, report: Report): Promise<void>;
    persistToResources(report: Report): Promise<void>;
    pruneHistory(target: NormalizedTarget, pruned: HistoryEntry[]): Promise<void>;
    loadLatestReport(hostId: string): Promise<Report | null>;
    loadHostSummary(hostId: string, report: Report): Promise<HostRecord>;
    saveDiffs(hostId: string, timestamp: string, diffs: DiffEntry[]): Promise<void>;
    loadRecentDiffs(hostId: string, limit?: number): Promise<DiffEntry[]>;
    _buildHostRecord(report: Report): HostRecord;
    _computeDiffs(existingRecord: HostRecord | null, report: Report): DiffEntry[];
    _createDiff(type: string, data: Partial<DiffEntry>, meta?: {
        severity?: string;
        critical?: boolean;
    }): DiffEntry;
    _emitDiffAlerts(hostId: string, report: Report, diffs: DiffEntry[]): Promise<void>;
    _summarizeStage(stageName: string, stageData: StageData): Record<string, any>;
    _stripRawFields(obj: any): Record<string, any>;
    _upsertResourceRecord(resource: any, record: any): Promise<void>;
    _extractToolNames(stageData: StageData | undefined, filter?: 'all' | 'succeeded' | 'failed'): string[];
    _countResults(stageData: StageData | undefined): number;
}
//# sourceMappingURL=storage-manager.d.ts.map