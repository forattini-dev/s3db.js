/**
 * CommandRunner
 *
 * Executes CLI commands with:
 * - Availability checking
 * - Timeout handling
 * - Output buffering
 * - Error handling
 * - Automatic process cleanup via ProcessManager
 * - RedBlue CLI integration
 */

import { spawn } from 'child_process';

export class CommandRunner {
  constructor(processManager = null) {
    this.availabilityCache = new Map();
    this.processManager = processManager;
    this.redblueAvailable = null;
  }

  /**
   * Check if a command is available in PATH
   */
  async isAvailable(command) {
    if (this.availabilityCache.has(command)) {
      return this.availabilityCache.get(command);
    }

    // Don't track 'which' processes (they're just checks, not actual work)
    const result = await this.run('which', [command], {
      timeout: 1000,
      trackProcess: false
    });
    const available = result.ok && result.stdout.trim().length > 0;

    this.availabilityCache.set(command, available);
    return available;
  }

  /**
   * Run a command with timeout and buffering
   */
  async run(command, args = [], options = {}) {
    const timeout = options.timeout || 30000;
    const maxBuffer = options.maxBuffer || 1024 * 1024; // 1MB default
    const trackProcess = options.trackProcess !== false; // Default: true

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Track process for automatic cleanup (unless disabled for 'which' checks)
      if (trackProcess && proc.pid && this.processManager) {
        const commandName = `${command} ${args.slice(0, 2).join(' ')}`.substring(0, 50);
        this.processManager.track(proc, { name: commandName });
      }

      let stdout = '';
      let stderr = '';
      let killed = false;
      let timeoutId;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!proc.killed) proc.kill();
      };

      // Set timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          killed = true;
          cleanup();
          resolve({
            ok: false,
            stdout: '',
            stderr: 'Command timed out',
            error: { code: 'TIMEOUT', message: 'Command timed out' }
          });
        }, timeout);
      }

      // Capture stdout
      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > maxBuffer) {
          killed = true;
          cleanup();
          resolve({
            ok: false,
            stdout: stdout.substring(0, maxBuffer),
            stderr: 'Output exceeded maxBuffer',
            error: { code: 'MAXBUFFER', message: 'Output exceeded maxBuffer' }
          });
        }
      });

      // Capture stderr
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > maxBuffer) {
          killed = true;
          cleanup();
          resolve({
            ok: false,
            stdout: '',
            stderr: stderr.substring(0, maxBuffer),
            error: { code: 'MAXBUFFER', message: 'Stderr exceeded maxBuffer' }
          });
        }
      });

      // Handle errors
      proc.on('error', (error) => {
        if (!killed) {
          cleanup();
          resolve({
            ok: false,
            stdout: '',
            stderr: error.message,
            error: { code: error.code || 'ERROR', message: error.message }
          });
        }
      });

      // Handle exit
      proc.on('close', (code) => {
        if (!killed) {
          cleanup();
          resolve({
            ok: code === 0,
            stdout,
            stderr,
            exitCode: code,
            error: code !== 0 ? { code: 'EXITCODE', message: `Command exited with code ${code}` } : null
          });
        }
      });
    });
  }

  /**
   * Clear availability cache
   */
  clearCache() {
    this.availabilityCache.clear();
    this.redblueAvailable = null;
  }

  /**
   * Check if RedBlue (rb) is available
   */
  async isRedBlueAvailable() {
    if (this.redblueAvailable !== null) {
      return this.redblueAvailable;
    }
    this.redblueAvailable = await this.isAvailable('rb');
    return this.redblueAvailable;
  }

  /**
   * Execute a RedBlue command with JSON output
   * @param {string} domain - Command domain (network, dns, web, recon, tls)
   * @param {string} resource - Resource type (ports, record, asset, domain, etc.)
   * @param {string} verb - Action verb (scan, lookup, fingerprint, etc.)
   * @param {string} target - Target host/IP/URL
   * @param {Object} options - Additional options
   * @param {string[]} options.flags - Additional CLI flags
   * @param {number} options.timeout - Command timeout in ms (default: 60000)
   * @param {boolean} options.json - Request JSON output (default: true)
   * @returns {Promise<Object>} Parsed result with status, data, and metadata
   */
  async runRedBlue(domain, resource, verb, target, options = {}) {
    const startTime = Date.now();
    const timeout = options.timeout || 60000;
    const flags = options.flags || [];
    const requestJson = options.json !== false;

    const args = [domain, resource, verb];
    if (target) {
      args.push(target);
    }

    if (requestJson && !flags.includes('-o') && !flags.includes('--output')) {
      args.push('-o', 'json');
    }

    args.push(...flags);

    const command = `rb ${args.join(' ')}`;
    const result = await this.run('rb', args, {
      timeout,
      maxBuffer: 8 * 1024 * 1024
    });

    const duration = Date.now() - startTime;

    if (!result.ok) {
      return {
        status: result.error?.code === 'ENOENT' ? 'unavailable' : 'error',
        error: result.error?.message || result.stderr || 'RedBlue command failed',
        metadata: {
          command,
          duration_ms: duration,
          timestamp: new Date().toISOString(),
          exitCode: result.exitCode
        }
      };
    }

    let data = null;
    const stdout = result.stdout.trim();

    if (requestJson && stdout) {
      try {
        data = JSON.parse(stdout);
      } catch {
        data = { raw: stdout };
      }
    } else {
      data = { raw: stdout };
    }

    const isEmpty = !stdout || stdout === '[]' || stdout === '{}' || stdout === 'null';

    return {
      status: isEmpty ? 'empty' : 'ok',
      data,
      metadata: {
        command,
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    };
  }
}
