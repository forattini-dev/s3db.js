#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const placeholder = '__INJECT_VERSION__';
const target = join(root, 'dist', 'version.js');

try {
  let content = readFileSync(target, 'utf-8');

  if (!content.includes(placeholder)) {
    console.log('No placeholder found — version may already be injected');
    process.exit(0);
  }

  content = content.replace(
    `const VERSION = '${placeholder}'`,
    `const VERSION = '${version}'`
  );

  writeFileSync(target, content, 'utf-8');
  console.log(`Injected version ${version} into dist/version.js`);
} catch (err) {
  console.error('Failed to inject version:', err.message);
  process.exit(1);
}
