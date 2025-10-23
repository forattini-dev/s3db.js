#!/usr/bin/env node
/**
 * Generate TypeScript Types - Helper Script
 *
 * This script generates TypeScript definitions from your s3db.js resources.
 *
 * Usage:
 *   node generate-types.js                          # Generate to ./types/database.d.ts
 *   node generate-types.js --output custom.d.ts     # Custom output path
 *   node generate-types.js --print                  # Print to console only
 *
 * Setup:
 * 1. Copy this file to your project root
 * 2. Update connectionString with your database
 * 3. Run: node generate-types.js
 * 4. Import types in your .ts files
 */

import { Database, generateTypes, printTypes } from '../../src/index.js';
import { parseArgs } from 'node:util';

// ============================================================================
// Configuration
// ============================================================================

const connectionString = process.env.S3DB_CONNECTION_STRING ||
  's3://test:test@my-bucket?region=us-east-1&endpoint=http://localhost:4566&forcePathStyle=true';

const defaultOutputPath = './types/database.d.ts';

// ============================================================================
// Parse CLI Arguments
// ============================================================================

const { values } = parseArgs({
  options: {
    output: {
      type: 'string',
      short: 'o',
      default: defaultOutputPath
    },
    print: {
      type: 'boolean',
      short: 'p',
      default: false
    },
    module: {
      type: 'string',
      short: 'm',
      default: 's3db.js'
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false
    }
  }
});

// Show help
if (values.help) {
  console.log(`
🔧 S3DB.JS TypeScript Type Generator

Usage:
  node generate-types.js [options]

Options:
  -o, --output <path>    Output file path (default: ./types/database.d.ts)
  -p, --print            Print to console instead of file
  -m, --module <name>    Module name for imports (default: s3db.js)
  -h, --help             Show this help message

Environment Variables:
  S3DB_CONNECTION_STRING  Database connection string

Examples:
  # Generate to default location
  node generate-types.js

  # Custom output path
  node generate-types.js --output src/types/db.d.ts

  # Print to console
  node generate-types.js --print

  # Custom module name (for local packages)
  node generate-types.js --module @mycompany/s3db
`);
  process.exit(0);
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('🔧 S3DB.JS TypeScript Type Generator\n');

  // Connect to database
  console.log('📡 Connecting to database...');
  const db = new Database({ connectionString });

  try {
    await db.connect();
    console.log('✅ Connected successfully\n');
  } catch (error) {
    console.error('❌ Failed to connect to database');
    console.error('   Make sure your S3 service is running');
    console.error(`   Connection string: ${connectionString}\n`);
    process.exit(1);
  }

  // Load resources (assuming they're already created)
  const resourceCount = Object.keys(db.resources).length;

  if (resourceCount === 0) {
    console.log('⚠️  No resources found in database');
    console.log('   Make sure your resources are created before generating types\n');
    process.exit(1);
  }

  console.log(`📦 Found ${resourceCount} resource(s):`);
  for (const name of Object.keys(db.resources)) {
    const resource = db.resources[name];
    const attributeCount = Object.keys(resource.attributes || {}).length;
    console.log(`   • ${name} (${attributeCount} attributes)`);
  }
  console.log('');

  // Generate types
  console.log('⚙️  Generating TypeScript definitions...\n');

  try {
    if (values.print) {
      // Print to console
      const types = await printTypes(db, {
        moduleName: values.module
      });
      console.log('\n✅ TypeScript definitions generated!\n');
    } else {
      // Write to file
      const types = await generateTypes(db, {
        outputPath: values.output,
        moduleName: values.module
      });

      console.log('✅ TypeScript definitions generated!');
      console.log(`   File: ${values.output}`);
      console.log(`   Size: ${(types.length / 1024).toFixed(2)} KB\n`);
    }
  } catch (error) {
    console.error('❌ Failed to generate types');
    console.error(`   Error: ${error.message}\n`);
    process.exit(1);
  }

  // Show next steps
  console.log('🎯 Next Steps:\n');
  console.log('1. Import types in your TypeScript files:');
  console.log(`   import type { ResourceMap, Users, Posts } from '${values.output}';\n`);
  console.log('2. Use typed resources:');
  console.log('   const users = db.resources.users;  // Type: Resource<Users>');
  console.log('   const user = await users.get(id);  // Type: Users\n');
  console.log('3. Enjoy autocomplete and type safety! 🎉\n');

  // Show regeneration tip
  console.log('💡 Tip: Re-run this script whenever your schema changes\n');

  process.exit(0);
}

// ============================================================================
// Run
// ============================================================================

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
