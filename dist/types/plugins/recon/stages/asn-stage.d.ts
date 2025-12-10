/**
 * ASNStage
 *
 * ASN (Autonomous System Number) and Network Intelligence
 *
 * Discovers:
 * - ASN ownership and organization
 * - IP ranges (CIDR blocks)
 * - Network provider information
 * - BGP routing data
 *
 * Uses 100% free APIs:
 * - iptoasn.com (unlimited, free)
 * - hackertarget.com (100 queries/day free)
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
export interface ASNFeatureConfig {
    timeout?: number;
    hackertarget?: boolean;
}
export interface ASNData {
    ip: string;
    asn: string;
    asnNumber: number;
    organization: string | null;
    country: string | null;
    network: string | null;
    source: string;
    _source?: string;
    sources?: string[];
}
export interface DigResults {
    status: string;
    ipv4: string[];
    ipv6: string[];
    raw_ipv4?: string;
    raw_ipv6?: string;
}
export interface IndividualResults {
    iptoasn: {
        status: string;
        results: any[];
    };
    hackertarget: {
        status: string;
        results: any[];
    };
    dig: DigResults;
}
export interface ASNAggregatedResult {
    status: string;
    host: string;
    ipAddresses: string[];
    asns: ASNData[];
    networks: string[];
    organizations: string[];
    errors: Record<string, string>;
}
export interface ASNResult extends ASNAggregatedResult {
    _individual: IndividualResults;
    _aggregated: ASNAggregatedResult;
}
export declare class ASNStage {
    private plugin;
    private commandRunner;
    private config;
    private _httpClient;
    constructor(plugin: ReconPlugin);
    private _getHttpClient;
    execute(target: Target, options?: ASNFeatureConfig): Promise<ASNResult>;
    resolveHostToIPs(host: string, digResults?: DigResults | null): Promise<string[]>;
    lookupASNViaIPToASN(ip: string, options?: ASNFeatureConfig): Promise<ASNData | null>;
    lookupASNViaHackerTarget(ip: string, options?: ASNFeatureConfig): Promise<ASNData | null>;
    deduplicateASNs(asns: ASNData[]): ASNData[];
}
//# sourceMappingURL=asn-stage.d.ts.map