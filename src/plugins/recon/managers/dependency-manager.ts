/**
 * DependencyManager
 *
 * Validates RedBlue (rb) availability:
 * - Single binary check (replaces ~30 individual tools)
 * - Provides installation guidance
 * - Emits warnings if rb is not found
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
  emit(event: string, data: any): void;
}

export interface DependencyWarning {
  tool: string;
  message: string;
  installGuide: string;
}

export interface DependencyCheckResult {
  available: number;
  missing: number;
  availableTools: string[];
  missingTools: string[];
  warnings: DependencyWarning[];
}

export interface ToolStatus {
  available: boolean;
  required: boolean;
  description: string;
}

export class DependencyManager {
  private plugin: ReconPlugin;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
  }

  async checkAll(): Promise<DependencyWarning[]> {
    const warnings: DependencyWarning[] = [];
    const runner = this.plugin.commandRunner;
    const isAvailable = await runner.isRedBlueAvailable();

    if (!isAvailable) {
      const warning: DependencyWarning = {
        tool: 'rb',
        message: 'RedBlue (rb) not found in PATH. All reconnaissance features require RedBlue.',
        installGuide: this._getInstallGuide()
      };

      warnings.push(warning);

      this.plugin.emit('recon:dependency-missing', warning);
    }

    this.plugin.emit('recon:dependencies-checked', {
      available: isAvailable ? 1 : 0,
      missing: isAvailable ? 0 : 1,
      availableTools: isAvailable ? ['rb'] : [],
      missingTools: isAvailable ? [] : ['rb'],
      warnings
    } as DependencyCheckResult);

    return warnings;
  }

  async checkTool(toolName: string): Promise<boolean> {
    if (toolName === 'rb' || toolName === 'redblue') {
      return await this.plugin.commandRunner.isRedBlueAvailable();
    }
    return false;
  }

  async getToolStatus(): Promise<Record<string, ToolStatus>> {
    const isAvailable = await this.plugin.commandRunner.isRedBlueAvailable();
    return {
      rb: {
        available: isAvailable,
        required: true,
        description: 'RedBlue - All-in-one security reconnaissance tool'
      }
    };
  }

  private _getInstallGuide(): string {
    return `RedBlue Installation:

  Option 1 - Cargo (Rust):
    cargo install redblue

  Option 2 - Download binary:
    Visit https://github.com/user/redblue/releases
    Download the binary for your platform
    Move to ~/.local/bin/ or /usr/local/bin/

  Option 3 - Build from source:
    git clone https://github.com/user/redblue.git
    cd redblue
    cargo build --release
    cp target/release/rb ~/.local/bin/

  Verify installation:
    rb --version`;
  }
}
