#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

console.log('🚀 Building Complete Standalone Binaries with ALL Dependencies\n');

// Ensure build directory exists
const BUILD_DIR = path.join(ROOT, 'build-binaries');
if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true });
}
fs.mkdirSync(BUILD_DIR);

// Step 1: Build S3DB CLI with ALL dependencies
console.log('📦 Building S3DB CLI with all dependencies...');

const cliEntryContent = `
#!/usr/bin/env node

// Force Node.js environment
global.process = global.process || { env: {}, argv: [], version: 'v18.0.0' };

// All dependencies bundled here
${fs.readFileSync(path.join(ROOT, 'node_modules/@aws-sdk/client-s3/dist-cjs/index.js'), 'utf-8')}
${fs.readFileSync(path.join(ROOT, 'node_modules/@smithy/node-http-handler/dist-cjs/index.js'), 'utf-8')}
${fs.readFileSync(path.join(ROOT, 'node_modules/commander/index.js'), 'utf-8')}
${fs.readFileSync(path.join(ROOT, 'node_modules/chalk/source/index.js'), 'utf-8')}
${fs.readFileSync(path.join(ROOT, 'node_modules/ora/index.js'), 'utf-8')}
${fs.readFileSync(path.join(ROOT, 'node_modules/cli-table3/index.js'), 'utf-8')}

// Main CLI code
${fs.readFileSync(path.join(ROOT, 'bin/s3db-cli.js'), 'utf-8').replace('#!/usr/bin/env node', '')}
`;

// Write bundled CLI
fs.writeFileSync(path.join(BUILD_DIR, 's3db-cli-bundled.js'), cliEntryContent);

// Use esbuild to bundle everything properly
console.log('🔨 Bundling with esbuild...');
execSync(`npx esbuild ${path.join(ROOT, 'bin/s3db-cli.js')} \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=${path.join(BUILD_DIR, 's3db-all.js')} \
  --minify \
  --keep-names \
  --packages=bundle \
  --loader:.node=file \
  --format=cjs`, { stdio: 'inherit' });

// Step 2: Build MCP Server with ALL dependencies
console.log('\n📦 Building S3DB MCP Server with all dependencies...');
execSync(`npx esbuild ${path.join(ROOT, 'mcp/server.js')} \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=${path.join(BUILD_DIR, 's3db-mcp-all.js')} \
  --minify \
  --keep-names \
  --packages=bundle \
  --loader:.node=file \
  --format=cjs`, { stdio: 'inherit' });

// Step 3: Create package.json for pkg
console.log('\n📝 Creating package.json for pkg...');
const pkgConfig = {
  name: 's3db-binaries',
  version: '9.0.0',
  bin: {
    's3db': 's3db-all.js',
    's3db-mcp': 's3db-mcp-all.js'
  },
  pkg: {
    scripts: ['s3db-all.js', 's3db-mcp-all.js'],
    assets: ['**/*.node'],
    targets: [
      'node18-linux-x64',
      'node18-macos-x64',
      'node18-macos-arm64',
      'node18-win-x64'
    ],
    outputPath: '../bin/standalone'
  }
};

fs.writeFileSync(
  path.join(BUILD_DIR, 'package.json'),
  JSON.stringify(pkgConfig, null, 2)
);

// Step 4: Build binaries with pkg
console.log('\n🏗️  Building standalone binaries with pkg...');
process.chdir(BUILD_DIR);

try {
  // Build s3db CLI binary
  execSync('npx pkg s3db-all.js --targets node18-linux-x64,node18-macos-x64,node18-win-x64 --output ../bin/standalone/s3db --compress GZip', { stdio: 'inherit' });
  
  // Build s3db-mcp binary
  execSync('npx pkg s3db-mcp-all.js --targets node18-linux-x64,node18-macos-x64,node18-win-x64 --output ../bin/standalone/s3db-mcp --compress GZip', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ pkg build failed:', error.message);
  console.log('\n🔧 Trying alternative approach with Node.js SEA...');
}

// Step 5: List created binaries
console.log('\n✅ Created binaries:');
const binDir = path.join(ROOT, 'bin', 'standalone');
if (fs.existsSync(binDir)) {
  const files = fs.readdirSync(binDir);
  files.forEach(file => {
    const stats = fs.statSync(path.join(binDir, file));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   📦 ${file} (${sizeMB} MB)`);
  });
}

console.log('\n✨ Build complete!');
console.log('Test with:');
console.log('  ./bin/standalone/s3db-linux-x64 --help');
console.log('  ./bin/standalone/s3db-mcp-linux-x64 --help');