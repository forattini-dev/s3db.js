/**
 * UptimeBehavior
 *
 * Monitors target availability and calculates uptime metrics:
 * - Periodic health checks (ping, HTTP, DNS)
 * - Uptime percentage calculation
 * - Downtime detection and alerting
 * - Historical availability tracking
 *
 * Usage:
 * ```typescript
 * const plugin = new ReconPlugin({
 *   behaviors: {
 *     uptime: {
 *       enabled: true,
 *       interval: 60000,        // Check every 60 seconds
 *       methods: ['ping', 'http', 'dns'],
 *       alertOnDowntime: true,
 *       downtimeThreshold: 3    // 3 failed checks = downtime
 *     }
 *   }
 * });
 * ```
 */
export type CheckMethod = 'ping' | 'http' | 'dns';
export interface UptimeBehaviorConfig {
    enabled?: boolean;
    checkInterval?: number;
    aggregationInterval?: number;
    methods?: CheckMethod[];
    alertOnDowntime?: boolean;
    downtimeThreshold?: number;
    timeout?: number;
    retainHistory?: number;
    persistRawChecks?: boolean;
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface MethodResult {
    status: 'ok' | 'error' | 'timeout';
    error?: string;
    latency?: number | null;
    duration?: number;
    statusCode?: number;
    addresses?: string[];
}
export interface CheckResults {
    timestamp: string;
    methods: Record<string, MethodResult>;
    overallStatus?: 'up' | 'down';
}
export interface BufferEntry {
    timestamp: string;
    status: 'up' | 'down';
    methods: Record<string, MethodResult>;
    latency: Record<string, number | null>;
}
export interface LatencyStats {
    avg: string;
    min: string;
    max: string;
    samples: number;
}
export interface MinuteRecord {
    minuteCohort: string;
    timestamp: string;
    sampleCount: number;
    successCount: number;
    failCount: number;
    uptimePercent: string;
    avgLatencies: Record<string, LatencyStats>;
    overallStatus: 'up' | 'down';
}
export interface CheckState {
    status: 'unknown' | 'up' | 'down';
    consecutiveFails: number;
    consecutiveSuccess: number;
    lastCheck: string | null;
    lastUp: string | null;
    lastDown: string | null;
    totalChecks: number;
    successfulChecks: number;
    failedChecks: number;
    history: MinuteRecord[];
}
export interface UptimeStatus {
    host: string;
    status: 'unknown' | 'up' | 'down';
    uptimePercentage: string;
    totalChecks: number;
    successfulChecks: number;
    failedChecks: number;
    lastCheck: string | null;
    lastUp: string | null;
    lastDown: string | null;
    consecutiveFails: number;
    consecutiveSuccess: number;
    isDown: boolean;
    recentHistory: MinuteRecord[];
}
export interface Transition {
    host: string;
    from: 'unknown' | 'up' | 'down';
    to: 'up' | 'down';
    timestamp: string;
    checkResults: CheckResults;
}
export interface ReconPlugin {
    emit: (event: string, data: any) => void;
    getStorage: () => any;
    namespace?: string;
}
export declare class UptimeBehavior {
    private plugin;
    private config;
    private checks;
    private checkIntervals;
    private aggregationIntervals;
    private minuteBuffer;
    private logger;
    constructor(plugin: ReconPlugin, config?: UptimeBehaviorConfig);
    startMonitoring(target: Target): Promise<UptimeStatus | null>;
    stopMonitoring(host: string): void;
    getStatus(host: string): UptimeStatus | null;
    getAllStatuses(): UptimeStatus[];
    private _performCheck;
    private _aggregateMinute;
    private _extractMinuteCohort;
    private _calculateAverageLatencies;
    private _extractLatency;
    private _checkPing;
    private _checkHttp;
    private _checkDns;
    private _handleTransition;
    private _sendDowntimeAlert;
    private _pruneHistory;
    private _persistStatus;
    private _persistTransition;
    private _persistMinuteCohort;
    private _persistRawCheck;
    loadStatus(host: string): Promise<any>;
    linkReportToUptime(host: string, reportId: string, reportTimestamp: string): Promise<void>;
    cleanup(): void;
}
//# sourceMappingURL=uptime-behavior.d.ts.map