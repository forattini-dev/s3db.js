#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

const execAsync = promisify(exec);

async function buildBinary() {
  console.log(chalk.cyan('🔨 Building S3DB Binary...\n'));
  
  try {
    // Step 1: Build with Rollup
    console.log(chalk.yellow('1. Building CLI with Rollup...'));
    await execAsync('pnpm rollup -c rollup.cli.config.mjs');
    console.log(chalk.green('   ✓ CLI built successfully'));
    
    // Step 2: Create package.json for pkg
    console.log(chalk.yellow('2. Creating package.json for binary...'));
    const pkgConfig = {
      name: 's3db',
      version: '9.0.0',
      description: 'S3DB CLI - Transform AWS S3 into a powerful document database',
      main: 's3db-cli.js',
      bin: 's3db-cli.js',
      dependencies: {
        '@aws-sdk/client-s3': '^3.0.0',
        '@aws-sdk/lib-storage': '^3.0.0',
        '@smithy/node-http-handler': '^3.0.0',
        'commander': '^12.0.0',
        'chalk': '^5.3.0',
        'ora': '^8.0.1',
        'cli-table3': '^0.6.5',
        'inquirer': '^9.2.15'
      },
      pkg: {
        scripts: 's3db-cli.js',
        targets: [
          'node18-linux-x64',
          'node18-macos-x64',
          'node18-macos-arm64',
          'node18-win-x64'
        ],
        outputPath: 'bin',
        compress: 'GZip'
      }
    };
    
    await fs.writeFile(
      'dist/package.json',
      JSON.stringify(pkgConfig, null, 2)
    );
    console.log(chalk.green('   ✓ package.json created'));
    
    // Step 3: Install dependencies in dist
    console.log(chalk.yellow('3. Installing dependencies...'));
    await execAsync('cd dist && npm install --production');
    console.log(chalk.green('   ✓ Dependencies installed'));
    
    // Step 4: Build binaries with pkg
    console.log(chalk.yellow('4. Building binaries with pkg...'));
    await execAsync('cd dist && npx pkg . --out-path ../bin');
    console.log(chalk.green('   ✓ Binaries created'));
    
    // Step 5: List created binaries
    console.log(chalk.yellow('5. Created binaries:'));
    const binDir = path.join(process.cwd(), 'bin');
    const files = await fs.readdir(binDir);
    
    for (const file of files) {
      const stats = await fs.stat(path.join(binDir, file));
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(chalk.green(`   ✓ ${file} (${sizeMB} MB)`));
    }
    
    console.log(chalk.cyan('\n✨ Build complete! Binaries are in ./bin/'));
    console.log(chalk.gray('Test with: ./bin/s3db-linux --help'));
    
  } catch (error) {
    console.error(chalk.red('Build failed:'), error);
    process.exit(1);
  }
}

buildBinary();