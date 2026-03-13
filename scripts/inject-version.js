#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const placeholder = '__INJECT_VERSION__';
const targets = [
  join(root, 'dist', 'version.js'),
  join(root, 'dist', 'mcp', 'entrypoint.js'),
];

try {
  let injected = 0;

  for (const target of targets) {
    if (!existsSync(target)) {
      continue;
    }

    let content = readFileSync(target, 'utf-8');

    if (!content.includes(placeholder)) {
      console.log(`No placeholder found in ${target} — version may already be injected`);
      continue;
    }

    content = content.replace(
      `const VERSION = '${placeholder}'`,
      `const VERSION = '${version}'`
    );

    writeFileSync(target, content, 'utf-8');
    console.log(`Injected version ${version} into ${target}`);
    injected += 1;
  }

  if (injected === 0) {
    console.log('No version placeholders were updated');
  }
} catch (err) {
  console.error('Failed to inject version:', err.message);
  process.exit(1);
}
