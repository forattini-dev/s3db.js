/**
 * ReckerASNStage
 *
 * ASN (Autonomous System Number) lookup using Recker
 *
 * Uses Recker's DNS client to resolve hostnames (no dig dependency)
 * Uses Recker's HTTP client for API calls
 *
 * Falls back to ASNStage if Recker is not available
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
export interface ReckerASNFeatureConfig {
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
export interface ReckerASNAggregatedResult {
    status: string;
    host: string;
    ipAddresses: string[];
    asns: ASNData[];
    networks: string[];
    organizations: string[];
    errors: Record<string, string>;
}
export interface ReckerASNResult extends ReckerASNAggregatedResult {
    _individual: {
        recker: {
            status: string;
            source: string;
        };
        iptoasn: {
            status: string;
            results: ASNData[];
        };
        hackertarget: {
            status: string;
            results: ASNData[];
        };
    };
    _aggregated: ReckerASNAggregatedResult;
}
export declare class ReckerASNStage {
    private plugin;
    private config;
    private _httpClient;
    private reckerAvailable;
    private dnsClient;
    private fallbackStage;
    constructor(plugin: ReconPlugin);
    private _checkReckerAvailability;
    private _getHttpClient;
    private _getFallbackStage;
    execute(target: Target, options?: ReckerASNFeatureConfig): Promise<ReckerASNResult>;
    private _resolveHostToIPs;
    private _lookupASNViaIPToASN;
    private _lookupASNViaHackerTarget;
    private _deduplicateASNs;
    private _executeFallback;
    isReckerEnabled(): boolean;
}
export default ReckerASNStage;
//# sourceMappingURL=recker-asn-stage.d.ts.map