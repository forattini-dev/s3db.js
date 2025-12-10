/**
 * LatencyStage
 *
 * Network latency measurement using RedBlue:
 * - ICMP ping with statistics
 * - Traceroute support (when available)
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: {
        ping?: {
            count?: number;
            timeout?: number;
        };
    };
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface LatencyFeatureConfig {
    timeout?: number;
    count?: number;
    interval?: number;
    ping?: boolean;
    traceroute?: boolean;
    traceTimeout?: number;
}
export interface PingMetrics {
    packetsTransmitted: number | null;
    packetsReceived: number | null;
    packetLoss: number | null;
    min: number | null;
    avg: number | null;
    max: number | null;
    stdDev: number | null;
}
export interface PingResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    metrics?: PingMetrics;
    metadata?: Record<string, any>;
}
export interface TracerouteResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    hops?: any[];
    metadata?: Record<string, any>;
}
export interface LatencyResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    ping?: PingResult;
    traceroute?: TracerouteResult;
}
export declare class LatencyStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: LatencyFeatureConfig): Promise<LatencyResult>;
    private _executePing;
    private _executeTrace;
    private _normalizeMetrics;
    private _parseRawPing;
    private _defaultMetrics;
}
//# sourceMappingURL=latency-stage.d.ts.map