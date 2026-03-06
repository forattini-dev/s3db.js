#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packageJsonPath = join(root, 'package.json');
const artifactsDir = process.env.PACKAGE_TARBALL_DESTINATION
  ? join(root, process.env.PACKAGE_TARBALL_DESTINATION)
  : join(root, '.artifacts');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const originalPackageJson = readFileSync(packageJsonPath, 'utf-8');
const packageManifest = JSON.parse(originalPackageJson);
const packageName = process.env.PACKAGE_TARBALL_NAME;
const packageVersion = process.env.PACKAGE_TARBALL_VERSION;
const packageRegistry = process.env.PACKAGE_TARBALL_REGISTRY;
let manifestMutated = false;

mkdirSync(artifactsDir, { recursive: true });

if (packageName) {
  packageManifest.name = packageName;
  manifestMutated = true;
}

if (packageVersion) {
  packageManifest.version = packageVersion;
  manifestMutated = true;
}

if (packageRegistry) {
  packageManifest.publishConfig = {
    ...(packageManifest.publishConfig || {}),
    registry: packageRegistry
  };
  manifestMutated = true;
}

const beforePack = new Set(
  readdirSync(artifactsDir).filter(file => file.endsWith('.tgz'))
);

try {
  if (manifestMutated) {
    writeFileSync(packageJsonPath, `${JSON.stringify(packageManifest, null, 2)}\n`, 'utf-8');
  }

  execFileSync(pnpmCommand, ['pack', '--pack-destination', artifactsDir], {
    cwd: root,
    stdio: 'inherit'
  });
} finally {
  if (manifestMutated) {
    writeFileSync(packageJsonPath, originalPackageJson, 'utf-8');
  }
}

const tarball = readdirSync(artifactsDir)
  .filter(file => file.endsWith('.tgz'))
  .find(file => !beforePack.has(file));

if (!tarball) {
  throw new Error('No package tarball was created');
}

console.log(join(artifactsDir, tarball));
