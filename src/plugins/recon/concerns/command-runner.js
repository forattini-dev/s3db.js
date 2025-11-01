/**
 * CommandRunner
 *
 * Executes CLI commands with:
 * - Availability checking
 * - Timeout handling
 * - Output buffering
 * - Error handling
 */

import { spawn } from 'child_process';

export class CommandRunner {
  constructor() {
    this.availabilityCache = new Map();
  }

  /**
   * Check if a command is available in PATH
   */
  async isAvailable(command) {
    if (this.availabilityCache.has(command)) {
      return this.availabilityCache.get(command);
    }

    const result = await this.run('which', [command], { timeout: 1000 });
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

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

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
  }
}
