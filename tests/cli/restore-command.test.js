import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { BackupPlugin } from '../../src/plugins/backup.plugin.js';
import { spawn } from 'child_process';
import path from 'path';

describe('CLI Backup & Restore Commands', () => {
  let database;
  let backupPlugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=cli/restore');
    await database.connect();
    
    // Setup backup plugin (new driver API)
    backupPlugin = new BackupPlugin({
      driver: 'filesystem',
      config: {
        path: './tmp/backups/{date}/'
      },
      compression: 'gzip',
      verbose: false
    });
    
    await database.usePlugin(backupPlugin);
  });

  afterEach(async () => {
    if (backupPlugin) {
      await backupPlugin.cleanup();
    }
    if (database) {
      await database.disconnect();
    }
  });

  test('should show backup and restore commands in help', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.stdout).toContain('backup [options] [type]');
    expect(result.stdout).toContain('Create a database backup');
    expect(result.stdout).toContain('restore [options] <backupId>');
    expect(result.stdout).toContain('Restore database from a backup');
  });

  test('should show backup command help', async () => {
    const result = await runCLI(['backup', '--help']);
    
    expect(result.stdout).toContain('Usage: s3db backup [options] [type]');
    expect(result.stdout).toContain('--list');
    expect(result.stdout).toContain('--status <backupId>');
    expect(result.stdout).toContain('-r, --resources <list>');
    expect(result.stdout).toContain('-t, --type <type>');
  });

  test('should show restore command help', async () => {
    const result = await runCLI(['restore', '--help']);
    
    expect(result.stdout).toContain('Usage: s3db restore [options] <backupId>');
    expect(result.stdout).toContain('--overwrite');
    expect(result.stdout).toContain('--list-backups');
    expect(result.stdout).toContain('-r, --resources <list>');
  });

  test('should handle missing connection string', async () => {
    const result = await runCLI(['restore', 'backup_123']);
    
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Error: No connection string provided');
  });

  test('should handle missing backup ID gracefully', async () => {
    const result = await runCLI(['restore', 'non-existent-backup', '--connection', 'test://test']);
    
    expect(result.code).toBe(1);
    // The command should fail but not crash
  });

  // Helper function to run CLI commands
  async function runCLI(args) {
    const cliPath = path.join(process.cwd(), 'bin', 's3db-cli.js');
    
    return new Promise((resolve) => {
      const child = spawn('node', [cliPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        child.kill();
        resolve({ code: -1, stdout, stderr: 'Timeout' });
      }, 10000);
    });
  }
});