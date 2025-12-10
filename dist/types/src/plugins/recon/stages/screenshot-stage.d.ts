/**
 * ScreenshotStage
 *
 * Visual reconnaissance stage.
 *
 * NOTE: This functionality is not currently available in RedBlue.
 * This stage returns 'unavailable' status until screenshot support is added.
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
export interface ScreenshotFeatureConfig {
    timeout?: number;
    width?: number;
    height?: number;
    fullPage?: boolean;
}
export interface ScreenshotResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    url: string;
    screenshot?: string;
    metadata?: Record<string, any>;
}
export declare class ScreenshotStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: ScreenshotFeatureConfig): Promise<ScreenshotResult>;
    private _buildUrl;
}
//# sourceMappingURL=screenshot-stage.d.ts.map