/**
 * SchedulerManager
 *
 * Handles cron-based scheduled sweeps:
 * - Manages cron job registration
 * - Triggers scheduled target sweeps
 * - Iterates over enabled targets
 */
import type { TargetManager, TargetRecord } from './target-manager.js';
export interface ReconPlugin {
    config: {
        schedule: {
            enabled: boolean;
            cron?: string;
            runOnStart?: boolean;
        };
        concurrency?: number;
    };
    namespace?: string;
    database?: {
        pluginRegistry?: {
            scheduler?: SchedulerPlugin;
        };
    };
    _targetManager: TargetManager;
    emit(event: string, data: any): void;
    runDiagnostics(target: string, options: DiagnosticOptions): Promise<Report>;
}
export interface SchedulerPlugin {
    registerJob(config: JobConfig): Promise<string>;
    unregisterJob(jobId: string): Promise<void>;
}
export interface JobConfig {
    name: string;
    cron: string;
    handler: () => Promise<void>;
    enabled: boolean;
    metadata: Record<string, any>;
}
export interface DiagnosticOptions {
    behavior?: string;
    features?: Record<string, any>;
    tools?: any;
    persist?: boolean;
}
export interface Report {
    target: {
        host: string;
    };
    status: string;
    endedAt: string;
}
export interface TargetEntry extends TargetRecord {
    persist?: boolean;
}
export declare class SchedulerManager {
    private plugin;
    private cronJobId;
    private fallbackJobName;
    constructor(plugin: ReconPlugin);
    start(): Promise<void>;
    stop(): Promise<void>;
    triggerSweep(reason?: string): Promise<void>;
    private _startFallbackScheduler;
    private _parseCronToInterval;
}
//# sourceMappingURL=scheduler-manager.d.ts.map