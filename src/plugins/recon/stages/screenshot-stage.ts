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

export class ScreenshotStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: ScreenshotFeatureConfig = {}): Promise<ScreenshotResult> {
    return {
      status: 'unavailable',
      message: 'Screenshot capture is not available in RedBlue. Use dedicated tools like aquatone or EyeWitness directly.',
      url: this._buildUrl(target)
    };
  }

  private _buildUrl(target: Target): string {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== (protocol === 'http' ? 80 : 443)
      ? `:${target.port}`
      : '';
    return `${protocol}://${target.host}${port}${target.path || ''}`;
  }
}
