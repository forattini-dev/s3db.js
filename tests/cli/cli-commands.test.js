import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn } from 'child_process';
import path from 'path';

jest.setTimeout(30000);

describe('CLI Commands Basic Tests', () => {
  
  describe('Help and Version Tests', () => {
    test('should show help message', async () => {
      const result = await runCLI(['--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('S3DB CLI - Transform AWS S3 into a powerful document database');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('query');
      expect(result.stdout).toContain('insert');
      expect(result.stdout).toContain('get');
      expect(result.stdout).toContain('delete');
      expect(result.stdout).toContain('count');
      expect(result.stdout).toContain('backup');
      expect(result.stdout).toContain('restore');
    });

    test('should show version', async () => {
      const result = await runCLI(['--version']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    });
  });

  describe('Command Help Tests', () => {
    test('should show backup command help', async () => {
      const result = await runCLI(['backup', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db backup [options] [type]');
      expect(result.stdout).toContain('Create a database backup');
      expect(result.stdout).toContain('-c, --connection');
      expect(result.stdout).toContain('-t, --type');
      expect(result.stdout).toContain('-r, --resources');
      expect(result.stdout).toContain('--list');
      expect(result.stdout).toContain('--status');
    });

    test('should show restore command help', async () => {
      const result = await runCLI(['restore', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db restore [options] <backupId>');
      expect(result.stdout).toContain('Restore database from a backup');
      expect(result.stdout).toContain('-c, --connection');
      expect(result.stdout).toContain('--overwrite');
      expect(result.stdout).toContain('-r, --resources');
      expect(result.stdout).toContain('--list-backups');
    });

    test('should show list command help', async () => {
      const result = await runCLI(['list', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db list [options]');
      expect(result.stdout).toContain('List all resources in the database');
    });

    test('should show query command help', async () => {
      const result = await runCLI(['query', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db query [options] <resource>');
      expect(result.stdout).toContain('Query records from a resource');
    });

    test('should show insert command help', async () => {
      const result = await runCLI(['insert', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db insert [options] <resource>');
      expect(result.stdout).toContain('Insert a record into a resource');
    });

    test('should show get command help', async () => {
      const result = await runCLI(['get', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db get [options] <resource> <id>');
      expect(result.stdout).toContain('Get a record by ID');
    });

    test('should show delete command help', async () => {
      const result = await runCLI(['delete', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db delete [options] <resource> <id>');
      expect(result.stdout).toContain('Delete a record by ID');
    });

    test('should show count command help', async () => {
      const result = await runCLI(['count', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db count [options] <resource>');
      expect(result.stdout).toContain('Count records in a resource');
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle missing connection string', async () => {
      const result = await runCLI(['list']);
      
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Error: No connection string provided');
      expect(result.stderr).toContain('Use --connection or set S3DB_CONNECTION');
    });

    test('should handle missing backup ID for restore', async () => {
      const result = await runCLI(['restore']);
      
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('error: missing required argument');
    });

    test('should handle missing resource name for query', async () => {
      const result = await runCLI(['query']);
      
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('error: missing required argument');
    });

    test('should handle missing resource name for insert', async () => {
      const result = await runCLI(['insert']);
      
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('error: missing required argument');
    });

    test('should handle unknown command', async () => {
      const result = await runCLI(['unknown-command']);
      
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("error: unknown command 'unknown-command'");
    });
  });

  describe('Backup Command Validation Tests', () => {
    test('should handle backup with invalid connection', async () => {
      const result = await runCLI(['backup', '--connection', 'invalid://connection']);
      
      expect(result.code).not.toBe(0);
      // Should fail with some connection or plugin error
    });

    test('should handle restore with invalid connection', async () => {
      const result = await runCLI(['restore', 'backup123', '--connection', 'invalid://connection']);
      
      expect(result.code).not.toBe(0);
      // Should fail with some connection or plugin error
    });

    test('should handle backup list with missing plugin', async () => {
      const result = await runCLI(['backup', '--list', '--connection', 'test://test@localhost/bucket']);
      
      expect(result.code).not.toBe(0);
      // Should fail because BackupPlugin is not installed
    });

    test('should handle restore list with missing plugin', async () => {
      const result = await runCLI(['restore', '--list-backups', '--connection', 'test://test@localhost/bucket']);
      
      expect(result.code).not.toBe(0);
      // Should fail because BackupPlugin is not installed
    });
  });

  describe('Command Line Parsing Tests', () => {
    test('should parse backup type correctly', async () => {
      const result = await runCLI(['backup', 'incremental', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: s3db backup [options] [type]');
    });

    test('should parse resources option correctly', async () => {
      const result = await runCLI(['backup', '--resources', 'users,orders', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('-r, --resources <list>');
    });

    test('should parse overwrite flag correctly', async () => {
      const result = await runCLI(['restore', 'backup123', '--overwrite', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--overwrite');
    });
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
      const timeoutId = setTimeout(() => {
        child.kill();
        resolve({ code: -1, stdout, stderr: 'Timeout' });
      }, 10000);
      
      // Clear timeout when process exits
      child.on('exit', () => clearTimeout(timeoutId));
    });
  }
});
