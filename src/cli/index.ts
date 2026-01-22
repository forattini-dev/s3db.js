#!/usr/bin/env node

/**
 * S3DB CLI - Command Line Interface
 *
 * 🪵 INTENTIONAL CONSOLE USAGE
 * This file uses console.log/error/warn for user-facing CLI output.
 * These calls are NOT migrated to Pino logger as they are designed for
 * terminal interaction and formatted output using tuiuiu.js components.
 */

import { createCLI, type CLI, type CommandParseResult } from 'cli-args-parser';
import inquirer from 'inquirer';
import {
  Table,
  Spinner,
  red,
  green,
  yellow,
  cyan,
  gray,
  bold,
  dim,
  c,
} from './components/index.js';
import { S3db } from '../database.class.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { URL } from 'url';
import { CLIConfig } from '../../src/types/cli.types.js';
import { MigrationManager } from './migration-manager.js';

const configPath = path.join(os.homedir(), '.s3db', 'config.json');

async function loadConfig(): Promise<CLIConfig> {
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveConfig(config: CLIConfig): Promise<void> {
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

async function detectConnectionString(): Promise<string | null> {
  const sources = [
    async () => process.env.S3DB_CONNECTION_STRING,
    async () => process.env.S3_CONNECTION_STRING,
    async () => process.env.DATABASE_URL,
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
    async () => {
      try {
        const mcpConfigPath = path.join(os.homedir(), '.config', 'mcp', 'config.json');
        const content = await fs.readFile(mcpConfigPath, 'utf-8');
        const config = JSON.parse(content);
        return config.servers?.s3db?.env?.S3DB_CONNECTION_STRING || null;
      } catch {
        return null;
      }
    },
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

async function getDatabase(connection?: string): Promise<S3db> {
  const config = await loadConfig();
  let connectionString = connection || config.connection || process.env.S3DB_CONNECTION;

  if (!connectionString) {
    connectionString = (await detectConnectionString()) || undefined;
  }

  if (!connectionString) {
    console.error(red('No connection string provided. Use --connection or s3db configure'));
    process.exit(1);
  }

  return new S3db({ connectionString });
}

const cli = createCLI({
  name: 's3db',
  version: '19.3.25',
  description: 'S3DB CLI - Transform AWS S3 into a powerful document database',
  autoShort: true,
  options: {
    connection: {
      short: 'c',
      type: 'string',
      description: 'S3DB connection string',
      env: 'S3DB_CONNECTION'
    }
  },
  commands: {
    mcp: {
      description: 'Start the S3DB MCP (Model Context Protocol) server',
      aliases: ['server'],
      options: {
        port: {
          short: 'p',
          type: 'number',
          default: 8000,
          description: 'Port for SSE transport'
        },
        host: {
          short: 'h',
          type: 'string',
          default: '0.0.0.0',
          description: 'Host address to bind to'
        },
        transport: {
          short: 't',
          type: 'string',
          default: 'stdio',
          choices: ['stdio', 'sse'],
          description: 'Transport type'
        }
      },
      handler: async (result) => {
        const opts = result.options as any;
        let connectionString = opts.connection;

        if (!connectionString) {
          console.log(cyan('ℹ️  Auto-detecting connection string...'));
          connectionString = await detectConnectionString();
        }

        if (connectionString) {
          console.log(green('✅ Connection string detected'));
          process.env.S3DB_CONNECTION_STRING = connectionString;
        } else {
          console.log(yellow('⚠️  No connection string found. Server will start without auto-connection.'));
        }

        try {
          const possiblePaths = [
            '../../mcp/entrypoint.js',
            '../../mcp/entrypoint.ts',
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
            } catch {}
          }

          if (!startServer) {
            try {
              // @ts-ignore
              const mod = await import('../../../mcp/entrypoint.ts');
              startServer = mod.startServer;
            } catch {
              throw new Error('Could not load MCP server entrypoint.');
            }
          }

          if (startServer) {
            await startServer({
              port: opts.port,
              host: opts.host,
              transport: opts.transport
            });
          }
        } catch (error: any) {
          console.error(red(`Failed to start MCP server: ${error.message}`));
          process.exit(1);
        }
      }
    },

    configure: {
      description: 'Configure S3DB connection',
      handler: async () => {
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
        console.log(green('✓ Configuration saved to ~/.s3db/config.json'));
      }
    },

    list: {
      description: 'List all resources',
      handler: async (result) => {
        const spinner = new Spinner('Connecting to S3DB...').start();
        try {
          const db = await getDatabase((result.options as any).connection);
          const resources = await db.listResources();
          spinner.stop();

          if (resources.length === 0) {
            console.log(yellow('No resources found'));
            return;
          }

          const table = new Table({
            head: ['Resource', 'Behavior', 'Timestamps', 'Paranoid', 'Partitions'],
          });

          resources.forEach((r: any) => {
            table.push([
              r.name,
              r.behavior || 'user-managed',
              r.timestamps ? '✓' : '✗',
              r.paranoid ? '✓' : '✗',
              Object.keys(r.partitions || {}).length
            ]);
          });

          table.print();
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    query: {
      description: 'Query a resource',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' }
      ],
      options: {
        limit: {
          short: 'l',
          type: 'number',
          default: 10,
          description: 'Limit results'
        },
        filter: {
          short: 'f',
          type: 'string',
          description: 'Filter as JSON'
        },
        partition: {
          short: 'p',
          type: 'string',
          description: 'Partition name'
        },
        csv: {
          type: 'boolean',
          default: false,
          description: 'Output as CSV'
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Output as JSON'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Querying...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);

          const queryOptions: any = { limit: opts.limit };
          if (opts.filter) queryOptions.filter = JSON.parse(opts.filter);
          if (opts.partition) queryOptions.partition = opts.partition;

          const results = await resource.list(queryOptions);
          spinner.stop();

          if (opts.json) {
            console.log(JSON.stringify(results, null, 2));
          } else if (opts.csv) {
            if (results.length > 0) {
              const headers = Object.keys(results[0]!);
              console.log(headers.join(','));
              results.forEach((row: any) => {
                console.log(headers.map(h => JSON.stringify(row[h] || '')).join(','));
              });
            }
          } else {
            if (results.length === 0) {
              console.log(yellow('No results found'));
              return;
            }

            const headers = Object.keys(results[0]!);
            const table = new Table({ head: headers });

            results.forEach((row: any) => {
              table.push(headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return JSON.stringify(val);
                return String(val).substring(0, 50);
              }));
            });

            table.print();
          }
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    insert: {
      description: 'Insert data into a resource',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' }
      ],
      options: {
        data: {
          short: 'd',
          type: 'string',
          description: 'Data as JSON'
        },
        file: {
          short: 'f',
          type: 'string',
          description: 'Read data from file'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Inserting...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);

          let data: any;
          if (opts.file) {
            const content = await fs.readFile(opts.file, 'utf-8');
            data = JSON.parse(content);
          } else if (opts.data) {
            data = JSON.parse(opts.data);
          } else {
            spinner.fail('No data provided. Use --data or --file');
            process.exit(1);
          }

          const inserted = await resource.insert(data);
          spinner.succeed(green(`✓ Inserted with ID: ${inserted.id}`));
          console.log(JSON.stringify(inserted, null, 2));
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    update: {
      description: 'Update a record',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' },
        { name: 'id', required: true, description: 'Record ID' }
      ],
      options: {
        data: {
          short: 'd',
          type: 'string',
          description: 'Data as JSON'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Updating...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);
          const data = JSON.parse(opts.data || '{}');

          const updated = await resource.update(pos.id, data);
          spinner.succeed(green(`✓ Updated ID: ${pos.id}`));
          console.log(JSON.stringify(updated, null, 2));
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    delete: {
      description: 'Delete a record',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' },
        { name: 'id', required: true, description: 'Record ID' }
      ],
      options: {
        force: {
          type: 'boolean',
          default: false,
          description: 'Force delete (no confirmation)'
        }
      },
      handler: async (result) => {
        const opts = result.options as any;
        const pos = result.positional as any;

        if (!opts.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete ${pos.id} from ${pos.resource}?`,
              default: false
            }
          ]);

          if (!confirm) {
            console.log(yellow('Cancelled'));
            return;
          }
        }

        const spinner = new Spinner('Deleting...').start();

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);
          await resource.delete(pos.id);
          spinner.succeed(green(`✓ Deleted ID: ${pos.id}`));
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    'create-resource': {
      description: 'Create a new resource',
      positional: [
        { name: 'name', required: true, description: 'Resource name' }
      ],
      options: {
        schema: {
          short: 's',
          type: 'string',
          description: 'Schema as JSON'
        },
        behavior: {
          short: 'b',
          type: 'string',
          default: 'user-managed',
          description: 'Behavior type'
        },
        timestamps: {
          type: 'boolean',
          default: false,
          description: 'Enable timestamps'
        },
        paranoid: {
          type: 'boolean',
          default: false,
          description: 'Enable soft deletes'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Creating resource...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);

          const config: any = {
            name: pos.name,
            behavior: opts.behavior,
            timestamps: opts.timestamps,
            paranoid: opts.paranoid
          };

          if (opts.schema) {
            config.attributes = JSON.parse(opts.schema);
          }

          const resource = await db.createResource(config);
          spinner.succeed(green(`✓ Created resource: ${pos.name}`));
          console.log(JSON.stringify(resource.config, null, 2));
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    console: {
      description: 'Enhanced interactive console',
      aliases: ['interactive'],
      handler: async (result) => {
        await consoleREPL((result.options as any).connection);
      }
    },

    stats: {
      description: 'Show statistics',
      positional: [
        { name: 'resource', required: false, description: 'Resource name (optional)' }
      ],
      handler: async (result) => {
        const spinner = new Spinner('Gathering stats...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);

          if (pos.resource) {
            const resource = await db.getResource(pos.resource);
            const count = await resource.count();
            spinner.stop();

            console.log(cyan(`\nResource: ${pos.resource}`));
            console.log(`Total records: ${count}`);
          } else {
            const resources = await db.listResources();
            spinner.stop();

            console.log(cyan('\nDatabase Statistics'));
            console.log(`Total resources: ${resources.length}`);

            if (resources.length > 0) {
              const table = new Table({ head: ['Resource', 'Count'] });

              for (const r of resources) {
                const resource = await db.getResource(r.name);
                const count = await resource.count();
                table.push([r.name, count]);
              }

              table.print();
            }
          }
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    schema: {
      description: 'Show resource schema',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' }
      ],
      options: {
        format: {
          short: 'f',
          type: 'string',
          default: 'json',
          choices: ['json', 'typescript', 'bigquery'],
          description: 'Output format'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Loading schema...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);
          const schema = resource.export();
          spinner.stop();

          if (opts.format === 'typescript') {
            const { generateTypes } = await import('../concerns/typescript-generator.js');
            const types = generateTypes(db as any);
            console.log(types);
          } else if (opts.format === 'bigquery') {
            console.log(cyan(`\nBigQuery DDL for ${pos.resource}:\n`));
            console.log(`CREATE TABLE \`project.dataset.${pos.resource}\` (`);

            const fields: string[] = [];
            fields.push('  id STRING NOT NULL');

            for (const [field, type] of Object.entries(schema.attributes)) {
              const typeStr = (type as any).toString();
              let bqType = 'STRING';

              if (typeStr.includes('number')) bqType = 'FLOAT64';
              else if (typeStr.includes('boolean')) bqType = 'BOOL';
              else if (typeStr.includes('array')) bqType = 'ARRAY<STRING>';
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
            console.log(JSON.stringify(schema, null, 2));
          }
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    'schema-diff': {
      description: 'Compare local schema files with deployed schemas',
      options: {
        dir: {
          short: 'd',
          type: 'string',
          default: './schemas',
          description: 'Local schema directory'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Comparing schemas...').start();
        const opts = result.options as any;

        try {
          const db = await getDatabase(opts.connection);
          const remoteResources = await db.listResources();
          spinner.stop();

          let localSchemas: Record<string, any> = {};
          try {
            const schemaFiles = await fs.readdir(opts.dir);
            for (const file of schemaFiles) {
              if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(opts.dir, file), 'utf-8');
                const schema = JSON.parse(content);
                localSchemas[schema.name] = schema;
              }
            }
          } catch {
            console.log(yellow(`No local schemas found in ${opts.dir}`));
          }

          const table = new Table({ head: ['Resource', 'Status', 'Changes'] });

          for (const remote of remoteResources) {
            const local = localSchemas[remote.name];

            if (!local) {
              table.push([remote.name, yellow('Remote Only'), 'Not in local schemas']);
            } else {
              const remoteAttrs = Object.keys(remote.attributes || {}).sort();
              const localAttrs = Object.keys(local.attributes || {}).sort();

              if (JSON.stringify(remoteAttrs) !== JSON.stringify(localAttrs)) {
                const diff = {
                  added: localAttrs.filter(a => !remoteAttrs.includes(a)),
                  removed: remoteAttrs.filter(a => !localAttrs.includes(a))
                };
                table.push([
                  remote.name,
                  yellow('Modified'),
                  `+${diff.added.length} -${diff.removed.length} fields`
                ]);
              } else {
                table.push([remote.name, green('Synced'), 'No changes']);
              }

              delete localSchemas[remote.name];
            }
          }

          for (const [name] of Object.entries(localSchemas)) {
            table.push([name, cyan('Local Only'), 'Not deployed']);
          }

          table.print();
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    count: {
      description: 'Count records with optional grouping',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' }
      ],
      options: {
        by: {
          short: 'b',
          type: 'string',
          description: 'Group by field'
        },
        partition: {
          short: 'p',
          type: 'string',
          description: 'Partition name'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Counting...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);

          if (opts.by) {
            const listOptions = opts.partition ? { partition: opts.partition } : {};
            const records = await resource.list(listOptions);
            spinner.stop();

            const grouped: Record<string, number> = {};
            for (const record of records) {
              const value = (record as any)[opts.by] || '(null)';
              grouped[value] = (grouped[value] || 0) + 1;
            }

            const table = new Table({ head: [opts.by, 'Count'] });

            Object.entries(grouped)
              .sort((a, b) => b[1] - a[1])
              .forEach(([key, count]) => {
                table.push([key, count]);
              });

            table.print();
            console.log(gray(`\nTotal: ${records.length} records`));
          } else {
            const count = await resource.count();
            spinner.stop();
            console.log(cyan(`${pos.resource}: ${count} records`));
          }
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    explain: {
      description: 'Show partition structure and query plans',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' }
      ],
      options: {
        partition: {
          short: 'p',
          type: 'string',
          description: 'Specific partition to explain'
        }
      },
      handler: async (result) => {
        const spinner = new Spinner('Analyzing...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);
          const schema = resource.export();
          spinner.stop();

          console.log(cyan(`\n📊 Resource: ${pos.resource}\n`));

          console.log(bold('Configuration:'));
          console.log(`  Behavior: ${schema.behavior || 'user-managed'}`);
          console.log(`  Timestamps: ${schema.timestamps ? '✓' : '✗'}`);
          console.log(`  Paranoid: ${schema.paranoid ? '✓' : '✗'}`);
          console.log(`  Async Partitions: ${(schema as any).asyncPartitions ? '✓' : '✗'}`);

          if (schema.partitions && Object.keys(schema.partitions).length > 0) {
            console.log(bold('\nPartitions:'));

            for (const [name, config] of Object.entries(schema.partitions)) {
              if (opts.partition && name !== opts.partition) continue;

              console.log(green(`\n  ${name}:`));
              console.log(`    Fields: ${Object.keys((config as any).fields).join(', ')}`);

              try {
                const prefix = `resource=${pos.resource}/partition=${name}/`;
                const keys = await (resource.client as any).listObjects({ prefix, maxKeys: 1000 });

                const values = new Set();
                keys.forEach((key: any) => {
                  const parts = key.split('/');
                  const valueParts = parts.filter((p: string) =>
                    !p.startsWith('resource=') && !p.startsWith('partition=') && !p.startsWith('id=')
                  );
                  valueParts.forEach((v: string) => values.add(v));
                });

                console.log(`    Unique values: ${values.size}`);
                console.log(`    Total keys: ${keys.length}`);
                console.log(`    Key pattern: ${prefix}<values>/id=<id>`);
              } catch {
                console.log(gray('    (Unable to analyze partition keys)'));
              }
            }
          } else {
            console.log(yellow('\nNo partitions configured'));
          }

          console.log(bold('\n🔍 Query Optimization:'));
          if (schema.partitions && Object.keys(schema.partitions).length > 0) {
            console.log(green('  ✓ O(1) partition lookups available'));
            console.log('  💡 Use getFromPartition() for best performance');
          } else {
            console.log(yellow('  ⚠️  O(n) full scans only (no partitions)'));
            console.log('  💡 Consider adding partitions for common queries');
          }
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    analyze: {
      description: 'Analyze resource performance and storage',
      positional: [
        { name: 'resource', required: true, description: 'Resource name' }
      ],
      handler: async (result) => {
        const spinner = new Spinner('Analyzing resource...').start();
        const opts = result.options as any;
        const pos = result.positional as any;

        try {
          const db = await getDatabase(opts.connection);
          const resource = await db.getResource(pos.resource);

          const sample = await resource.list({ limit: 100 });
          const count = await resource.count();
          spinner.stop();

          console.log(cyan(`\n📈 Analysis: ${pos.resource}\n`));

          console.log(bold('Records:'));
          console.log(`  Total: ${count}`);
          console.log(`  Sampled: ${sample.length}`);

          if (sample.length > 0) {
            console.log(bold('\nSize Analysis (from sample):'));

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

            console.log(bold('\nField Usage:'));
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

            const table = new Table({ head: ['Field', 'Fill Rate', 'Avg Size'] });

            Object.keys(fieldCounts).forEach(field => {
              const fillRate = ((fieldCounts[field]! / sample.length) * 100).toFixed(1);
              const avgSize = fieldSizes[field] ? (fieldSizes[field]! / fieldCounts[field]!) : 0;
              table.push([field, `${fillRate}%`, `${avgSize.toFixed(0)} bytes`]);
            });

            table.print();
          }

          console.log(bold('\n💡 Recommendations:'));

          const schema = resource.export();
          if (!schema.partitions || Object.keys(schema.partitions).length === 0) {
            console.log(yellow('  • Add partitions for frequently queried fields'));
          }

          if (count > 1000 && !(schema as any).asyncPartitions) {
            console.log(yellow('  • Enable asyncPartitions for faster writes'));
          }

          if (sample.length > 0) {
            const avgSize = sample.reduce((sum: number, r: any) => {
              return sum + Buffer.byteLength(JSON.stringify(r), 'utf8');
            }, 0) / sample.length;

            if (avgSize > 2000) {
              console.log(yellow('  • Consider body-only behavior for large records'));
            }
          }
        } catch (error: any) {
          spinner.fail(red(error.message));
          process.exit(1);
        }
      }
    },

    test: {
      description: 'Testing utilities',
      commands: {
        seed: {
          description: 'Seed database with test data',
          positional: [
            { name: 'resource', required: false, description: 'Resource name (optional)' }
          ],
          options: {
            count: {
              short: 'n',
              type: 'number',
              default: 10,
              description: 'Number of records to create'
            },
            file: {
              short: 'f',
              type: 'string',
              description: 'Seed from factory definition file'
            }
          },
          handler: async (result) => {
            const spinner = new Spinner('Seeding database...').start();
            const opts = result.options as any;
            const pos = result.positional as any;

            try {
              const db = await getDatabase(opts.connection);
              const { Factory, Seeder } = await import('../testing/index.js');
              Factory.setDatabase(db);

              const seeder = new Seeder(db, { logLevel: 'silent' });

              if (opts.file) {
                const factoryModule = await import(path.resolve(opts.file));
                spinner.text = 'Running custom seed...';

                const result = await seeder.call(factoryModule.default || factoryModule.seed);
                spinner.succeed(green('✓ Custom seed completed'));
                console.log(JSON.stringify(result, null, 2));
              } else if (pos.resource) {
                spinner.text = `Seeding ${opts.count} ${pos.resource}...`;

                const factory = Factory.get(pos.resource);
                if (!factory) {
                  spinner.fail(red(`No factory found for '${pos.resource}'`));
                  console.log(yellow('\n💡 Define a factory first or use --file option'));
                  process.exit(1);
                }

                const records = await factory.createMany(opts.count);
                spinner.succeed(green(`✓ Created ${records.length} ${pos.resource}`));
                console.log(gray(`IDs: ${records.map((r: any) => r.id).slice(0, 5).join(', ')}${records.length > 5 ? '...' : ''}`));
              } else {
                const resources = await db.listResources();
                spinner.stop();

                const specs: Record<string, number> = {};
                for (const r of resources) {
                  const factory = Factory.get(r.name);
                  if (factory) {
                    specs[r.name] = opts.count;
                  }
                }

                if (Object.keys(specs).length === 0) {
                  console.log(yellow('No factories defined. Use --file to load factory definitions.'));
                  return;
                }

                console.log(cyan('Seeding with factories:'));
                console.log(specs);

                const created = await seeder.seed(specs);

                console.log(green('\n✓ Seed completed:'));
                Object.entries(created).forEach(([name, records]: [string, any[]]) => {
                  console.log(`  ${name}: ${records.length} records`);
                });
              }
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        },

        setup: {
          description: 'Setup isolated test database',
          options: {
            name: {
              short: 'n',
              type: 'string',
              default: `test-${Date.now()}`,
              description: 'Test database name'
            },
            fixtures: {
              short: 'f',
              type: 'string',
              description: 'Load fixtures from file'
            }
          },
          handler: async (result) => {
            const spinner = new Spinner('Setting up test database...').start();
            const opts = result.options as any;

            try {
              const config = await loadConfig();
              let baseConnection = opts.connection || config.connection || process.env.S3DB_CONNECTION;

              if (!baseConnection) {
                spinner.fail(red('No connection string provided'));
                process.exit(1);
              }

              const url = new URL(baseConnection);
              const originalPath = url.pathname;
              url.pathname = `${originalPath}/${opts.name}`;
              const testConnection = url.toString();

              const db = new S3db({ connectionString: testConnection });

              spinner.text = 'Loading fixtures...';

              if (opts.fixtures) {
                const fixturesModule = await import(path.resolve(opts.fixtures));
                const fixtures = fixturesModule.default || fixturesModule.fixtures;

                if (typeof fixtures === 'function') {
                  await fixtures(db);
                } else {
                  for (const [resourceName, records] of Object.entries(fixtures)) {
                    const resource = await db.getResource(resourceName);
                    for (const record of (records as any[])) {
                      await resource.insert(record);
                    }
                  }
                }
              }

              spinner.succeed(green('✓ Test database ready'));

              console.log(cyan('\nTest Database:'));
              console.log(`  Name: ${opts.name}`);
              console.log(`  Connection: ${testConnection}`);
              console.log(gray('\n💡 Use this connection string for your tests'));
              console.log(gray(`💡 Teardown with: s3db test teardown --name ${opts.name}`));

              const testConfig = { ...config, testConnection, testName: opts.name };
              await saveConfig(testConfig);
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        },

        teardown: {
          description: 'Clean up test database',
          options: {
            name: {
              short: 'n',
              type: 'string',
              description: 'Test database name'
            },
            all: {
              type: 'boolean',
              default: false,
              description: 'Teardown all test databases'
            }
          },
          handler: async (result) => {
            const spinner = new Spinner('Cleaning up...').start();
            const opts = result.options as any;

            try {
              const config = await loadConfig();
              let connection = opts.connection;

              if (!connection && opts.name) {
                const baseConnection = config.connection || process.env.S3DB_CONNECTION;
                if (!baseConnection) {
                  spinner.fail(red('No base connection string found for test database'));
                  process.exit(1);
                }
                const url = new URL(baseConnection);
                const originalPath = url.pathname.replace(/\/[^\/]+$/, '');
                url.pathname = `${originalPath}/${opts.name}`;
                connection = url.toString();
              } else if (!connection && config.testConnection) {
                connection = config.testConnection;
              }

              if (!connection) {
                spinner.fail(red('No test database to teardown'));
                process.exit(1);
              }

              const db = new S3db({ connectionString: connection });

              const { Seeder } = await import('../testing/index.js');
              const seeder = new Seeder(db, { logLevel: 'silent' });

              spinner.text = 'Resetting database...';
              await seeder.reset();

              spinner.succeed(green('✓ Test database cleaned up'));

              if (config.testConnection) {
                delete config.testConnection;
                delete config.testName;
                await saveConfig(config);
              }
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        },

        truncate: {
          description: 'Delete all data from a resource',
          positional: [
            { name: 'resource', required: true, description: 'Resource name' }
          ],
          options: {
            force: {
              type: 'boolean',
              default: false,
              description: 'Skip confirmation'
            }
          },
          handler: async (result) => {
            const opts = result.options as any;
            const pos = result.positional as any;

            if (!opts.force) {
              const { confirm } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'confirm',
                  message: `This will delete ALL data from ${pos.resource}. Continue?`,
                  default: false
                }
              ]);

              if (!confirm) {
                console.log(yellow('Cancelled'));
                return;
              }
            }

            const spinner = new Spinner(`Truncating ${pos.resource}...`).start();

            try {
              const db = await getDatabase(opts.connection);

              const { Seeder } = await import('../testing/index.js');
              const seeder = new Seeder(db, { logLevel: 'silent' });

              await seeder.truncate([pos.resource]);
              spinner.succeed(green(`✓ ${pos.resource} truncated`));
            } catch (error: any) {
              spinner.fail(red(error.message));
              process.exit(1);
            }
          }
        }
      }
    },

    migrate: {
      description: 'Database migrations',
      commands: {
        generate: {
          description: 'Generate a new migration file',
          positional: [
            { name: 'name', required: true, description: 'Migration name' }
          ],
          options: {
            dir: {
              short: 'd',
              type: 'string',
              default: './migrations',
              description: 'Migrations directory'
            }
          },
          handler: async (result) => {
            const spinner = new Spinner('Generating migration...').start();
            const opts = result.options as any;
            const pos = result.positional as any;

            try {
              const manager = new MigrationManager(null, opts.dir);
              const { filename, filepath } = await manager.generate(pos.name);
              spinner.succeed(green('✓ Migration generated'));

              console.log(cyan('\nMigration file:'));
              console.log(`  ${filepath}`);
              console.log(gray('\n💡 Edit the file to add your migration logic'));
              console.log(gray('💡 Run with: s3db migrate up'));
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        },

        up: {
          description: 'Run pending migrations',
          options: {
            dir: {
              short: 'd',
              type: 'string',
              default: './migrations',
              description: 'Migrations directory'
            },
            step: {
              short: 's',
              type: 'number',
              description: 'Number of migrations to run'
            }
          },
          handler: async (result) => {
            const spinner = new Spinner('Running migrations...').start();
            const opts = result.options as any;

            try {
              const db = await getDatabase(opts.connection);
              const manager = new MigrationManager(db, opts.dir);
              await manager.init();

              const migrationResult = await manager.up({ step: opts.step || null });
              spinner.succeed(green(`✓ ${migrationResult.message}`));

              if (migrationResult.migrations.length > 0) {
                console.log(cyan('\nMigrations executed:'));
                migrationResult.migrations.forEach(m => console.log(`  • ${m}`));
                console.log(gray(`\nBatch: ${migrationResult.batch}`));
              }
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        },

        down: {
          description: 'Rollback migrations',
          options: {
            dir: {
              short: 'd',
              type: 'string',
              default: './migrations',
              description: 'Migrations directory'
            },
            step: {
              short: 's',
              type: 'number',
              default: 1,
              description: 'Number of migrations to rollback'
            }
          },
          handler: async (result) => {
            const spinner = new Spinner('Rolling back migrations...').start();
            const opts = result.options as any;

            try {
              const db = await getDatabase(opts.connection);
              const manager = new MigrationManager(db, opts.dir);
              await manager.init();

              const migrationResult = await manager.down({ step: opts.step });
              spinner.succeed(green(`✓ ${migrationResult.message}`));

              if (migrationResult.migrations.length > 0) {
                console.log(cyan('\nMigrations rolled back:'));
                migrationResult.migrations.forEach(m => console.log(`  • ${m}`));
              }
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        },

        reset: {
          description: 'Reset all migrations',
          options: {
            dir: {
              short: 'd',
              type: 'string',
              default: './migrations',
              description: 'Migrations directory'
            },
            force: {
              type: 'boolean',
              default: false,
              description: 'Skip confirmation'
            }
          },
          handler: async (result) => {
            const opts = result.options as any;

            if (!opts.force) {
              const { confirm } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'confirm',
                  message: 'This will rollback ALL migrations. Continue?',
                  default: false
                }
              ]);

              if (!confirm) {
                console.log(yellow('Cancelled'));
                return;
              }
            }

            const spinner = new Spinner('Resetting migrations...').start();

            try {
              const db = await getDatabase(opts.connection);
              const manager = new MigrationManager(db, opts.dir);
              await manager.init();

              const migrationResult = await manager.reset();
              spinner.succeed(green(`✓ ${migrationResult.message}`));
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        },

        status: {
          description: 'Show migration status',
          options: {
            dir: {
              short: 'd',
              type: 'string',
              default: './migrations',
              description: 'Migrations directory'
            }
          },
          handler: async (result) => {
            const spinner = new Spinner('Checking migration status...').start();
            const opts = result.options as any;

            try {
              const db = await getDatabase(opts.connection);
              const manager = new MigrationManager(db, opts.dir);
              await manager.init();

              const status = await manager.status();
              spinner.stop();

              if (status.length === 0) {
                console.log(yellow('No migrations found'));
                return;
              }

              const table = new Table({
                head: ['Migration', 'Status', 'Batch', 'Executed At'],
              });

              status.forEach((m: any) => {
                const statusColor = m.status === 'executed' ? green : yellow;
                table.push([
                  m.name,
                  statusColor(m.status),
                  m.batch || '-',
                  m.executedAt ? new Date(m.executedAt).toLocaleString() : '-'
                ]);
              });

              table.print();

              const pending = status.filter((m: any) => m.status === 'pending').length;
              const executed = status.filter((m: any) => m.status === 'executed').length;

              console.log(gray(`\nTotal: ${status.length} | Executed: ${executed} | Pending: ${pending}`));
            } catch (error: any) {
              spinner.fail(red(error.message));
              console.error(error.stack);
              process.exit(1);
            }
          }
        }
      }
    }
  }
});

async function consoleREPL(connection?: string): Promise<void> {
  console.log(c.cyan.bold('\n┌─────────────────────────────────────┐'));
  console.log(c.cyan.bold('│  S3DB Interactive Console v19.3     │'));
  console.log(c.cyan.bold('└─────────────────────────────────────┘\n'));

  const db = await getDatabase(connection);

  const resources = await db.listResources();
  console.log(gray(`Connected to: ${(db.client as any).config.bucket}`));
  console.log(gray(`Resources: ${resources.length}\n`));

  console.log(yellow('Quick commands:'));
  console.log(gray('  .help         - Show all commands'));
  console.log(gray('  .resources    - List all resources'));
  console.log(gray('  .use <name>   - Select a resource'));
  console.log(gray('  .exit         - Exit console\n'));

  const repl = await import('repl');
  const { Factory, Seeder } = await import('../testing/index.js');

  let currentResource: any = null;

  const server = repl.start({
    prompt: green('s3db> '),
    useColors: true,
    ignoreUndefined: true,
    eval: async (cmd: string, context: any, filename: string, callback: (err: Error | null, result: any) => void) => {
      try {
        const trimmed = cmd.trim().replace(/\n$/, '');

        if (trimmed === '.help' || trimmed === 'help') {
          console.log(cyan('\n📖 S3DB Console Commands:\n'));
          console.log(bold('Database:'));
          console.log('  db                      - Database instance');
          console.log('  db.listResources()      - List all resources');
          console.log('  db.getResource(name)    - Get a resource');
          console.log(bold('\nResource Selection:'));
          console.log('  .use <name>             - Select active resource');
          console.log('  resource                - Current resource (if selected)');
          console.log(bold('\nData Operations:'));
          console.log('  await resource.list()   - List records');
          console.log('  await resource.get(id)  - Get record by ID');
          console.log('  await resource.insert({})- Insert record');
          console.log('  await resource.count()  - Count records');
          console.log(bold('\nTesting:'));
          console.log('  Factory                 - Factory class');
          console.log('  Seeder                  - Seeder class');
          console.log(bold('\nUtilities:'));
          console.log('  .resources              - List resources');
          console.log('  .clear                  - Clear console');
          console.log('  .exit                   - Exit\n');
          callback(null, undefined);
          return;
        }

        if (trimmed === '.resources') {
          const table = new Table({
            head: ['Resource', 'Behavior', 'Partitions'],
          });

          resources.forEach((r: any) => {
            table.push([
              r.name,
              r.behavior || 'user-managed',
              Object.keys(r.partitions || {}).length
            ]);
          });

          table.print();
          callback(null, undefined);
          return;
        }

        if (trimmed.startsWith('.use ')) {
          const resourceName = trimmed.replace('.use ', '').trim();
          try {
            currentResource = await db.getResource(resourceName);
            console.log(green(`✓ Now using resource: ${resourceName}`));
            context.resource = currentResource;
            callback(null, undefined);
          } catch {
            console.log(red(`✗ Resource not found: ${resourceName}`));
            callback(null, undefined);
          }
          return;
        }

        if (trimmed === '.clear') {
          console.clear();
          callback(null, undefined);
          return;
        }

        context.db = db;
        context.resource = currentResource;
        context.Factory = Factory;
        context.Seeder = Seeder;
        context.colors = { red, green, yellow, cyan, gray, bold, dim, c };
        context.Table = Table;

        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction('context', `
          with (context) {
            return (async () => {
              ${trimmed}
            })();
          }
        `);

        const evalResult = await fn(context);
        callback(null, evalResult);
      } catch (error: any) {
        console.log(red(`Error: ${error.message}`));
        callback(null, undefined);
      }
    }
  });

  server.setupHistory(path.join(os.homedir(), '.s3db', 'history'), () => {});

  server.on('exit', () => {
    console.log(cyan('\n👋 Bye!\n'));
    process.exit(0);
  });
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(cli.help());
} else if (args.includes('--help') || args.includes('-h')) {
  const commandPath = args.filter(a => !a.startsWith('-'));
  console.log(cli.help(commandPath));
} else if (args[0] === 'help') {
  const commandPath = args.slice(1);
  console.log(cli.help(commandPath));
} else {
  cli.run(args).catch((error) => {
    console.error(red(`Error: ${error.message}`));
    process.exit(1);
  });
}
