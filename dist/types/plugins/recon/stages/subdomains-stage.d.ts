/**
 * SubdomainsStage
 *
 * Subdomain enumeration using RedBlue:
 * - Certificate Transparency logs
 * - DNS bruteforce with wordlists
 * - Multi-threaded discovery
 * - Subdomain takeover detection
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface SubdomainsFeatureConfig {
    timeout?: number;
    passive?: boolean;
    recursive?: boolean;
    wordlist?: string;
    threads?: number;
    checkTakeover?: boolean;
    maxSubdomains?: number;
}
export interface TakeoverFingerprint {
    cname: string;
    severity: 'high' | 'medium' | 'low';
}
export interface VulnerableSubdomain {
    subdomain: string;
    provider: string;
    cname: string;
    severity: string;
    evidence: string;
    recommendation: string;
}
export interface TakeoverError {
    subdomain: string;
    error: string;
}
export interface TakeoverResults {
    status: 'ok' | 'vulnerable';
    vulnerable: VulnerableSubdomain[];
    checked: number;
    errors: TakeoverError[];
}
export interface NormalizedSubdomains {
    list: string[];
    sources: Record<string, number>;
}
export interface SubdomainsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    total?: number;
    list?: string[];
    sources?: Record<string, number>;
    takeover?: TakeoverResults | null;
    metadata?: Record<string, any>;
}
export declare class SubdomainsStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: SubdomainsFeatureConfig): Promise<SubdomainsResult>;
    private _buildFlags;
    private _normalizeSubdomains;
    private _checkSubdomainTakeover;
    private _extractCname;
}
//# sourceMappingURL=subdomains-stage.d.ts.map