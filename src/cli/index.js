#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { S3db } from '../database.class.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const program = new Command();
const configPath = path.join(os.homedir(), '.s3db', 'config.json');

// Helper to load config
async function loadConfig() {
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Helper to save config
async function saveConfig(config) {
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// Connect to database
async function getDatabase(options) {
  const config = await loadConfig();
  const connectionString = options.connection || config.connection || process.env.S3DB_CONNECTION;
  
  if (!connectionString) {
    console.error(chalk.red('No connection string provided. Use --connection or s3db configure'));
    process.exit(1);
  }
  
  return new S3db({ connectionString });
}

program
  .name('s3db')
  .description('S3DB CLI - Transform AWS S3 into a powerful document database')
  .version('9.0.0');

// Configure command
program
  .command('configure')
  .description('Configure S3DB connection')
  .action(async () => {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'connection',
        message: 'Enter S3 connection string:',
        default: 's3://KEY:SECRET@bucket/database'
      },
      {
        type: 'list',
        name: 'defaultBehavior',
        message: 'Default behavior for resources:',
        choices: ['user-managed', 'enforce-limits', 'body-overflow', 'body-only', 'truncate-data'],
        default: 'user-managed'
      }
    ]);
    
    await saveConfig(answers);
    console.log(chalk.green('✓ Configuration saved to ~/.s3db/config.json'));
  });

// List resources
program
  .command('list')
  .description('List all resources')
  .option('-c, --connection <string>', 'Connection string')
  .action(async (options) => {
    const spinner = ora('Connecting to S3DB...').start();
    
    try {
      const db = await getDatabase(options);
      await db.init();
      
      const resources = await db.listResources();
      spinner.stop();
      
      if (resources.length === 0) {
        console.log(chalk.yellow('No resources found'));
        return;
      }
      
      const table = new Table({
        head: ['Resource', 'Behavior', 'Timestamps', 'Paranoid', 'Partitions'],
        style: { head: ['cyan'] }
      });
      
      resources.forEach(r => {
        table.push([
          r.name,
          r.config.behavior || 'user-managed',
          r.config.timestamps ? '✓' : '✗',
          r.config.paranoid ? '✓' : '✗',
          Object.keys(r.config.partitions || {}).length
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
  .description('Query a resource')
  .option('-c, --connection <string>', 'Connection string')
  .option('-l, --limit <number>', 'Limit results', '10')
  .option('-f, --filter <json>', 'Filter as JSON')
  .option('-p, --partition <name>', 'Partition name')
  .option('--csv', 'Output as CSV')
  .option('--json', 'Output as JSON')
  .action(async (resourceName, options) => {
    const spinner = ora('Querying...').start();
    
    try {
      const db = await getDatabase(options);
      await db.init();
      
      const resource = await db.resource(resourceName);
      
      const queryOptions = {
        limit: parseInt(options.limit)
      };
      
      if (options.filter) {
        queryOptions.filter = JSON.parse(options.filter);
      }
      
      if (options.partition) {
        queryOptions.partition = options.partition;
      }
      
      const results = await resource.list(queryOptions);
      spinner.stop();
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else if (options.csv) {
        if (results.length > 0) {
          const headers = Object.keys(results[0]);
          console.log(headers.join(','));
          results.forEach(row => {
            console.log(headers.map(h => JSON.stringify(row[h] || '')).join(','));
          });
        }
      } else {
        // Table output
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
            return String(val).substring(0, 50);
          }));
        });
        
        console.log(table.toString());
      }
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Insert data
program
  .command('insert <resource>')
  .description('Insert data into a resource')
  .option('-c, --connection <string>', 'Connection string')
  .option('-d, --data <json>', 'Data as JSON')
  .option('-f, --file <path>', 'Read data from file')
  .action(async (resourceName, options) => {
    const spinner = ora('Inserting...').start();
    
    try {
      const db = await getDatabase(options);
      await db.init();
      
      const resource = await db.resource(resourceName);
      
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
      
      const result = await resource.insert(data);
      spinner.succeed(chalk.green(`✓ Inserted with ID: ${result.id}`));
      
      if (!options.quiet) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Update data
program
  .command('update <resource> <id>')
  .description('Update a record')
  .option('-c, --connection <string>', 'Connection string')
  .option('-d, --data <json>', 'Data as JSON')
  .action(async (resourceName, id, options) => {
    const spinner = ora('Updating...').start();
    
    try {
      const db = await getDatabase(options);
      await db.init();
      
      const resource = await db.resource(resourceName);
      const data = JSON.parse(options.data || '{}');
      
      const result = await resource.update(id, data);
      spinner.succeed(chalk.green(`✓ Updated ID: ${id}`));
      
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Delete data
program
  .command('delete <resource> <id>')
  .description('Delete a record')
  .option('-c, --connection <string>', 'Connection string')
  .option('--force', 'Force delete (no confirmation)')
  .action(async (resourceName, id, options) => {
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete ${id} from ${resourceName}?`,
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }
    
    const spinner = ora('Deleting...').start();
    
    try {
      const db = await getDatabase(options);
      await db.init();
      
      const resource = await db.resource(resourceName);
      await resource.delete(id);
      
      spinner.succeed(chalk.green(`✓ Deleted ID: ${id}`));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Create resource
program
  .command('create-resource <name>')
  .description('Create a new resource')
  .option('-c, --connection <string>', 'Connection string')
  .option('-s, --schema <json>', 'Schema as JSON')
  .option('-b, --behavior <type>', 'Behavior type', 'user-managed')
  .option('--timestamps', 'Enable timestamps')
  .option('--paranoid', 'Enable soft deletes')
  .action(async (name, options) => {
    const spinner = ora('Creating resource...').start();
    
    try {
      const db = await getDatabase(options);
      await db.init();
      
      const config = {
        name,
        behavior: options.behavior,
        timestamps: options.timestamps,
        paranoid: options.paranoid
      };
      
      if (options.schema) {
        config.attributes = JSON.parse(options.schema);
      }
      
      const resource = await db.createResource(config);
      spinner.succeed(chalk.green(`✓ Created resource: ${name}`));
      
      console.log(JSON.stringify(resource.config, null, 2));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Interactive mode
program
  .command('interactive')
  .description('Interactive REPL mode')
  .option('-c, --connection <string>', 'Connection string')
  .action(async (options) => {
    console.log(chalk.cyan('S3DB Interactive Mode'));
    console.log(chalk.gray('Type "help" for commands, "exit" to quit\n'));
    
    const db = await getDatabase(options);
    await db.init();
    
    const repl = await import('repl');
    const server = repl.start({
      prompt: chalk.green('s3db> '),
      eval: async (cmd, context, filename, callback) => {
        try {
          // Make db available in REPL
          context.db = db;
          
          // Parse commands
          const trimmed = cmd.trim();
          if (trimmed === 'help') {
            console.log(`
Available commands:
  db                    - Database instance
  db.listResources()    - List all resources
  db.resource('name')   - Get a resource
  await ...             - Use await for async operations
  .exit                 - Exit REPL
            `);
            callback(null);
          } else {
            // Default eval
            const result = await eval(cmd);
            callback(null, result);
          }
        } catch (error) {
          callback(error);
        }
      }
    });
    
    server.setupHistory(path.join(os.homedir(), '.s3db', 'history'), () => {});
  });

// Stats command
program
  .command('stats [resource]')
  .description('Show statistics')
  .option('-c, --connection <string>', 'Connection string')
  .action(async (resourceName, options) => {
    const spinner = ora('Gathering stats...').start();
    
    try {
      const db = await getDatabase(options);
      await db.init();
      
      if (resourceName) {
        const resource = await db.resource(resourceName);
        const count = await resource.count();
        spinner.stop();
        
        console.log(chalk.cyan(`\nResource: ${resourceName}`));
        console.log(`Total records: ${count}`);
      } else {
        const resources = await db.listResources();
        spinner.stop();
        
        console.log(chalk.cyan('\nDatabase Statistics'));
        console.log(`Total resources: ${resources.length}`);
        
        if (resources.length > 0) {
          const table = new Table({
            head: ['Resource', 'Count'],
            style: { head: ['cyan'] }
          });
          
          for (const r of resources) {
            const resource = await db.resource(r.name);
            const count = await resource.count();
            table.push([r.name, count]);
          }
          
          console.log(table.toString());
        }
      }
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

program.parse(process.argv);