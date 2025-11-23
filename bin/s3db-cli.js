#!/usr/bin/env node

import { Command } from 'commander';
import { S3db } from '../src/index.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('s3db')
  .description('S3DB CLI - Transform AWS S3 into a powerful document database')
  .version(packageJson.version);

// Helper to get database connection
function getConnection(options) {
  const connectionString = options.connection || process.env.S3DB_CONNECTION;
  if (!connectionString) {
    console.error(chalk.red('Error: No connection string provided'));
    console.error(chalk.yellow('Use --connection or set S3DB_CONNECTION environment variable'));
    console.error(chalk.gray('Example: s3db --connection s3://KEY:SECRET@bucket/database'));
    process.exit(1);
  }
  return connectionString;
}

// List resources
program
  .command('list')
  .description('List all resources in the database')
  .option('-c, --connection <string>', 'S3 connection string')
  .action(async (options) => {
    const spinner = ora('Connecting to S3DB...').start();
    let db;
    
    try {
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      const resources = await db.listResources();
      spinner.stop();
      
      if (resources.length === 0) {
        console.log(chalk.yellow('No resources found'));
      } else {
        const table = new Table({
          head: ['Resource', 'Behavior', 'Timestamps', 'Paranoid'],
          style: { head: ['cyan'] }
        });
        
        resources.forEach(r => {
          table.push([
            r.name,
            r.config.behavior || 'user-managed',
            r.config.timestamps ? '✓' : '✗',
            r.config.paranoid ? '✓' : '✗'
          ]);
        });
        
        console.log(table.toString());
      }
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

// Query resource
program
  .command('query <resource>')
  .description('Query records from a resource')
  .option('-c, --connection <string>', 'S3 connection string')
  .option('-l, --limit <number>', 'Limit results', '10')
  .option('--json', 'Output as JSON')
  .action(async (resourceName, options) => {
    const spinner = ora('Querying...').start();
    let db;
    
    try {
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      const resource = await db.resource(resourceName);
      const results = await resource.list({
        limit: parseInt(options.limit)
      });
      
      spinner.stop();
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        if (results.length === 0) {
          console.log(chalk.yellow('No results found'));
        } else {
          const headers = Object.keys(results[0]);
          const table = new Table({
            head: headers,
            style: { head: ['cyan'] }
          });
          
          results.forEach(row => {
            table.push(headers.map(h => {
              const val = row[h];
              if (val === null || val === undefined) return '';
              if (typeof val === 'object') return JSON.stringify(val);
              const str = String(val);
              return str.length > 50 ? str.substring(0, 47) + '...' : str;
            }));
          });
          
          console.log(table.toString());
        }
      }
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

// Insert record
program
  .command('insert <resource>')
  .description('Insert a record into a resource')
  .option('-c, --connection <string>', 'S3 connection string')
  .option('-d, --data <json>', 'Data as JSON string')
  .option('-f, --file <path>', 'Read data from JSON file')
  .action(async (resourceName, options) => {
    const spinner = ora('Inserting...').start();
    let db;
    
    try {
      let data;
      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        data = JSON.parse(content);
      } else if (options.data) {
        data = JSON.parse(options.data);
      } else {
        spinner.fail('No data provided. Use --data or --file');
        process.exit(1);
      }
      
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      const resource = await db.resource(resourceName);
      const result = await resource.insert(data);
      
      spinner.succeed(chalk.green(`✓ Inserted with ID: ${result.id}`));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

// Get record
program
  .command('get <resource> <id>')
  .description('Get a record by ID')
  .option('-c, --connection <string>', 'S3 connection string')
  .action(async (resourceName, id, options) => {
    const spinner = ora('Fetching...').start();
    let db;
    
    try {
      const { S3db } = await import('../src/index.js');
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      const resource = await db.resource(resourceName);
      const result = await resource.get(id);
      
      spinner.stop();
      
      if (result) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.yellow(`Record ${id} not found`));
      }
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

// Delete record
program
  .command('delete <resource> <id>')
  .description('Delete a record by ID')
  .option('-c, --connection <string>', 'S3 connection string')
  .action(async (resourceName, id, options) => {
    const spinner = ora('Deleting...').start();
    let db;
    
    try {
      const { S3db } = await import('../src/index.js');
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      const resource = await db.resource(resourceName);
      await resource.delete(id);
      
      spinner.succeed(chalk.green(`✓ Deleted ID: ${id}`));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

// Count records
program
  .command('count <resource>')
  .description('Count records in a resource')
  .option('-c, --connection <string>', 'S3 connection string')
  .action(async (resourceName, options) => {
    const spinner = ora('Counting...').start();
    let db;
    
    try {
      const { S3db } = await import('../src/index.js');
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      const resource = await db.resource(resourceName);
      const count = await resource.count();
      
      spinner.stop();
      console.log(chalk.cyan(`Total records in ${resourceName}: ${count}`));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

// Create backup
program
  .command('backup [type]')
  .description('Create a database backup')
  .option('-c, --connection <string>', 'S3 connection string')
  .option('-t, --type <type>', 'Backup type: full, incremental (default: full)', 'full')
  .option('-r, --resources <list>', 'Comma-separated list of resources to backup (default: all)')
  .option('--list', 'List available backups')
  .option('--status <backupId>', 'Get status of a specific backup')
  .action(async (type = 'full', options) => {
    const spinner = ora('Connecting to S3DB...').start();
    let db;
    
    try {
      const { S3db } = await import('../src/index.js');
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      // Check if backup plugin is available
      const backupPlugin = db.pluginRegistry?.backup;
      if (!backupPlugin) {
        spinner.fail(chalk.red('BackupPlugin is not installed. Cannot create backups without backup plugin.'));
        process.exit(1);
      }
      
      // List backups if requested
      if (options.list) {
        spinner.text = 'Listing available backups...';
        const backups = await backupPlugin.listBackups({ limit: 20 });
        spinner.stop();
        
        if (backups.length === 0) {
          console.log(chalk.yellow('No backups found'));
        } else {
          const table = new Table({
            head: ['Backup ID', 'Type', 'Status', 'Size', 'Duration', 'Created'],
            style: { head: ['cyan'] }
          });
          
          backups.forEach(backup => {
            const createdAt = new Date(backup.timestamp).toLocaleString();
            const size = backup.size ? `${(backup.size / 1024 / 1024).toFixed(2)} MB` : 'N/A';
            const duration = backup.duration ? `${(backup.duration / 1000).toFixed(1)}s` : 'N/A';
            
            table.push([
              backup.id,
              backup.type || 'full',
              backup.status === 'completed' ? '✓' : backup.status,
              size,
              duration,
              createdAt
            ]);
          });
          
          console.log(table.toString());
        }
        return;
      }
      
      // Get backup status if requested
      if (options.status) {
        spinner.text = 'Getting backup status...';
        const backup = await backupPlugin.getBackupStatus(options.status);
        spinner.stop();
        
        if (!backup) {
          console.log(chalk.red(`Backup '${options.status}' not found`));
          return;
        }
        
        console.log(chalk.cyan('Backup Status:'));
        console.log(`  ID: ${backup.id}`);
        console.log(`  Type: ${backup.type}`);
        console.log(`  Status: ${backup.status === 'completed' ? '✓ ' + backup.status : backup.status}`);
        console.log(`  Created: ${new Date(backup.timestamp).toLocaleString()}`);
        console.log(`  Size: ${backup.size ? `${(backup.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}`);
        console.log(`  Duration: ${backup.duration ? `${(backup.duration / 1000).toFixed(1)}s` : 'N/A'}`);
        console.log(`  Resources: ${Array.isArray(backup.resources) ? backup.resources.join(', ') : 'N/A'}`);
        console.log(`  Compressed: ${backup.compressed ? '✓' : '✗'}`);
        console.log(`  Encrypted: ${backup.encrypted ? '✓' : '✗'}`);
        
        if (backup.error) {
          console.log(chalk.red(`  Error: ${backup.error}`));
        }
        
        return;
      }
      
      // Validate backup type
      if (!['full', 'incremental'].includes(type)) {
        spinner.fail(chalk.red(`Invalid backup type '${type}'. Must be 'full' or 'incremental'`));
        process.exit(1);
      }
      
      // Parse resources list
      let resourcesToBackup = null;
      if (options.resources) {
        resourcesToBackup = options.resources.split(',').map(r => r.trim());
      }
      
      spinner.text = `Creating ${type} backup...`;
      
      // Create backup
      const startTime = Date.now();
      const result = await backupPlugin.backup(type, {
        resources: resourcesToBackup
      });
      const duration = Date.now() - startTime;
      
      spinner.succeed(chalk.green(`✓ ${type} backup created successfully`));
      
      console.log(chalk.green('\nBackup Summary:'));
      console.log(`  Backup ID: ${result.id}`);
      console.log(`  Type: ${result.type}`);
      console.log(`  Size: ${result.size ? `${(result.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}`);
      console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
      console.log(`  Destinations: ${result.destinations.length}`);
      console.log(`  Checksum: ${result.checksum ? result.checksum.substring(0, 16) + '...' : 'N/A'}`);
      
      if (resourcesToBackup) {
        console.log(`  Resources: ${resourcesToBackup.join(', ')}`);
      }
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

// Restore from backup
program
  .command('restore <backupId>')
  .description('Restore database from a backup')
  .option('-c, --connection <string>', 'S3 connection string')
  .option('--overwrite', 'Overwrite existing records', false)
  .option('-r, --resources <list>', 'Comma-separated list of resources to restore (default: all)')
  .option('--list-backups', 'List available backups before restoring')
  .action(async (backupId, options) => {
    const spinner = ora('Connecting to S3DB...').start();
    let db;
    
    try {
      const { S3db } = await import('../src/index.js');
      db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.connect();
      
      // Check if backup plugin is available
      const backupPlugin = db.pluginRegistry?.backup;
      if (!backupPlugin) {
        spinner.fail(chalk.red('BackupPlugin is not installed. Cannot restore without backup plugin.'));
        process.exit(1);
      }
      
      // List backups if requested
      if (options.listBackups) {
        spinner.text = 'Listing available backups...';
        const backups = await backupPlugin.listBackups({ limit: 20 });
        spinner.stop();
        
        if (backups.length === 0) {
          console.log(chalk.yellow('No backups found'));
        } else {
          const table = new Table({
            head: ['Backup ID', 'Type', 'Status', 'Size', 'Created', 'Resources'],
            style: { head: ['cyan'] }
          });
          
          backups.forEach(backup => {
            const createdAt = new Date(backup.timestamp).toLocaleString();
            const size = backup.size ? `${(backup.size / 1024 / 1024).toFixed(2)} MB` : 'N/A';
            const resources = Array.isArray(backup.resources) ? backup.resources.join(', ') : 'N/A';
            
            table.push([
              backup.id,
              backup.type || 'full',
              backup.status === 'completed' ? '✓' : backup.status,
              size,
              createdAt,
              resources.length > 50 ? resources.substring(0, 47) + '...' : resources
            ]);
          });
          
          console.log(table.toString());
          console.log(chalk.gray(`\nUse: s3db restore <backupId> to restore from a backup`));
        }
        return;
      }
      
      // Parse resources list
      let resourcesToRestore = null;
      if (options.resources) {
        resourcesToRestore = options.resources.split(',').map(r => r.trim());
      }
      
      // Get backup info first
      spinner.text = 'Checking backup...';
      const backup = await backupPlugin.getBackupStatus(backupId);
      
      if (!backup) {
        spinner.fail(chalk.red(`Backup '${backupId}' not found`));
        return;
      }
      
      if (backup.status !== 'completed') {
        spinner.fail(chalk.red(`Backup '${backupId}' is not in completed status (current: ${backup.status})`));
        return;
      }
      
      // Show backup info
      spinner.stop();
      console.log(chalk.cyan('Backup Information:'));
      console.log(`  ID: ${backup.id}`);
      console.log(`  Type: ${backup.type}`);
      console.log(`  Created: ${new Date(backup.timestamp).toLocaleString()}`);
      console.log(`  Size: ${backup.size ? `${(backup.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}`);
      console.log(`  Resources: ${Array.isArray(backup.resources) ? backup.resources.join(', ') : 'N/A'}`);
      console.log(`  Compressed: ${backup.compressed ? '✓' : '✗'}`);
      console.log(`  Encrypted: ${backup.encrypted ? '✓' : '✗'}`);
      
      if (resourcesToRestore) {
        console.log(`  Restoring only: ${resourcesToRestore.join(', ')}`);
      }
      
      if (options.overwrite) {
        console.log(chalk.yellow('  ⚠️  Overwrite mode enabled - existing records will be replaced'));
      }
      
      console.log('');
      
      // Start restore
      const restoreSpinner = ora('Restoring from backup...').start();
      
      const result = await backupPlugin.restore(backupId, {
        overwrite: options.overwrite,
        resources: resourcesToRestore
      });
      
      restoreSpinner.succeed(chalk.green(`✓ Restore completed successfully`));
      
      console.log(chalk.green('\nRestore Summary:'));
      console.log(`  Backup ID: ${result.backupId}`);
      console.log(`  Resources restored: ${result.restored.join(', ')}`);
      console.log(`  Total resources: ${result.restored.length}`);
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      if (db) await db.disconnect();
      process.exit(process.exitCode || 0);
    }
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}