#!/usr/bin/env node

import { program } from 'commander';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

// Helper functions
function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warn(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Auto-detect connection string from various sources
function detectConnectionString() {
  // Priority order for connection string detection
  const sources = [
    // 1. Environment variable
    () => process.env.S3DB_CONNECTION_STRING,
    () => process.env.S3_CONNECTION_STRING,
    () => process.env.DATABASE_URL,
    
    // 2. AWS credentials from environment
    () => {
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
    () => {
      const mcpConfigPath = join(homedir(), '.config', 'mcp', 'config.json');
      if (existsSync(mcpConfigPath)) {
        try {
          const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
          const s3dbConfig = mcpConfig.servers?.s3db;
          if (s3dbConfig?.env?.S3DB_CONNECTION_STRING) {
            return s3dbConfig.env.S3DB_CONNECTION_STRING;
          }
        } catch (e) {
          // Ignore config parsing errors
        }
      }
      return null;
    },
    
    // 4. Local .env file
    () => {
      const envPath = join(process.cwd(), '.env');
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, 'utf-8');
        const match = envContent.match(/^S3DB_CONNECTION_STRING=(.*)$/m);
        if (match && match[1]) {
          return match[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
        }
      }
      return null;
    }
  ];
  
  for (const source of sources) {
    const connectionString = source();
    if (connectionString) {
      return connectionString;
    }
  }
  
  return null;
}

// Validate connection string format
function validateConnectionString(connectionString) {
  if (!connectionString) return false;
  
  const patterns = [
    /^s3:\/\/[^:]+:[^@]+@[^?]+(\?.*)?$/, // s3://key:secret@bucket?region=...
    /^https?:\/\/[^:]+:[^@]+@[^\/]+\/[^?]+(\?.*)?$/ // http(s)://key:secret@host/bucket?...
  ];
  
  return patterns.some(pattern => pattern.test(connectionString));
}

// Start MCP server function
async function startMcpServer(options) {
  try {
    // Import the MCP server
    const { S3dbMCPServer } = await import('../mcp/server.js');

    // Support both --log-level and legacy --verbose flag
    const logLevel = options.verbose ? 'debug' : options.logLevel;

    // Set environment variables from options
    if (options.transport) process.env.MCP_TRANSPORT = options.transport;
    if (options.host) process.env.MCP_SERVER_HOST = options.host;
    if (options.port) process.env.MCP_SERVER_PORT = options.port.toString();
    if (options.connectionString) process.env.S3DB_CONNECTION_STRING = options.connectionString;
    
    // Create and start server
    const server = new S3dbMCPServer();
    
    info(`Starting S3DB MCP Server v${packageJson.version}`);
    info(`Transport: ${options.transport}`);
    info(`Host: ${options.host}`);
    info(`Port: ${options.port}`);
    
    if (options.connectionString) {
      info(`Connection: ${options.connectionString.replace(/:[^@]+@/, ':***@')}`); // Hide secrets
    } else {
      warn('No connection string provided - server will require manual connection via MCP tools');
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      log('\n🛑 Shutting down S3DB MCP Server...', colors.yellow);
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      log('\n🛑 Shutting down S3DB MCP Server...', colors.yellow);
      process.exit(0);
    });
    
    success('S3DB MCP Server started successfully!');
    
    if (options.transport === 'sse') {
      success(`Server available at: http://${options.host}:${options.port}/sse`);
      success(`Health check: http://${options.host}:${parseInt(options.port) + 1}/health`);
    } else {
      info('Server running in stdio mode for MCP client communication');
    }
    
  } catch (err) {
    error(`Failed to start MCP server: ${err.message}`);
    if (logLevel === 'debug' || logLevel === 'trace') {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Setup CLI program
program
  .name('s3db.js')
  .description('S3DB - Use AWS S3 as a database with ORM capabilities and MCP server')
  .version(packageJson.version);

// MCP Server command
program
  .command('mcp')
  .alias('server')
  .description('Start the S3DB MCP (Model Context Protocol) server')
  .option('-p, --port <port>', 'Port for SSE transport (default: 8000)', '8000')
  .option('-h, --host <host>', 'Host address to bind to (default: 0.0.0.0)', '0.0.0.0')
  .option('-t, --transport <type>', 'Transport type: stdio or sse (default: stdio)', 'stdio')
  .option('-c, --connection-string <string>', 'S3DB connection string (auto-detected if not provided)')
  .option('-l, --log-level <level>', 'Log level: trace, debug, info, warn, error, fatal (default: info)', 'info')
  .option('-v, --verbose', 'Enable verbose logging (deprecated: use --log-level debug)', false)
  .action(async (options) => {
    // Auto-detect connection string if not provided
    let connectionString = options.connectionString;
    
    if (!connectionString) {
      info('Auto-detecting connection string...');
      connectionString = detectConnectionString();
    }
    
    if (connectionString) {
      if (!validateConnectionString(connectionString)) {
        error('Invalid connection string format');
        error('Expected formats:');
        error('  s3://key:secret@bucket?region=us-east-1');
        error('  http://key:secret@localhost:9000/bucket (MinIO)');
        error('  https://key:secret@host/bucket (other S3-compatible)');
        process.exit(1);
      }
      success('Connection string detected and validated');
    } else {
      warn('No connection string found. Server will start without auto-connection.');
      warn('You can connect manually using MCP tools or set one of these:');
      warn('  - S3DB_CONNECTION_STRING environment variable');
      warn('  - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET env vars');
      warn('  - ~/.config/mcp/config.json MCP configuration');
      warn('  - .env file in current directory');
    }
    
    const serverOptions = {
      ...options,
      port: parseInt(options.port),
      connectionString
    };
    
    await startMcpServer(serverOptions);
  });

// Connection test command
program
  .command('test')
  .description('Test S3DB connection and basic operations')
  .option('-c, --connection-string <string>', 'S3DB connection string (auto-detected if not provided)')
  .option('-l, --log-level <level>', 'Log level: trace, debug, info, warn, error, fatal (default: info)', 'info')
  .option('-v, --verbose', 'Enable verbose output (deprecated: use --log-level debug)', false)
  .action(async (options) => {
    try {
      // Auto-detect connection string if not provided
      let connectionString = options.connectionString;
      
      if (!connectionString) {
        info('Auto-detecting connection string...');
        connectionString = detectConnectionString();
      }
      
      if (!connectionString) {
        error('No connection string found. Please provide one using:');
        error('  s3db.js test -c "s3://key:secret@bucket?region=us-east-1"');
        process.exit(1);
      }
      
      if (!validateConnectionString(connectionString)) {
        error('Invalid connection string format');
        process.exit(1);
      }
      
      info('Testing S3DB connection...');

      // Import and test S3DB
      const { S3db } = await import('../dist/s3db.es.js');

      // Support both --log-level and legacy --verbose flag
      const logLevel = options.verbose ? 'debug' : options.logLevel;

      const database = new S3db({
        connectionString,
        loggerOptions: { level: logLevel }
      });
      
      info('Connecting to database...');
      await database.connect();
      success('Connected successfully!');
      
      info('Testing basic operations...');
      
      // Test resource listing
      const resources = await database.listResources();
      success(`Found ${resources.length} resources`);

      if (logLevel === 'debug' || logLevel === 'trace') {
        if (resources.length > 0) {
          console.log('Resources:', resources);
        }
      }

      await database.disconnect();
      success('All tests passed!');

    } catch (err) {
      error(`Connection test failed: ${err.message}`);
      if (logLevel === 'debug' || logLevel === 'trace') {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('Display current configuration and auto-detected settings')
  .action(() => {
    info('S3DB Configuration:');
    console.log('');
    
    log('📦 Package Information:', colors.cyan);
    console.log(`  Name: ${packageJson.name}`);
    console.log(`  Version: ${packageJson.version}`);
    console.log(`  Description: ${packageJson.description}`);
    console.log('');
    
    log('🔗 Connection String Detection:', colors.cyan);
    const connectionString = detectConnectionString();
    if (connectionString) {
      success(`  Detected: ${connectionString.replace(/:[^@]+@/, ':***@')}`);
    } else {
      warn('  No connection string detected');
    }
    console.log('');
    
    log('🌍 Environment Variables:', colors.cyan);
    const envVars = [
      'S3DB_CONNECTION_STRING',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY', 
      'AWS_S3_BUCKET',
      'AWS_REGION',
      'MCP_TRANSPORT',
      'MCP_SERVER_HOST',
      'MCP_SERVER_PORT'
    ];
    
    envVars.forEach(envVar => {
      const value = process.env[envVar];
      if (value) {
        if (envVar.includes('SECRET') || envVar.includes('KEY')) {
          console.log(`  ${envVar}: ${'*'.repeat(Math.min(value.length, 8))}`);
        } else {
          console.log(`  ${envVar}: ${value}`);
        }
      } else {
        console.log(`  ${envVar}: ${colors.yellow}not set${colors.reset}`);
      }
    });
    console.log('');
    
    log('📁 Configuration Files:', colors.cyan);
    const configFiles = [
      join(homedir(), '.config', 'mcp', 'config.json'),
      join(process.cwd(), '.env')
    ];
    
    configFiles.forEach(configFile => {
      if (existsSync(configFile)) {
        success(`  ${configFile}: found`);
      } else {
        console.log(`  ${configFile}: ${colors.yellow}not found${colors.reset}`);
      }
    });
  });

// Examples command  
program
  .command('examples')
  .description('Show usage examples and common patterns')
  .action(() => {
    log('🚀 S3DB CLI Examples:', colors.bright + colors.cyan);
    console.log('');
    
    log('1. Start MCP Server (stdio mode for MCP clients):', colors.green);
    console.log('   s3db.js mcp');
    console.log('   s3db.js server  # alias');
    console.log('');
    
    log('2. Start MCP Server with SSE transport:', colors.green);
    console.log('   s3db.js mcp --transport sse --port 8888');
    console.log('   s3db.js mcp -t sse -p 8888  # short form');
    console.log('');
    
    log('3. Start with explicit connection string:', colors.green);
    console.log('   s3db.js mcp -c "s3://key:secret@bucket?region=us-east-1"');
    console.log('');
    
    log('4. Test connection:', colors.green);
    console.log('   s3db.js test');
    console.log('   s3db.js test --log-level debug');
    console.log('   s3db.js test -c "s3://key:secret@bucket"');
    console.log('');
    
    log('5. View configuration:', colors.green);
    console.log('   s3db.js config');
    console.log('');
    
    log('💡 Connection String Formats:', colors.yellow);
    console.log('   AWS S3:');
    console.log('     s3://accessKey:secretKey@bucketName?region=us-east-1');
    console.log('   MinIO:');
    console.log('     http://accessKey:secretKey@localhost:9000/bucketName');
    console.log('   DigitalOcean Spaces:');
    console.log('     https://accessKey:secretKey@nyc3.digitaloceanspaces.com/bucketName');
    console.log('');
    
    log('🔧 Environment Variables (auto-detected):', colors.yellow);
    console.log('   S3DB_CONNECTION_STRING="s3://key:secret@bucket"');
    console.log('   AWS_ACCESS_KEY_ID=your_access_key');
    console.log('   AWS_SECRET_ACCESS_KEY=your_secret_key');
    console.log('   AWS_S3_BUCKET=your_bucket');
    console.log('   AWS_REGION=us-east-1');
    console.log('');
    
    log('📱 Usage with npx:', colors.yellow);
    console.log('   npx s3db.js mcp --port 8888');
    console.log('   npx s3db.js test');
    console.log('   npx s3db.js config');
  });

// Handle unknown commands
program.on('command:*', () => {
  error(`Unknown command: ${program.args.join(' ')}`);
  error('Use --help to see available commands');
  process.exit(1);
});

// Show help if no arguments provided
if (process.argv.length <= 2) {
  program.help();
}

// Parse command line arguments
program.parse();