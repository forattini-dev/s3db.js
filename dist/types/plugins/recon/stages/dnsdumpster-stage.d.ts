/**
 * DNSDumpster Stage
 *
 * DNS Intelligence via dnsdumpster.com web scraping
 *
 * Discovers:
 * - DNS records (A, AAAA, MX, TXT, NS)
 * - Subdomains
 * - Related domains
 * - Network map data
 *
 * Uses 100% free web scraping (no API key required)
 * - dnsdumpster.com (unlimited, requires CSRF token handling)
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
export interface DNSDumpsterFeatureConfig {
    timeout?: number;
    fallbackToDig?: boolean;
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
export interface ParsedDNSData {
    dnsRecords: DNSRecords;
    subdomains: string[];
    relatedDomains: string[];
}
export interface IndividualResults {
    dnsdumpster: {
        status: string;
        data: ParsedDNSData | null;
        raw: string | null;
    };
    dig: {
        status: string;
        records: Record<string, any>;
        dnsRecords?: DNSRecords;
        subdomains?: string[];
        relatedDomains?: string[];
    };
}
export interface DNSDumpsterAggregatedResult {
    status: string;
    host: string;
    dnsRecords: DNSRecords;
    subdomains: string[];
    relatedDomains: string[];
    errors: Record<string, string>;
}
export interface DNSDumpsterResult extends DNSDumpsterAggregatedResult {
    _individual: IndividualResults;
    _aggregated: DNSDumpsterAggregatedResult;
}
export declare class DNSDumpsterStage {
    private plugin;
    private commandRunner;
    private config;
    private _httpClient;
    constructor(plugin: ReconPlugin);
    private _getHttpClient;
    execute(target: Target, options?: DNSDumpsterFeatureConfig): Promise<DNSDumpsterResult>;
    getCsrfToken(baseUrl: string, options?: DNSDumpsterFeatureConfig): Promise<[string | null, string]>;
    submitQuery(baseUrl: string, domain: string, csrfToken: string, cookie: string, options?: DNSDumpsterFeatureConfig): Promise<string | null>;
    parseHtmlResponse(html: string): ParsedDNSData;
    fallbackDigLookup(host: string): Promise<{
        dnsRecords: DNSRecords;
        subdomains: string[];
        relatedDomains: string[];
    }>;
}
//# sourceMappingURL=dnsdumpster-stage.d.ts.map