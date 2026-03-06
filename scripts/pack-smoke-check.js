#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const artifactsDir = join(root, '.artifacts');
const smokeDir = join(root, '.tmp', 'package-smoke');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const nodeCommand = process.execPath;
const packageName = process.env.PACKAGE_SMOKE_NAME || 's3db.js';

function getPackageNodeModulesPath() {
  return join(smokeDir, 'node_modules', ...packageName.split('/'));
}

function ensureTarballPath() {
  const provided = process.argv[2];
  if (provided) {
    return resolve(provided);
  }

  execFileSync(nodeCommand, [join(root, 'scripts', 'create-package-tarball.js')], {
    cwd: root,
    stdio: 'inherit'
  });

  const tarball = readdirSync(artifactsDir)
    .filter(file => file.endsWith('.tgz'))
    .sort()[0];

  if (!tarball) {
    throw new Error('No package tarball available for smoke check');
  }

  return join(artifactsDir, tarball);
}

const tarballPath = ensureTarballPath();

rmSync(smokeDir, { recursive: true, force: true });
mkdirSync(smokeDir, { recursive: true });

writeFileSync(join(smokeDir, 'package.json'), JSON.stringify({
  name: 's3db-js-smoke-check',
  private: true,
  type: 'module'
}, null, 2));

execFileSync(pnpmCommand, ['add', '--ignore-workspace', tarballPath], {
  cwd: smokeDir,
  stdio: 'inherit'
});

writeFileSync(join(smokeDir, 'smoke.mjs'), `
import { existsSync } from 'node:fs';
import { join } from 'node:path';

await import('${packageName}');
await import('${packageName}/lite');
await import('${packageName}/plugins/state-machine.plugin');
await import('${packageName}/concerns/guards-helpers');

const packageRoot = join(process.cwd(), 'node_modules', ...${JSON.stringify(packageName.split('/'))});
const sourceDir = join(packageRoot, 'src');
if (existsSync(sourceDir)) {
  throw new Error('Published package should not include src/');
}
`.trimStart());

execFileSync(nodeCommand, ['smoke.mjs'], {
  cwd: smokeDir,
  stdio: 'inherit'
});

execFileSync(nodeCommand, [join(getPackageNodeModulesPath(), 'bin', 'cli.js'), '--help'], {
  cwd: smokeDir,
  stdio: 'inherit'
});

console.log(`Smoke check passed for ${tarballPath}`);
