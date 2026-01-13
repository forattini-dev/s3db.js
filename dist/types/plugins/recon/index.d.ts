/**
 * ReconPlugin - Modular Refactored Version
 *
 * Main orchestrator that coordinates managers, stages, and concerns.
 * Backward compatible with the original monolithic API.
 *
 * Architecture:
 * - Managers: Handle high-level operations (storage, targets, scheduling, dependencies)
 * - Stages: Execute individual reconnaissance tasks (DNS, ports, subdomains, etc.)
 * - Concerns: Shared utilities (command runner, normalizer, report generator, etc.)
 */
import { Plugin } from '../plugin.class.js';
import { StorageManager } from './managers/storage-manager.js';
import { TargetManager } from './managers/target-manager.js';
import { SchedulerManager } from './managers/scheduler-manager.js';
import { DependencyManager } from './managers/dependency-manager.js';
import { DnsStage } from './stages/dns-stage.js';
import { CertificateStage } from './stages/certificate-stage.js';
import { LatencyStage } from './stages/latency-stage.js';
import { HttpStage } from './stages/http-stage.js';
import { PortsStage } from './stages/ports-stage.js';
import { SubdomainsStage } from './stages/subdomains-stage.js';
import { WebDiscoveryStage } from './stages/web-discovery-stage.js';
import { VulnerabilityStage } from './stages/vulnerability-stage.js';
import { TlsAuditStage } from './stages/tls-audit-stage.js';
import { FingerprintStage } from './stages/fingerprint-stage.js';
import { ScreenshotStage } from './stages/screenshot-stage.js';
import { OsintStage } from './stages/osint-stage.js';
import { WhoisStage } from './stages/whois-stage.js';
import { SecretsStage } from './stages/secrets-stage.js';
import { ASNStage } from './stages/asn-stage.js';
import { DNSDumpsterStage } from './stages/dnsdumpster-stage.js';
import { GoogleDorksStage } from './stages/google-dorks-stage.js';
import { CommandRunner } from './concerns/command-runner.js';
import { ProcessManager } from './concerns/process-manager.js';
import { UptimeBehavior, UptimeBehaviorConfig, UptimeStatus } from './behaviors/uptime-behavior.js';
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
    original?: string;
}
export interface ScanFeatures {
    dns?: boolean | Record<string, any>;
    certificate?: boolean | Record<string, any>;
    whois?: boolean | Record<string, any>;
    latency?: boolean | Record<string, any>;
    http?: boolean | Record<string, any>;
    ports?: boolean | Record<string, any>;
    subdomains?: boolean | Record<string, any>;
    webDiscovery?: boolean | Record<string, any>;
    vulnerability?: boolean | Record<string, any>;
    tlsAudit?: boolean | Record<string, any>;
    fingerprint?: boolean | Record<string, any>;
    screenshot?: boolean | Record<string, any>;
    osint?: boolean | Record<string, any>;
    secrets?: boolean | Record<string, any>;
    asn?: boolean | Record<string, any>;
    dnsdumpster?: boolean | Record<string, any>;
    googleDorks?: boolean | Record<string, any>;
}
export interface ReconConfig {
    behavior?: string;
    behaviorOverrides?: {
        features?: Partial<ScanFeatures>;
    };
    features?: Partial<ScanFeatures>;
    storage?: {
        enabled?: boolean;
        [key: string]: any;
    };
    scheduler?: {
        enabled?: boolean;
        [key: string]: any;
    };
    behaviors?: {
        uptime?: UptimeBehaviorConfig;
    };
    resources?: {
        persist?: boolean;
        [key: string]: any;
    };
    rateLimit?: {
        enabled?: boolean;
        delayBetweenStages?: number;
        requestsPerMinute?: number;
    };
    [key: string]: any;
}
export interface ScanReport {
    id: string;
    timestamp: string;
    target: Target;
    duration: number;
    status: 'completed' | 'error';
    results: Record<string, any>;
    fingerprint: Record<string, any>;
    uptime: {
        status: string;
        uptimePercentage: string;
        lastCheck: string | null;
        isDown: boolean;
        consecutiveFails: number;
    } | null;
}
export interface DiffResult {
    added: string[];
    removed: string[];
    changed: Record<string, {
        old: any;
        new: any;
    }>;
}
export interface SecurityAudit {
    findings: any[];
    recommendations: string[];
    score: number;
}
interface Stages {
    dns: DnsStage;
    certificate: CertificateStage;
    latency: LatencyStage;
    http: HttpStage;
    ports: PortsStage;
    subdomains: SubdomainsStage;
    webDiscovery: WebDiscoveryStage;
    vulnerability: VulnerabilityStage;
    tlsAudit: TlsAuditStage;
    fingerprint: FingerprintStage;
    screenshot: ScreenshotStage;
    osint: OsintStage;
    whois: WhoisStage;
    secrets: SecretsStage;
    asn: ASNStage;
    dnsdumpster: DNSDumpsterStage;
    googleDorks: GoogleDorksStage;
}
export declare class ReconPlugin extends Plugin {
    static pluginName: string;
    config: ReconConfig;
    commandRunner: CommandRunner;
    processManager: ProcessManager;
    storageManager: StorageManager | null;
    targetManager: TargetManager | null;
    schedulerManager: SchedulerManager | null;
    dependencyManager: DependencyManager;
    stages: Stages;
    uptimeBehavior?: UptimeBehavior;
    constructor(config?: ReconConfig);
    initialize(): Promise<void>;
    private _applyRateLimit;
    cleanup(): Promise<void>;
    scan(target: string | Target, options?: Partial<ScanFeatures>): Promise<ScanReport>;
    batchScan(targets: (string | Target)[], options?: Partial<ScanFeatures>): Promise<(ScanReport | {
        target: string;
        status: 'error';
        error: string;
    })[]>;
    getReport(reportId: string): Promise<ScanReport | null>;
    listReports(options?: Record<string, any>): Promise<ScanReport[]>;
    getReportsByHost(host: string, options?: Record<string, any>): Promise<ScanReport[]>;
    compareReports(reportId1: string, reportId2: string): Promise<DiffResult | null>;
    generateMarkdownReport(report: ScanReport): string;
    generateJSONReport(report: ScanReport): string;
    generateHTMLReport(report: ScanReport): string;
    generateExecutiveSummary(report: ScanReport): string;
    generateSecurityAudit(report: ScanReport): SecurityAudit;
    generateSecurityAuditMarkdown(report: ScanReport): string;
    addTarget(target: string | Target, schedule?: string | null): Promise<any>;
    removeTarget(targetId: string): Promise<boolean>;
    listTargets(): Promise<any[]>;
    updateTargetSchedule(targetId: string, schedule: string): Promise<any>;
    getToolStatus(): Promise<Record<string, boolean>>;
    isToolAvailable(toolName: string): Promise<boolean>;
    runScheduledSweep(): Promise<any>;
    getLatestDiff(host: string): Promise<DiffResult | null>;
    getFingerprint(host: string): Promise<Record<string, any> | null>;
    private _generateReportId;
    startUptimeMonitoring(target: string | Target): Promise<UptimeStatus | null>;
    stopUptimeMonitoring(host: string): void;
    getUptimeStatus(host: string): UptimeStatus | null;
    getAllUptimeStatuses(): UptimeStatus[];
    loadUptimeStatus(host: string): Promise<any>;
    onStop(): Promise<void>;
    onUninstall(options?: Record<string, any>): Promise<void>;
    afterUninstall(): void;
}
export default ReconPlugin;
//# sourceMappingURL=index.d.ts.map