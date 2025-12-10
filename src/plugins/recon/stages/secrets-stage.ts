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

export class SecretsStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
  }

  async execute(target: Target, featureConfig: SecretsFeatureConfig = {}): Promise<SecretsResult> {
    return {
      status: 'unavailable',
      message: 'Secrets scanning is not available in RedBlue. Use dedicated tools like Gitleaks or TruffleHog directly.',
      host: target.host,
      findings: [],
      summary: {
        total: 0,
        highSeverity: 0,
        mediumSeverity: 0,
        lowSeverity: 0
      }
    };
  }
}
