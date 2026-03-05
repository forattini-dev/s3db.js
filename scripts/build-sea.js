#!/usr/bin/env node

import { execFileSync, execSync } from 'child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { resolve, join } from 'path';

const platform = process.platform;
const arch = process.arch;

// Map platform names for output binary
const platformMap = { linux: 'linux', darwin: 'macos', win32: 'win' };
const platformName = platformMap[platform];
if (!platformName) {
  console.error(`❌ Unsupported platform: ${platform}`);
  process.exit(1);
}

const suffix = platform === 'win32' ? '.exe' : '';
const outputName = `s3db-${platformName}-${arch}${suffix}`;
const distBin = resolve('dist/bin');
const outputPath = join(distBin, outputName);
const blobPath = join(distBin, 'sea-prep.blob');
const configPath = resolve('sea-config.json');
const cliBundle = join(distBin, 's3db.cjs');
const seaEntry = join(distBin, 's3db-sea.cjs');

console.log(`📦 Building SEA binary for ${platformName}-${arch}...`);

// 1. Ensure dist/bin exists and s3db.cjs is there
mkdirSync(distBin, { recursive: true });

let cliContent;
try {
  cliContent = readFileSync(cliBundle, 'utf-8');
} catch {
  console.error(`❌ ${cliBundle} not found. Run "pnpm run build:cli" first.`);
  process.exit(1);
}

// 2. Create SEA-specific entry — strip shebang (SEA needs valid JS)
const cliContentNoShebang = cliContent.replace(/^#!.*\n/, '');
writeFileSync(seaEntry, cliContentNoShebang);

const seaConfig = {
  main: seaEntry,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
};
writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));

try {
  // 3. Generate the SEA blob
  console.log('  Generating SEA blob...');
  execFileSync(process.execPath, ['--experimental-sea-config', configPath], {
    stdio: 'inherit',
  });

  // 4. Copy the node binary
  console.log('  Copying Node.js binary...');
  cpSync(process.execPath, outputPath);

  if (platform === 'darwin') {
    // 5. Remove signature on macOS before injection
    console.log('  Removing macOS code signature...');
    execFileSync('codesign', ['--remove-signature', outputPath], { stdio: 'inherit' });
  }

  // 6. Inject the blob with postject
  // Use execSync with shell:true — execFileSync('npx', ...) fails on Windows (ENOENT)
  console.log('  Injecting SEA blob...');
  const machoFlag = platform === 'darwin' ? ' --macho-segment-name NODE_SEA' : '';
  execSync(
    `npx --yes postject "${outputPath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2${machoFlag}`,
    { stdio: 'inherit' },
  );

  if (platform === 'darwin') {
    console.log('  Re-signing macOS binary...');
    execFileSync('codesign', ['--sign', '-', outputPath], { stdio: 'inherit' });
  }

  if (platform !== 'win32') {
    chmodSync(outputPath, '755');
  }

  const sizeMB = (readFileSync(outputPath).length / 1024 / 1024).toFixed(1);
  console.log(`✅ SEA binary built: ${outputPath} (${sizeMB} MB)`);
} finally {
  // Cleanup temp files
  try { rmSync(configPath, { force: true }); } catch {}
  try { rmSync(blobPath, { force: true }); } catch {}
  try { rmSync(seaEntry, { force: true }); } catch {}
}
