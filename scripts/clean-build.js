#!/usr/bin/env node

import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

rmSync(join(root, 'dist'), { recursive: true, force: true });

console.log('Cleaned dist/');
