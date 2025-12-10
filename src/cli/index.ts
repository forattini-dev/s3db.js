#!/usr/bin/env node

/**
 * S3DB CLI - Command Line Interface
 *
 * 🪵 INTENTIONAL CONSOLE USAGE
 * This file uses console.log/error/warn for user-facing CLI output.
 * These calls are NOT migrated to Pino logger as they are designed for
 * terminal interaction and formatted output (chalk, ora, cli-table3).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { S3db } from '../database.class.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { URL } from 'url';
import { CLIOptions, CLIConfig } from '../../src/types/cli.types.js';
import { MigrationManager } from './migration-manager.js';

const program = new Command();
const configPath = path.join(os.homedir(), '.s3db', 'config.json');

// Helper to load config
async function loadConfig(): Promise<CLIConfig> {
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Helper to save config
async function saveConfig(config: CLIConfig): Promise<void> {
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// Helper to detect connection string (ported from legacy CLI)
async function detectConnectionString(): Promise<string | null> {
  const sources = [
    // 1. Environment variable
    async () => process.env.S3DB_CONNECTION_STRING,
    async () => process.env.S3_CONNECTION_STRING,
    async () => process.env.DATABASE_URL,
    
    // 2. AWS credentials from environment
    async () => {
      const key = process.env.AWS_ACCESS_KEY_ID;
      const secret = process.env.AWS_SECRET_ACCESS_KEY;
      const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
      const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
      
      if (key && secret && bucket) {
        return `s3://${key}:${secret}@${bucket}?region=${region}`;
      }
      return null;
    },
    
    // 3. MCP config file
    async () => {
      try {
        const mcpConfigPath = path.join(os.homedir(), '.config', 'mcp', 'config.json');
        try {
          await fs.access(mcpConfigPath);
          const content = await fs.readFile(mcpConfigPath, 'utf-8');
          const config = JSON.parse(content);
          return config.servers?.s3db?.env?.S3DB_CONNECTION_STRING || null;
        } catch {
          return null;
        }
      } catch (e) {
        return null;
      }
    },
    
    // 4. Local .env file
    async () => null
  ];
  
  for (const source of sources) {
    const connectionString = await source();
    if (connectionString) {
      return connectionString;
    }
  }
  
  return null;
}

// Connect to database
async function getDatabase(options: CLIOptions): Promise<S3db> {
  const config = await loadConfig();
  let connectionString = options.connection || config.connection || process.env.S3DB_CONNECTION;

  if (!connectionString) {
    connectionString = (await detectConnectionString()) || undefined;
  }

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

// MCP Server Command
program
  .command('mcp')
  .alias('server')
  .description('Start the S3DB MCP (Model Context Protocol) server')
  .option('-p, --port <port>', 'Port for SSE transport (default: 8000)', '8000')
  .option('-h, --host <host>', 'Host address to bind to (default: 0.0.0.0)', '0.0.0.0')
  .option('-t, --transport <type>', 'Transport type: stdio or sse (default: stdio)', 'stdio')
  .option('-c, --connection <string>', 'S3DB connection string (auto-detected if not provided)')
  .action(async (options) => {
    // Auto-detect connection string if not provided
    let connectionString = options.connection;
    
    if (!connectionString) {
      console.log(chalk.blue('ℹ️  Auto-detecting connection string...'));
      connectionString = (await detectConnectionString()) || undefined;
    }
    
    if (connectionString) {
      console.log(chalk.green('✅ Connection string detected'));
      process.env.S3DB_CONNECTION_STRING = connectionString;
    } else {
      console.log(chalk.yellow('⚠️  No connection string found. Server will start without auto-connection.'));
      console.log(chalk.yellow('   You can connect manually using MCP tools.'));
    }

    try {
      // Import the MCP server entrypoint dynamically
      // We assume the compiled output structure or ts-node execution
      // Try multiple paths to be robust
      const possiblePaths = [
        '../../mcp/entrypoint.js', // Compiled/Run from dist
        '../../mcp/entrypoint.ts', // Run with tsx
        path.resolve(__dirname, '../../mcp/entrypoint.js'),
        path.resolve(__dirname, '../../mcp/entrypoint.ts')
      ];

      let startServer: any = null;

      for (const p of possiblePaths) {
        try {
          const mod = await import(p);
          if (mod.startServer) {
            startServer = mod.startServer;
            break;
          }
        } catch (e) {
          // Ignore and try next
        }
      }

      if (!startServer) {
         // Fallback: try to import from the known location relative to source
         try {
           // @ts-ignore
           const mod = await import('../../../mcp/entrypoint.ts');
           startServer = mod.startServer;
         } catch(e) {
            throw new Error('Could not load MCP server entrypoint. Ensure mcp/ directory is built or accessible.');
         }
      }

      if (startServer) {
        await startServer({
            port: parseInt(options.port),
            host: options.host,
            transport: options.transport
        });
      } else {
         throw new Error('MCP server module found but startServer export is missing.');
      }

    } catch (error: any) {
      console.error(chalk.red(`Failed to start MCP server: ${error.message}`));
      process.exit(1);
    }
  });

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
  .action(async (options: CLIOptions) => {
    const spinner = ora('Connecting to S3DB...').start();

    try {
      const db = await getDatabase(options);
      // db.init() removed as Database constructor handles initialization

      const resources = await db.listResources();
      spinner.stop();

      if (resources.length === 0) {
        console.log(chalk.yellow('No resources found'));
        return;
      }

      const table = new Table({
        head: ['Resource', 'Behavior', 'Timestamps', 'Paranoid', 'Partitions'],
        style: { head: ['cyan'] }
      }) as Table.Table;

      resources.forEach((r: any) => {
        table.push([
          r.name,
          r.behavior || 'user-managed',
          r.timestamps ? '✓' : '✗',
          r.paranoid ? '✓' : '✗',
          Object.keys(r.partitions || {}).length
        ]);
      });

      console.log(table.toString());
    } catch (error: any) {
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
  .action(async (resourceName: string, options: CLIOptions) => {
    const spinner = ora('Querying...').start();

    try {
      const db = await getDatabase(options);

      const resource = await db.getResource(resourceName);

      const queryOptions: any = {
        limit: options.limit ? parseInt(options.limit as any) : 10
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
            const headers = (results.length > 0 && results[0]) ? Object.keys(results[0]) : [];
          console.log(headers.join(','));
          results.forEach((row: any) => {
            console.log(headers.map(h => JSON.stringify(row[h] || '')).join(','));
          });
        }
      } else {
        // Table output
        if (results.length === 0) {
          console.log(chalk.yellow('No results found'));
          return;
        }

          const headers = (results.length > 0 && results[0]) ? Object.keys(results[0]) : [];
        const table = new Table({
          head: headers,
          style: { head: ['cyan'] }
        }) as Table.Table;

        results.forEach((row: any) => {
          table.push(headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val).substring(0, 50);
          }));
        });

        console.log(table.toString());
      }
    } catch (error: any) {
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
  .action(async (resourceName: string, options: CLIOptions) => {
    const spinner = ora('Inserting...').start();

    try {
      const db = await getDatabase(options);

      const resource = await db.getResource(resourceName);

      let data: any;
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

      if (!(options as any).quiet) { // Assuming a quiet option might exist
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error: any) {
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
  .action(async (resourceName: string, id: string, options: CLIOptions) => {
    const spinner = ora('Updating...').start();

    try {
      const db = await getDatabase(options);

      const resource = await db.getResource(resourceName);
      const data = JSON.parse(options.data || '{}');

      const result = await resource.update(id, data);
      spinner.succeed(chalk.green(`✓ Updated ID: ${id}`));

      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
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
  .action(async (resourceName: string, id: string, options: CLIOptions) => {
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

      const resource = await db.getResource(resourceName);
      await resource.delete(id);

      spinner.succeed(chalk.green(`✓ Deleted ID: ${id}`));
    } catch (error: any) {
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
  .action(async (name: string, options: CLIOptions) => {
    const spinner = ora('Creating resource...').start();

    try {
      const db = await getDatabase(options);

      const config: any = { // Use any for config as it's built dynamically
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
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Console command (enhanced REPL)
program
  .command('console')
  .description('Enhanced interactive console')
  .option('-c, --connection <string>', 'Connection string')
  .action(async (options: CLIOptions) => {
    await consoleREPL(options);
  });

// Interactive mode (alias for console)
program
  .command('interactive')
  .description('Interactive REPL mode (alias for console)')
  .option('-c, --connection <string>', 'Connection string')
  .action(async (options: CLIOptions) => {
    await consoleREPL(options);
  });

async function consoleREPL(options: CLIOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n┌─────────────────────────────────────┐'));
  console.log(chalk.cyan.bold('│  S3DB Interactive Console v12.0     │'));
  console.log(chalk.cyan.bold('└─────────────────────────────────────┘\n'));

  const db = await getDatabase(options);

  const resources = await db.listResources();
  console.log(chalk.gray(`Connected to: ${(db.client as any).config.bucket}`));
  console.log(chalk.gray(`Resources: ${resources.length}\n`));

  console.log(chalk.yellow('Quick commands:'));
  console.log(chalk.gray('  .help         - Show all commands'));
  console.log(chalk.gray('  .resources    - List all resources'));
  console.log(chalk.gray('  .use <name>   - Select a resource'));
  console.log(chalk.gray('  .exit         - Exit console\n'));

  const repl = await import('repl');
  // Need to ensure testing/index.js is converted or provide type definitions for Factory and Seeder
  const { Factory, Seeder } = await import('../testing/index.js'); // Assuming '../testing/index.ts' eventually

  // Set up global context
  let currentResource: any = null; // Placeholder for Resource type

  const server = repl.start({
    prompt: chalk.green('s3db> '),
    useColors: true,
    ignoreUndefined: true,
    eval: async (cmd: string, context: any, filename: string, callback: (err: Error | null, result: any) => void) => {
      try {
        const trimmed = cmd.trim().replace(/\n$/, '');

        // Special commands
        if (trimmed === '.help' || trimmed === 'help') {
          console.log(chalk.cyan('\n📖 S3DB Console Commands:\n'));
          console.log(chalk.bold('Database:'));
          console.log('  db                      - Database instance');
          console.log('  db.listResources()      - List all resources');
          console.log('  db.getResource(name)       - Get a resource');
          console.log(chalk.bold('\nResource Selection:'));
          console.log('  .use <name>             - Select active resource');
          console.log('  resource                - Current resource (if selected)');
          console.log(chalk.bold('\nData Operations:'));
          console.log('  await resource.list()   - List records');
          console.log('  await resource.get(id)  - Get record by ID');
          console.log('  await resource.insert({})- Insert record');
          console.log('  await resource.count()  - Count records');
          console.log(chalk.bold('\nTesting:'));
          console.log('  Factory                 - Factory class');
          console.log('  Seeder                  - Seeder class');
          console.log(chalk.bold('\nUtilities:'));
          console.log('  .resources              - List resources');
          console.log('  .clear                  - Clear console');
          console.log('  .exit                   - Exit\n');
          callback(null, undefined);
          return;
        }

        if (trimmed === '.resources') {
          const table = new Table({
            head: ['Resource', 'Behavior', 'Partitions'],
            style: { head: ['cyan'] }
          }) as Table.Table;

          resources.forEach((r: any) => {
            table.push([
              r.name,
              r.behavior || 'user-managed',
              Object.keys(r.partitions || {}).length
            ]);
          });

          console.log(table.toString());
          callback(null, undefined);
          return;
        }

        if (trimmed.startsWith('.use ')) {
          const resourceName = trimmed.replace('.use ', '').trim();
          try {
            currentResource = await db.getResource(resourceName);
            console.log(chalk.green(`✓ Now using resource: ${resourceName}`));
            context.resource = currentResource;
            callback(null, undefined);
          } catch (err: any) {
            console.log(chalk.red(`✗ Resource not found: ${resourceName}`));
            callback(null, undefined);
          }
          return;
        }

        if (trimmed === '.clear') {
          console.clear();
          callback(null, undefined);
          return;
        }

        // Set up context
        context.db = db;
        context.resource = currentResource;
        context.Factory = Factory;
        context.Seeder = Seeder;
        context.chalk = chalk;
        context.Table = Table;

        // Evaluate JavaScript
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction('context', `
          with (context) {
            return (async () => {
              ${trimmed}
            })();
          }
        `);

        const result = await fn(context);
        callback(null, result);

      } catch (error: any) {
        console.log(chalk.red(`Error: ${error.message}`));
        callback(null, undefined);
      }
    }
  });

  // Set up history
  server.setupHistory(path.join(os.homedir(), '.s3db', 'history'), () => {});

  // Set up autocomplete
  server.on('exit', () => {
    console.log(chalk.cyan('\n👋 Bye!\n'));
    process.exit(0);
  });
}

// Stats command
program
  .command('stats [resource]')
  .description('Show statistics')
  .option('-c, --connection <string>', 'Connection string')
  .action(async (resourceName: string | undefined, options: CLIOptions) => {
    const spinner = ora('Gathering stats...').start();

    try {
      const db = await getDatabase(options);

      if (resourceName) {
        const resource = await db.getResource(resourceName);
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
          }) as Table.Table;

          for (const r of resources) {
            const resource = await db.getResource(r.name);
            const count = await resource.count();
            table.push([r.name, count]);
          }

          console.log(table.toString());
        }
      }
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Schema command
program
  .command('schema <resource>')
  .description('Show resource schema')
  .option('-c, --connection <string>', 'Connection string')
  .option('-f, --format <type>', 'Output format: json, typescript, bigquery', 'json')
  .action(async (resourceName: string, options: CLIOptions) => {
    const spinner = ora('Loading schema...').start();

    try {
      const db = await getDatabase(options);

      const resource = await db.getResource(resourceName);
      const schema = resource.export();
      spinner.stop();

      if (options.format === 'typescript') {
        const { generateTypes } = await import('../concerns/typescript-generator.js'); // Assuming this will be ts
        const types = generateTypes(db as any);
        console.log(types);
      } else if (options.format === 'bigquery') {
        console.log(chalk.cyan(`\nBigQuery DDL for ${resourceName}:\n`));
        console.log(`CREATE TABLE acktick>project.dataset.${resourceName}acktick> (
`);

        const fields: string[] = [];
        fields.push('  id STRING NOT NULL');

        for (const [field, type] of Object.entries(schema.attributes)) {
          const typeStr = (type as any).toString(); // Cast to any to get toString()
          let bqType = 'STRING';

          if (typeStr.includes('number')) bqType = 'FLOAT64';
          else if (typeStr.includes('boolean')) bqType = 'BOOL';
          else if (typeStr.includes('array')) bqType = 'ARRAY<STRING>'; // Simplified
          else if (typeStr.includes('object')) bqType = 'JSON';
          else if (typeStr.includes('embedding')) bqType = 'ARRAY<FLOAT64>';

          const required = typeStr.includes('required') ? 'NOT NULL' : '';
          fields.push(`  ${field} ${bqType} ${required}`.trim());
        }

        if (schema.timestamps) {
          fields.push('  createdAt TIMESTAMP');
          fields.push('  updatedAt TIMESTAMP');
        }

        console.log(fields.join(',\n'));
        console.log(');');
      } else {
        // JSON format (default)
        console.log(JSON.stringify(schema, null, 2));
      }
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Schema diff command
program
  .command('schema-diff')
  .description('Compare local schema files with deployed schemas')
  .option('-c, --connection <string>', 'Connection string')
  .option('-d, --dir <path>', 'Local schema directory', './schemas')
  .action(async (options: CLIOptions) => {
    const spinner = ora('Comparing schemas...').start();

    try {
      const db = await getDatabase(options);

      const remoteResources = await db.listResources();
      spinner.stop();

      // Try to load local schemas
      let localSchemas: Record<string, any> = {};
      try {
        const schemaFiles = await fs.readdir(options.dir || './schemas');
        for (const file of schemaFiles) {
          if (file.endsWith('.json')) {
            const content = await fs.readFile(path.join(options.dir || './schemas', file), 'utf-8');
            const schema = JSON.parse(content);
            localSchemas[schema.name] = schema;
          }
        }
      } catch (err: any) {
        console.log(chalk.yellow(`No local schemas found in ${options.dir || './schemas'}`));
      }

      const table = new Table({
        head: ['Resource', 'Status', 'Changes'],
        style: { head: ['cyan'] }
      }) as Table.Table;

      // Check remote resources
      for (const remote of remoteResources) {
        const local = localSchemas[remote.name];

        if (!local) {
          table.push([remote.name, chalk.yellow('Remote Only'), 'Not in local schemas']);
        } else {
          // Compare attributes
          const remoteAttrs = Object.keys(remote.attributes || {}).sort();
          const localAttrs = Object.keys(local.attributes || {}).sort();

          if (JSON.stringify(remoteAttrs) !== JSON.stringify(localAttrs)) {
            const diff = {
              added: localAttrs.filter(a => !remoteAttrs.includes(a)),
              removed: remoteAttrs.filter(a => !localAttrs.includes(a))
            };
            table.push([
              remote.name,
              chalk.yellow('Modified'),
              `+${diff.added.length} -${diff.removed.length} fields`
            ]);
          } else {
            table.push([remote.name, chalk.green('Synced'), 'No changes']);
          }

          delete localSchemas[remote.name];
        }
      }

      // Check local-only schemas
      for (const [name, schema] of Object.entries(localSchemas)) {
        table.push([name, chalk.blue('Local Only'), 'Not deployed']);
      }

      console.log(table.toString());
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Count with aggregation
program
  .command('count <resource>')
  .description('Count records with optional grouping')
  .option('-c, --connection <string>', 'Connection string')
  .option('-b, --by <field>', 'Group by field')
  .option('-p, --partition <name>', 'Partition name')
  .action(async (resourceName: string, options: CLIOptions) => {
    const spinner = ora('Counting...').start();

    try {
      const db = await getDatabase(options);

      const resource = await db.getResource(resourceName);

      if (options.by) {
        // Group by aggregation
        const listOptions = options.partition ? { partition: options.partition } : {};
        const records = await resource.list(listOptions);
        spinner.stop();

        const grouped: Record<string, number> = {};
        for (const record of records) {
          const value = (record as any)[options.by] || '(null)';
          grouped[value] = (grouped[value] || 0) + 1;
        }

        const table = new Table({
          head: [options.by, 'Count'],
          style: { head: ['cyan'] }
        }) as Table.Table;

        Object.entries(grouped)
          .sort((a, b) => b[1] - a[1])
          .forEach(([key, count]) => {
            table.push([key, count]);
          });

        console.log(table.toString());
        console.log(chalk.gray(`\nTotal: ${records.length} records`));
      } else {
        const count = await resource.count();
        spinner.stop();
        console.log(chalk.cyan(`${resourceName}: ${count} records`));
      }
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Explain command
program
  .command('explain <resource>')
  .description('Show partition structure and query plans')
  .option('-c, --connection <string>', 'Connection string')
  .option('-p, --partition <name>', 'Specific partition to explain')
  .action(async (resourceName: string, options: CLIOptions) => {
    const spinner = ora('Analyzing...').start();

    try {
      const db = await getDatabase(options);

      const resource = await db.getResource(resourceName);
      const schema = resource.export();
      spinner.stop();

      console.log(chalk.cyan(`\n📊 Resource: ${resourceName}\n`));

      // Basic info
      console.log(chalk.bold('Configuration:'));
      console.log(`  Behavior: ${schema.behavior || 'user-managed'}`);
      console.log(`  Timestamps: ${schema.timestamps ? '✓' : '✗'}`);
      console.log(`  Paranoid: ${schema.paranoid ? '✓' : '✗'}`);
      console.log(`  Async Partitions: ${(schema as any).asyncPartitions ? '✓' : '✗'}`);

      // Partitions
      if (schema.partitions && Object.keys(schema.partitions).length > 0) {
        console.log(chalk.bold('\nPartitions:'));

        for (const [name, config] of Object.entries(schema.partitions)) {
          if (options.partition && name !== options.partition) continue;

          console.log(chalk.green(`\n  ${name}:`));
          console.log(`    Fields: ${Object.keys((config as any).fields).join(', ')}`);

          // Try to count partition keys
          try {
            const prefix = `resource=${resourceName}/partition=${name}/`;
            const keys = await (resource.client as any).listObjects({ prefix, maxKeys: 1000 });

            // Extract unique partition values
            const values = new Set();
            keys.forEach((key: any) => {
              const parts = key.split('/');
              const valueParts = parts.filter((p: string) => !p.startsWith('resource=') && !p.startsWith('partition=') && !p.startsWith('id='));
              valueParts.forEach((v: string) => values.add(v));
            });

            console.log(`    Unique values: ${values.size}`);
            console.log(`    Total keys: ${keys.length}`);
            console.log(`    Key pattern: ${prefix}<values>/id=<id>`);
          } catch (err: any) {
            console.log(chalk.gray('    (Unable to analyze partition keys)'));
          }
        }
      } else {
        console.log(chalk.yellow('\nNo partitions configured'));
      }

      // Query plan
      console.log(chalk.bold('\n🔍 Query Optimization:'));
      if (schema.partitions && Object.keys(schema.partitions).length > 0) {
        console.log(chalk.green('  ✓ O(1) partition lookups available'));
        console.log('  💡 Use getFromPartition() for best performance');
      } else {
        console.log(chalk.yellow('  ⚠️  O(n) full scans only (no partitions)'));
        console.log('  💡 Consider adding partitions for common queries');
      }

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Analyze command
program
  .command('analyze <resource>')
  .description('Analyze resource performance and storage')
  .option('-c, --connection <string>', 'Connection string')
  .action(async (resourceName: string, options: CLIOptions) => {
    const spinner = ora('Analyzing resource...').start();

    try {
      const db = await getDatabase(options);

      const resource = await db.getResource(resourceName);

      // Get sample records
      const sample = await resource.list({ limit: 100 });
      const count = await resource.count();
      spinner.stop();

      console.log(chalk.cyan(`\n📈 Analysis: ${resourceName}\n`));

      // Record count
      console.log(chalk.bold('Records:'));
      console.log(`  Total: ${count}`);
      console.log(`  Sampled: ${sample.length}`);

      // Size analysis
      if (sample.length > 0) {
        console.log(chalk.bold('\nSize Analysis (from sample):'));

        const sizes = sample.map((r: any) => {
          const str = JSON.stringify(r);
          return Buffer.byteLength(str, 'utf8');
        });

        const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
        const min = Math.min(...sizes);
        const max = Math.max(...sizes);

        console.log(`  Average: ${(avg / 1024).toFixed(2)} KB`);
        console.log(`  Min: ${(min / 1024).toFixed(2)} KB`);
        console.log(`  Max: ${(max / 1024).toFixed(2)} KB`);
        console.log(`  Estimated total: ${((avg * count) / 1024 / 1024).toFixed(2)} MB`);

        // Field analysis
        console.log(chalk.bold('\nField Usage:'));
        const fieldCounts: Record<string, number> = {};
        const fieldSizes: Record<string, number> = {};

        sample.forEach((record: any) => {
          Object.keys(record).forEach(field => {
            fieldCounts[field] = (fieldCounts[field] || 0) + 1;
            const value = record[field];
            if (value !== null && value !== undefined) {
              const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
              fieldSizes[field] = (fieldSizes[field] || 0) + size;
            }
          });
        });

        const table = new Table({
          head: ['Field', 'Fill Rate', 'Avg Size'],
          style: { head: ['cyan'] }
        }) as Table.Table;

        Object.keys(fieldCounts).forEach(field => {
          const fillRate = ((fieldCounts[field]! / sample.length) * 100).toFixed(1);
          const avgSize = fieldSizes[field] ? (fieldSizes[field]! / fieldCounts[field]!) : 0;
          table.push([
            field,
            `${fillRate}%`,
            `${avgSize.toFixed(0)} bytes`
          ]);
        });

        console.log(table.toString());
      }

      // Performance recommendations
      console.log(chalk.bold('\n💡 Recommendations:'));

      const schema = resource.export();
      if (!schema.partitions || Object.keys(schema.partitions).length === 0) {
        console.log(chalk.yellow('  • Add partitions for frequently queried fields'));
      }

      if (count > 1000 && !(schema as any).asyncPartitions) {
        console.log(chalk.yellow('  • Enable asyncPartitions for faster writes'));
      }

      if (sample.length > 0) {
        const avgSize = sample.reduce((sum: number, r: any) => {
          return sum + Buffer.byteLength(JSON.stringify(r), 'utf8');
        }, 0) / sample.length;

        if (avgSize > 2000) {
          console.log(chalk.yellow('  • Consider body-only behavior for large records'));
        }
      }

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Test commands
const test = program.command('test').description('Testing utilities');

test
  .command('seed [resource]')
  .description('Seed database with test data')
  .option('-c, --connection <string>', 'Connection string')
  .option('-n, --count <number>', 'Number of records to create', '10')
  .option('-f, --file <path>', 'Seed from factory definition file')
  .action(async (resourceName: string | undefined, options: CLIOptions) => {
    const spinner = ora('Seeding database...').start();

    try {
      const db = await getDatabase(options);

      // Assuming testing/index.js will be converted or has type definitions
      const { Factory, Seeder } = await import('../testing/index.js');
      Factory.setDatabase(db);

      const seeder = new Seeder(db, { logLevel: 'silent' });

      if (options.file) {
        // Load factory definitions from file
        const factoryModule = await import(path.resolve(options.file));
        spinner.text = 'Running custom seed...';

        const result = await seeder.call(factoryModule.default || factoryModule.seed);
        spinner.succeed(chalk.green('✓ Custom seed completed'));

        console.log(JSON.stringify(result, null, 2));
      } else if (resourceName) {
        // Seed specific resource
        const count = options.count ? parseInt(options.count as any) : 10;
        spinner.text = `Seeding ${count} ${resourceName}...`;

        const factory = Factory.get(resourceName);
        if (!factory) {
          spinner.fail(chalk.red(`No factory found for '${resourceName}'`));
          console.log(chalk.yellow('\n💡 Define a factory first or use --file option'));
          process.exit(1);
        }

        const records = await factory.createMany(count);
        spinner.succeed(chalk.green(`✓ Created ${records.length} ${resourceName}`));

        console.log(chalk.gray(`IDs: ${records.map((r: any) => r.id).slice(0, 5).join(', ')}${records.length > 5 ? '...' : ''}`));
      } else {
        // Seed all resources using factories
        const resources = await db.listResources();
        spinner.stop();

        const specs: Record<string, number> = {};
        for (const r of resources) {
          const factory = Factory.get(r.name);
          if (factory) {
            specs[r.name] = options.count ? parseInt(options.count as any) : 10;
          }
        }

        if (Object.keys(specs).length === 0) {
          console.log(chalk.yellow('No factories defined. Use --file to load factory definitions.'));
          return;
        }

        console.log(chalk.cyan('Seeding with factories:'));
        console.log(specs);

        const created = await seeder.seed(specs);

        console.log(chalk.green('\n✓ Seed completed:'));
        Object.entries(created).forEach(([name, records]: [string, any[]]) => {
          console.log(`  ${name}: ${records.length} records`);
        });
      }
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

test
  .command('setup')
  .description('Setup isolated test database')
  .option('-c, --connection <string>', 'Connection string')
  .option('-n, --name <name>', 'Test database name', `test-${Date.now()}`)
  .option('-f, --fixtures <path>', 'Load fixtures from file')
  .action(async (options: CLIOptions) => {
    const spinner = ora('Setting up test database...').start();

    try {
      // Create test database connection
      const config = await loadConfig();
      let baseConnection = options.connection || config.connection || process.env.S3DB_CONNECTION;

      if (!baseConnection) {
        spinner.fail(chalk.red('No connection string provided'));
        process.exit(1);
      }

      // Modify connection to use test database path
      const url = new URL(baseConnection);
      const originalPath = url.pathname;
      url.pathname = `${originalPath}/${options.name}`;
      const testConnection = url.toString();

      const db = new S3db({ connectionString: testConnection });

      spinner.text = 'Loading fixtures...';

      if (options.fixtures) {
        const fixturesModule = await import(path.resolve(options.fixtures));
        const fixtures = fixturesModule.default || fixturesModule.fixtures;

        if (typeof fixtures === 'function') {
          await fixtures(db);
        } else {
          // Load fixtures as data
          for (const [resourceName, records] of Object.entries(fixtures)) {
            const resource = await db.getResource(resourceName);
            for (const record of (records as any[])) {
              await resource.insert(record);
            }
          }
        }
      }

      spinner.succeed(chalk.green('✓ Test database ready'));

      console.log(chalk.cyan('\nTest Database:'));
      console.log(`  Name: ${options.name}`);
      console.log(`  Connection: ${testConnection}`);
      console.log(chalk.gray('\n💡 Use this connection string for your tests'));
      console.log(chalk.gray(`💡 Teardown with: s3db test teardown --name ${options.name}`));

      // Save test connection for teardown
      const testConfig = { ...config, testConnection, testName: options.name };
      await saveConfig(testConfig);

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

test
  .command('teardown')
  .description('Clean up test database')
  .option('-c, --connection <string>', 'Connection string')
  .option('-n, --name <name>', 'Test database name')
  .option('--all', 'Teardown all test databases')
  .action(async (options: CLIOptions) => {
    const spinner = ora('Cleaning up...').start();

    try {
      const config = await loadConfig();
      let connection = options.connection;

      if (!connection && options.name) {
        const baseConnection = config.connection || process.env.S3DB_CONNECTION;
        if (!baseConnection) {
          spinner.fail(chalk.red('No base connection string found for test database'));
          process.exit(1);
        }
        const url = new URL(baseConnection);
        const originalPath = url.pathname.replace(/\/[^\/]+$/, '');
        url.pathname = `${originalPath}/${options.name}`;
        connection = url.toString();
      } else if (!connection && config.testConnection) {
        connection = config.testConnection;
      }

      if (!connection) {
        spinner.fail(chalk.red('No test database to teardown'));
        process.exit(1);
      }

      const db = new S3db({ connectionString: connection });

      const { Seeder } = await import('../testing/index.js');
      const seeder = new Seeder(db, { logLevel: 'silent' });

      spinner.text = 'Resetting database...';
      await seeder.reset();

      spinner.succeed(chalk.green('✓ Test database cleaned up'));

      // Clean up config
      if (config.testConnection) {
        delete config.testConnection;
        delete config.testName;
        await saveConfig(config);
      }

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

test
  .command('truncate <resource>')
  .description('Delete all data from a resource')
  .option('-c, --connection <string>', 'Connection string')
  .option('--force', 'Skip confirmation')
  .action(async (resourceName: string, options: CLIOptions) => {
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `This will delete ALL data from ${resourceName}. Continue?`,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }

    const spinner = ora(`Truncating ${resourceName}...`).start();

    try {
      const db = await getDatabase(options);

      const { Seeder } = await import('../testing/index.js');
      const seeder = new Seeder(db, { logLevel: 'silent' });

      await seeder.truncate([resourceName]);
      spinner.succeed(chalk.green(`✓ ${resourceName} truncated`));

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

// Migration commands
const migrate = program.command('migrate').description('Database migrations');

migrate
  .command('generate <name>')
  .description('Generate a new migration file')
  .option('-d, --dir <path>', 'Migrations directory', './migrations')
  .action(async (name: string, options: CLIOptions) => {
    const spinner = ora('Generating migration...').start();

    try {
      const manager = new MigrationManager(null, options.dir); // database is null for generate
      const { filename, filepath } = await manager.generate(name);
      spinner.succeed(chalk.green('✓ Migration generated'));

      console.log(chalk.cyan('\nMigration file:'));
      console.log(`  ${filepath}`);
      console.log(chalk.gray('\n💡 Edit the file to add your migration logic'));
      console.log(chalk.gray('💡 Run with: s3db migrate up'));

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

migrate
  .command('up')
  .description('Run pending migrations')
  .option('-c, --connection <string>', 'Connection string')
  .option('-d, --dir <path>', 'Migrations directory', './migrations')
  .option('-s, --step <number>', 'Number of migrations to run')
  .action(async (options: CLIOptions) => {
    const spinner = ora('Running migrations...').start();

    try {
      const db = await getDatabase(options);

      const manager = new MigrationManager(db, options.dir);
      await manager.init();

      const step = options.step ? parseInt(options.step as any) : null;
      const result = await manager.up({ step });

      spinner.succeed(chalk.green(`✓ ${result.message}`));

      if (result.migrations.length > 0) {
        console.log(chalk.cyan('\nMigrations executed:'));
        result.migrations.forEach(m => console.log(`  • ${m}`));
        console.log(chalk.gray(`\nBatch: ${result.batch}`));
      }

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

migrate
  .command('down')
  .description('Rollback migrations')
  .option('-c, --connection <string>', 'Connection string')
  .option('-d, --dir <path>', 'Migrations directory', './migrations')
  .option('-s, --step <number>', 'Number of migrations to rollback', '1')
  .action(async (options: CLIOptions) => {
    const spinner = ora('Rolling back migrations...').start();

    try {
      const db = await getDatabase(options);

      const manager = new MigrationManager(db, options.dir);
      await manager.init();

      const step = options.step ? parseInt(options.step as any) : 1;
      const result = await manager.down({ step });

      spinner.succeed(chalk.green(`✓ ${result.message}`));

      if (result.migrations.length > 0) {
        console.log(chalk.cyan('\nMigrations rolled back:'));
        result.migrations.forEach(m => console.log(`  • ${m}`));
      }

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

migrate
  .command('reset')
  .description('Reset all migrations')
  .option('-c, --connection <string>', 'Connection string')
  .option('-d, --dir <path>', 'Migrations directory', './migrations')
  .option('--force', 'Skip confirmation')
  .action(async (options: CLIOptions) => {
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'This will rollback ALL migrations. Continue?',
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }

    const spinner = ora('Resetting migrations...').start();

    try {
      const db = await getDatabase(options);

      const manager = new MigrationManager(db, options.dir);
      await manager.init();

      const result = await manager.reset();
      spinner.succeed(chalk.green(`✓ ${result.message}`));

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

migrate
  .command('status')
  .description('Show migration status')
  .option('-c, --connection <string>', 'Connection string')
  .option('-d, --dir <path>', 'Migrations directory', './migrations')
  .action(async (options: CLIOptions) => {
    const spinner = ora('Checking migration status...').start();

    try {
      const db = await getDatabase(options);

      const manager = new MigrationManager(db, options.dir);
      await manager.init();

      const status = await manager.status();
      spinner.stop();

      if (status.length === 0) {
        console.log(chalk.yellow('No migrations found'));
        return;
      }

      const table = new Table({
        head: ['Migration', 'Status', 'Batch', 'Executed At'],
        style: { head: ['cyan'] }
      }) as Table.Table;

      status.forEach((m: any) => {
        const statusColor = m.status === 'executed' ? chalk.green : chalk.yellow;
        table.push([
          m.name,
          statusColor(m.status),
          m.batch || '-',
          m.executedAt ? new Date(m.executedAt).toLocaleString() : '-'
        ]);
      });

      console.log(table.toString());

      const pending = status.filter((m: any) => m.status === 'pending').length;
      const executed = status.filter((m: any) => m.status === 'executed').length;

      console.log(chalk.gray(`\nTotal: ${status.length} | Executed: ${executed} | Pending: ${pending}`));

    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      console.error(error.stack);
      process.exit(1);
    }
  });

program.parse(process.argv);