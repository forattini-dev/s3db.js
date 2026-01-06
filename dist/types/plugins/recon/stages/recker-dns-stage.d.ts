/**
 * ReckerDNSStage
 *
 * DNS Intelligence using Recker's DNS toolkit
 *
 * Discovers:
 * - DNS records (A, AAAA, MX, TXT, NS)
 * - Security records (SPF, DMARC, DKIM, CAA)
 * - DNS health score
 *
 * Uses Recker's native DNS resolution (no external dependencies like dig)
 * Falls back to DNSDumpsterStage if Recker is not available
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: {
        curl?: {
            userAgent?: string;
        };
        storage?: {
            persistRawOutput?: boolean;
        };
    };
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface ReckerDNSFeatureConfig {
    timeout?: number;
    includeSecurityRecords?: boolean;
    includeHealthCheck?: boolean;
}
export interface ARecord {
    hostname: string;
    ip: string;
}
export interface MXRecord {
    priority: string;
    hostname: string;
    ip: string;
}
export interface TXTRecord {
    content: string;
}
export interface NSRecord {
    hostname: string;
    ip: string | null;
}
export interface DNSRecords {
    A: ARecord[];
    AAAA: ARecord[];
    MX: MXRecord[];
    TXT: TXTRecord[];
    NS: NSRecord[];
}
export interface SecurityRecords {
    spf: string[];
    dmarc: string | null;
    dkim: {
        found: boolean;
        record?: string;
    } | null;
    caa: {
        issue?: string[];
        issuewild?: string[];
    } | null;
}
export interface HealthCheck {
    score: number;
    grade: string;
    checks: Array<{
        name: string;
        status: 'pass' | 'warn' | 'fail';
        message: string;
    }>;
}
export interface ReckerDNSAggregatedResult {
    status: string;
    host: string;
    dnsRecords: DNSRecords;
    securityRecords: SecurityRecords | null;
    healthCheck: HealthCheck | null;
    errors: Record<string, string>;
}
export interface ReckerDNSResult extends ReckerDNSAggregatedResult {
    _individual: {
        recker: {
            status: string;
            source: string;
        };
        fallback: {
            status: string;
            source: string;
        } | null;
    };
    _aggregated: ReckerDNSAggregatedResult;
}
export declare class ReckerDNSStage {
    private plugin;
    private config;
    private reckerAvailable;
    private dnsClient;
    private checkDnsHealth;
    private checkDkim;
    private fallbackStage;
    constructor(plugin: ReconPlugin);
    private _checkReckerAvailability;
    private _getFallbackStage;
    execute(target: Target, options?: ReckerDNSFeatureConfig): Promise<ReckerDNSResult>;
    private _resolveA;
    private _resolveAAAA;
    private _resolveMX;
    private _resolveTXT;
    private _resolveNS;
    private _getSecurityRecords;
    private _getHealthCheck;
    private _executeFallback;
    isReckerEnabled(): boolean;
}
export default ReckerDNSStage;
//# sourceMappingURL=recker-dns-stage.d.ts.map