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
    
    try {
      const db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.init();
      
      const resources = await db.listResources();
      spinner.stop();
      
      if (resources.length === 0) {
        console.log(chalk.yellow('No resources found'));
        return;
      }
      
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
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
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
    
    try {
      const db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.init();
      
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
          return;
        }
        
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
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
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
      
      const db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.init();
      
      const resource = await db.resource(resourceName);
      const result = await resource.insert(data);
      
      spinner.succeed(chalk.green(`✓ Inserted with ID: ${result.id}`));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Get record
program
  .command('get <resource> <id>')
  .description('Get a record by ID')
  .option('-c, --connection <string>', 'S3 connection string')
  .action(async (resourceName, id, options) => {
    const spinner = ora('Fetching...').start();
    
    try {
      const db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.init();
      
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
      process.exit(1);
    }
  });

// Delete record
program
  .command('delete <resource> <id>')
  .description('Delete a record by ID')
  .option('-c, --connection <string>', 'S3 connection string')
  .action(async (resourceName, id, options) => {
    const spinner = ora('Deleting...').start();
    
    try {
      const db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.init();
      
      const resource = await db.resource(resourceName);
      await resource.delete(id);
      
      spinner.succeed(chalk.green(`✓ Deleted ID: ${id}`));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Count records
program
  .command('count <resource>')
  .description('Count records in a resource')
  .option('-c, --connection <string>', 'S3 connection string')
  .action(async (resourceName, options) => {
    const spinner = ora('Counting...').start();
    
    try {
      const db = new S3db({ 
        connectionString: getConnection(options) 
      });
      await db.init();
      
      const resource = await db.resource(resourceName);
      const count = await resource.count();
      
      spinner.stop();
      console.log(chalk.cyan(`Total records in ${resourceName}: ${count}`));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}