/**
 * MassDNSStage
 *
 * High-performance DNS resolution using RedBlue:
 * - Mass subdomain resolution
 * - Wordlist-based brute force
 * - Fast parallel queries
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: {
        massdns?: {
            wordlist?: string;
        };
    };
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface MassDNSFeatureConfig {
    timeout?: number;
    wordlist?: string;
    rate?: number;
    resolvers?: string;
}
export interface ResolvedSubdomain {
    subdomain: string;
    ip: string | null;
    ips?: string[] | null;
    cname?: string | null;
}
export interface MassDNSData {
    subdomains: ResolvedSubdomain[];
    resolvedCount: number;
    totalAttempts: number | null;
}
export interface MassDNSResult {
    status: 'ok' | 'empty' | 'error' | 'unavailable';
    message?: string;
    host: string;
    subdomains: ResolvedSubdomain[];
    resolvedCount: number;
    totalAttempts?: number | null;
    metadata?: Record<string, any>;
}
export declare class MassDNSStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: MassDNSFeatureConfig): Promise<MassDNSResult>;
    private _normalizeResolved;
    private _normalizeSubdomain;
    private _parseRawResolved;
}
//# sourceMappingURL=massdns-stage.d.ts.map