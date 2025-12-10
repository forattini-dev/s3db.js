#!/usr/bin/env node

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths to check
const distPath = join(__dirname, '..', 'dist', 'cli', 'index.js');
const srcPath = join(__dirname, '..', 'src', 'cli', 'index.ts');

function run(scriptPath, isTs = false) {
  const args = process.argv.slice(2);
  
  if (isTs) {
    // Run with tsx
    const child = spawn('npx', ['tsx', scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env
    });
    
    child.on('close', (code) => process.exit(code));
    child.on('error', (err) => {
      console.error('Failed to start CLI with tsx:', err);
      process.exit(1);
    });
  } else {
    // Run with node
    import(scriptPath).catch(err => {
      console.error('Failed to run CLI:', err);
      process.exit(1);
    });
  }
}

// Logic: Prefer dist if it exists (production/built), otherwise use src (development)
if (existsSync(distPath)) {
  run(distPath, false);
} else if (existsSync(srcPath)) {
  console.log('Running in development mode (tsx)...');
  run(srcPath, true);
} else {
  console.error('❌ Could not find CLI entry point.');
  console.error('   Expected either: dist/cli/index.js (run build) or src/cli/index.ts');
  process.exit(1);
}
