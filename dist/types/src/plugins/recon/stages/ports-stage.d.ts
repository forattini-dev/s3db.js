/**
 * PortsStage
 *
 * Port scanning using RedBlue:
 * - Common ports preset (fast)
 * - Full port range scanning
 * - Service detection with banners
 * - Fast mode (masscan-style)
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: {
        ports?: {
            preset?: string;
        };
    };
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface PortsFeatureConfig {
    timeout?: number;
    preset?: string;
    fast?: boolean;
    threads?: number;
    intel?: boolean;
}
export interface PortEntry {
    port: number;
    protocol: string;
    state: string;
    service?: string | null;
    banner?: string | null;
    product?: string | null;
}
export interface PortsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    openPorts?: PortEntry[];
    total?: number;
    range?: {
        start: number;
        end: number;
    };
    metadata?: Record<string, any>;
}
export declare class PortsStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: PortsFeatureConfig): Promise<PortsResult>;
    private _buildFlags;
    private _normalizePorts;
    private _normalizePortEntry;
    private _parseRawOutput;
    executeRangeScan(target: Target, startPort: number, endPort: number, featureConfig?: PortsFeatureConfig): Promise<PortsResult>;
}
//# sourceMappingURL=ports-stage.d.ts.map