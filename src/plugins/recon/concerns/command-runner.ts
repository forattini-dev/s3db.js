/**
 * CommandRunner
 *
 * Executes RedBlue CLI commands:
 * - Unified interface for all rb commands
 * - JSON output parsing
 * - Error handling
 * - Availability detection
 */

import { spawn, type SpawnOptions } from 'child_process';
import { createLogger } from '../../../concerns/logger.js';

const logger = createLogger({ name: 'recon-command-runner' });

export interface CommandOptions {
  timeout?: number;
  flags?: string[];
  cwd?: string;
}

export interface CommandResult {
  status: 'ok' | 'error' | 'unavailable' | 'timeout';
  data?: any;
  raw?: string;
  error?: string;
  exitCode?: number;
  metadata: {
    command: string;
    duration: number;
    timestamp: string;
  };
}

export interface ReconPlugin {
  config: {
    timeout?: {
      default?: number;
    };
  };
}

export class CommandRunner {
  private plugin: ReconPlugin;
  private redBlueAvailable: boolean | null = null;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
  }

  async isRedBlueAvailable(): Promise<boolean> {
    if (this.redBlueAvailable !== null) {
      return this.redBlueAvailable;
    }

    try {
      const result = await this._executeCommand('rb', ['--version'], { timeout: 5000 });
      this.redBlueAvailable = result.exitCode === 0;
    } catch (error) {
      this.redBlueAvailable = false;
    }

    return this.redBlueAvailable;
  }

  async runRedBlue(
    category: string,
    subCategory: string,
    command: string,
    target: string,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();

    const isAvailable = await this.isRedBlueAvailable();
    if (!isAvailable) {
      return {
        status: 'unavailable',
        error: 'RedBlue (rb) is not available in PATH',
        metadata: {
          command: `rb ${category} ${subCategory} ${command} ${target}`,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }

    const args = [category, subCategory, command, target, '--json'];
    if (options.flags && options.flags.length > 0) {
      args.push(...options.flags);
    }

    const timeout = options.timeout || this.plugin.config.timeout?.default || 60000;
    const fullCommand = `rb ${args.join(' ')}`;

    try {
      const result = await this._executeCommand('rb', args, {
        timeout,
        cwd: options.cwd
      });

      const duration = Date.now() - startTime;

      if (result.exitCode !== 0) {
        return {
          status: 'error',
          error: result.stderr || `Command failed with exit code ${result.exitCode}`,
          raw: result.stdout,
          exitCode: result.exitCode,
          metadata: {
            command: fullCommand,
            duration,
            timestamp: new Date().toISOString()
          }
        };
      }

      let data: any = null;
      if (result.stdout) {
        try {
          data = JSON.parse(result.stdout);
        } catch (parseError) {
          data = { raw: result.stdout };
        }
      }

      return {
        status: 'ok',
        data,
        raw: result.stdout,
        exitCode: result.exitCode,
        metadata: {
          command: fullCommand,
          duration,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (error.message?.includes('timeout')) {
        return {
          status: 'timeout',
          error: `Command timed out after ${timeout}ms`,
          metadata: {
            command: fullCommand,
            duration,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        status: 'error',
        error: error.message || 'Unknown error',
        metadata: {
          command: fullCommand,
          duration,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async runSimple(
    command: string,
    args: string[],
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    const fullCommand = `${command} ${args.join(' ')}`;
    const timeout = options.timeout || 30000;

    try {
      const result = await this._executeCommand(command, args, {
        timeout,
        cwd: options.cwd
      });

      const duration = Date.now() - startTime;

      return {
        status: result.exitCode === 0 ? 'ok' : 'error',
        data: result.stdout ? { raw: result.stdout } : null,
        raw: result.stdout,
        error: result.stderr || undefined,
        exitCode: result.exitCode,
        metadata: {
          command: fullCommand,
          duration,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      return {
        status: 'error',
        error: error.message || 'Unknown error',
        metadata: {
          command: fullCommand,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  private _executeCommand(
    command: string,
    args: string[],
    options: { timeout?: number; cwd?: string }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let resolved = false;

      const spawnOptions: SpawnOptions = {
        shell: false
      };

      if (options.cwd) {
        spawnOptions.cwd = options.cwd;
      }

      const proc = spawn(command, args, spawnOptions);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? 1
          });
        }
      });

      proc.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      if (options.timeout) {
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            proc.kill('SIGKILL');
            reject(new Error(`Command timeout after ${options.timeout}ms`));
          }
        }, options.timeout);
      }
    });
  }
}
