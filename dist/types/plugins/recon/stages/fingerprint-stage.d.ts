/**
 * FingerprintStage
 *
 * Web technology fingerprinting using RedBlue:
 * - Framework/CMS detection
 * - Server technology identification
 * - JavaScript library detection
 * - Version detection
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
export interface FingerprintFeatureConfig {
    timeout?: number;
    intel?: boolean;
}
export interface Technology {
    name: string;
    version?: string | null;
    category: string;
    confidence?: number | null;
}
export interface FingerprintData {
    technologies: Technology[];
    server: string | null;
    framework: string | null;
    cms?: string | null;
    headers?: Record<string, string>;
    cookies?: string[];
}
export interface FingerprintResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    url?: string;
    technologies?: Technology[];
    server?: string | null;
    framework?: string | null;
    cms?: string | null;
    headers?: Record<string, string>;
    cookies?: string[];
    metadata?: Record<string, any>;
}
export declare class FingerprintStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: FingerprintFeatureConfig): Promise<FingerprintResult>;
    private _buildUrl;
    private _normalizeFingerprint;
    private _normalizeTech;
    private _parseRawFingerprint;
}
//# sourceMappingURL=fingerprint-stage.d.ts.map