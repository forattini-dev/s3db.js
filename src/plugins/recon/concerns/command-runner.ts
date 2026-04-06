/**
 * CommandRunner
 *
 * Executes RedBlue CLI commands via the redblue-cli SDK:
 * - Lazy-loads the SDK (optional peer dependency)
 * - Binary resolved automatically (postinstall downloads to node_modules)
 * - Typed domain proxy: client.dns.record.all({ target })
 * - Fallback to raw exec for system commands (dig, etc.)
 */

import { spawn, type SpawnOptions } from 'child_process';
import { createLogger } from '../../../concerns/logger.js';

const logger = createLogger({ name: 'recon-command-runner' });

export interface CommandOptions {
  timeout?: number;
  flags?: Record<string, any>;
  args?: (string | number)[];
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
  private _client: any = null;
  private _clientPromise: Promise<any> | null = null;
  private _available: boolean | null = null;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
  }

  async getClient(): Promise<any> {
    if (this._client) return this._client;
    if (this._clientPromise) return this._clientPromise;

    this._clientPromise = this._initClient();
    try {
      this._client = await this._clientPromise;
      return this._client;
    } catch (error) {
      this._clientPromise = null;
      throw error;
    }
  }

  private async _initClient(): Promise<any> {
    try {
      const sdk = await import('redblue-cli');
      const createClient = sdk.createClient || sdk.default?.createClient;

      if (!createClient) {
        throw new Error('redblue-cli does not export createClient');
      }

      const client = await createClient();

      this._available = true;
      logger.debug('redblue-cli client initialized');
      return client;
    } catch (error: any) {
      this._available = false;
      logger.warn({ err: error }, 'Failed to initialize redblue-cli client');
      throw error;
    }
  }

  async isRedBlueAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;

    try {
      await this.getClient();
      return true;
    } catch {
      return false;
    }
  }

  async runRedBlue(
    domain: string,
    resource: string,
    verb: string,
    target: string,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    const fullCommand = `rb ${domain} ${resource} ${verb} ${target}`;
    const timeout = options.timeout || this.plugin.config.timeout?.default || 60000;

    let client: any;
    try {
      client = await this.getClient();
    } catch {
      return {
        status: 'unavailable',
        error: 'RedBlue (rb) is not available. Install with: pnpm add redblue-cli',
        metadata: {
          command: fullCommand,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }

    const route = client[domain]?.[resource]?.[verb];

    if (!route) {
      return {
        status: 'error',
        error: `Unknown command: ${domain} ${resource} ${verb}`,
        metadata: {
          command: fullCommand,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }

    try {
      const input: Record<string, any> = { target };

      if (options.flags) {
        Object.assign(input, options.flags);
      }

      if (options.args) {
        input.args = options.args.map(String);
      }

      if (options.cwd) {
        input.cwd = options.cwd;
      }

      const data = await route(input, { timeout });

      return {
        status: 'ok',
        data,
        metadata: {
          command: fullCommand,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (error.message?.includes('timeout') || duration >= timeout) {
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
        exitCode: error.code,
        raw: error.stdout,
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
