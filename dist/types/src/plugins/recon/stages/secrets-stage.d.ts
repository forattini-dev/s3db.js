/**
 * SecretsStage
 *
 * Secrets detection stage.
 *
 * NOTE: This functionality is not currently available in RedBlue.
 * This stage returns 'unavailable' status until secrets scanning support is added.
 *
 * For secrets detection, use dedicated tools:
 * - Gitleaks (https://github.com/gitleaks/gitleaks)
 * - TruffleHog (https://github.com/trufflesecurity/trufflehog)
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
export interface SecretsFeatureConfig {
    timeout?: number;
    depth?: number;
    patterns?: string[];
}
export interface SecretFinding {
    type: string;
    severity: 'high' | 'medium' | 'low';
    file?: string;
    line?: number;
    match?: string;
    description?: string;
}
export interface SecretsSummary {
    total: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
}
export interface SecretsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    host: string;
    findings: SecretFinding[];
    summary: SecretsSummary;
    metadata?: Record<string, any>;
}
export declare class SecretsStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: SecretsFeatureConfig): Promise<SecretsResult>;
}
//# sourceMappingURL=secrets-stage.d.ts.map