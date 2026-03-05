#!/usr/bin/env node

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distPath = join(__dirname, '..', 'dist', 'mcp', 'entrypoint.js');
const srcPath = join(__dirname, '..', 'mcp', 'entrypoint.ts');

const args = process.argv.slice(2);

if (existsSync(distPath)) {
  import(distPath).catch(err => {
    console.error('Failed to run MCP server:', err);
    process.exit(1);
  });
} else if (existsSync(srcPath)) {
  const child = spawn('npx', ['tsx', srcPath, ...args], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('close', (code) => process.exit(code));
  child.on('error', (err) => {
    console.error('Failed to start MCP server with tsx:', err);
    process.exit(1);
  });
} else {
  console.error('Could not find MCP entrypoint.');
  console.error('Expected either: dist/mcp/entrypoint.js or mcp/entrypoint.ts');
  process.exit(1);
}
