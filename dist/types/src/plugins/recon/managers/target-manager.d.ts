/**
 * TargetManager
 *
 * Handles dynamic target management:
 * - CRUD operations for targets
 * - Target normalization
 * - Resource persistence
 */
export interface NormalizedTarget {
    original: string;
    host: string;
    protocol: string | null;
    port: number | null;
    path: string | null;
}
export interface TargetOptions {
    enabled?: boolean;
    behavior?: string;
    features?: Record<string, any>;
    tools?: any;
    schedule?: string | null;
    metadata?: Record<string, any>;
    addedBy?: string;
    tags?: string[];
}
export interface TargetRecord {
    id: string;
    target: string;
    enabled: boolean;
    behavior: string;
    features: Record<string, any>;
    tools: any;
    schedule: string | null;
    metadata: Record<string, any>;
    lastScanAt: string | null;
    lastScanStatus: string | null;
    scanCount: number;
    addedBy: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}
export interface ListOptions {
    includeDisabled?: boolean;
    fromResource?: boolean;
    limit?: number;
}
export interface ReconPlugin {
    config: {
        behavior: string;
        targets?: Array<string | TargetConfigEntry>;
    };
    namespace?: string;
    database: any;
    emit(event: string, data: any): void;
    _targetManager: TargetManager;
}
export interface TargetConfigEntry {
    target?: string;
    host?: string;
    domain?: string;
    enabled?: boolean;
    behavior?: string;
    features?: Record<string, any>;
    tools?: any;
    schedule?: string | null;
    metadata?: Record<string, any>;
    tags?: string[];
}
export interface Report {
    endedAt: string;
    status: string;
}
export declare class TargetManager {
    private plugin;
    constructor(plugin: ReconPlugin);
    add(targetInput: string, options?: TargetOptions): Promise<TargetRecord>;
    remove(targetInput: string): Promise<{
        targetId: string;
        removed: boolean;
    }>;
    update(targetInput: string, updates: Partial<TargetRecord>): Promise<TargetRecord>;
    list(options?: ListOptions): Promise<TargetRecord[]>;
    get(targetInput: string): Promise<TargetRecord | null>;
    updateScanMetadata(targetId: string, report: Report): Promise<void>;
    private _getResource;
    private _normalizeTarget;
    private _defaultPortForProtocol;
    private _normalizeConfigTargets;
}
//# sourceMappingURL=target-manager.d.ts.map