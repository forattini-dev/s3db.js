/**
 * DnsStage
 *
 * DNS enumeration using RedBlue:
 * - A, AAAA, NS, MX, TXT, CNAME, SOA records
 * - Uses `rb dns record all` for comprehensive lookup
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface DnsFeatureConfig {
    timeout?: number;
    server?: string;
    intel?: boolean;
}
export interface MxRecord {
    priority: number;
    exchange: string;
}
export interface DnsRecords {
    a: string[];
    aaaa: string[];
    ns: string[];
    mx: MxRecord[];
    txt: string[];
    cname: string[];
    soa: string | null;
}
export interface NormalizedRecords {
    hasRecords: boolean;
    data: DnsRecords;
    errors: Record<string, string>;
}
export interface DnsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    records?: DnsRecords;
    errors?: Record<string, string>;
    metadata?: Record<string, any>;
}
export declare class DnsStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: DnsFeatureConfig): Promise<DnsResult>;
    private _buildFlags;
    private _normalizeRecords;
    private _parseRawOutput;
    private _emptyRecords;
}
//# sourceMappingURL=dns-stage.d.ts.map