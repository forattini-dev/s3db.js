/**
 * WebDiscoveryStage
 *
 * Directory and endpoint fuzzing using RedBlue:
 * - Path/directory discovery
 * - Endpoint enumeration
 * - Custom wordlist support
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
export interface WebDiscoveryFeatureConfig {
    timeout?: number;
    wordlist?: string;
    threads?: number;
    statusCodes?: string;
    extensions?: string;
    recursive?: boolean;
}
export interface DiscoveredPath {
    path: string;
    status: number | null;
    size: number | null;
    type: 'directory' | 'file';
    redirect?: string | null;
}
export interface DiscoveryData {
    paths: DiscoveredPath[];
    total: number;
    directories?: number;
    files?: number;
}
export interface WebDiscoveryResult {
    status: 'ok' | 'empty' | 'skipped' | 'unavailable' | 'error';
    message?: string;
    url?: string;
    paths?: DiscoveredPath[];
    total?: number;
    directories?: number;
    files?: number;
    metadata?: Record<string, any>;
}
export declare class WebDiscoveryStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: WebDiscoveryFeatureConfig): Promise<WebDiscoveryResult>;
    private _buildUrl;
    private _defaultPortForProtocol;
    private _normalizeDiscovery;
    private _normalizePath;
    private _parseRawDiscovery;
}
//# sourceMappingURL=web-discovery-stage.d.ts.map