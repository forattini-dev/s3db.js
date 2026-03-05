#!/usr/bin/env node

import { build } from 'esbuild';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

console.log('📦 Bundling CLI for binary distribution...');

const outfile = 'dist/bin/s3db.cjs';

// Plugin to keep node:sqlite from breaking the SEA bundle path
const nodeSqliteStubPlugin = {
  name: 'node-sqlite-stub',
  setup(build) {
    build.onResolve({ filter: /^node:sqlite$/ }, args => ({
      path: args.path,
      namespace: 'sqlite-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'sqlite-stub' }, () => ({
      contents: 'module.exports = {};',
      loader: 'js',
    }));
  },
};

try {
  mkdirSync(dirname(outfile), { recursive: true });

  await build({
    entryPoints: ['src/cli/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: outfile,
    format: 'cjs',
    sourcemap: false,
    minify: false,
    logOverride: {
      'empty-import-meta': 'silent', // We polyfill import.meta.url in post-processing
    },
    plugins: [nodeSqliteStubPlugin],
    external: [
      'fsevents',
      'sharp',
      'onnxruntime-node',
      'fastembed',
      '@anush008/tokenizers',
      'mock-aws-s3',
      'nock',
      'puppeteer',
      'puppeteer-core',
    ],
  });

  let content = readFileSync(outfile, 'utf-8');
  
  // 1. Remove shebangs
  content = content.replace(/^#!.*\n/gm, '');

  // 2. Polyfill import.meta.url (both source pattern and esbuild's CJS output pattern)
  content = content.replace(/import\.meta\.url/g, "require('url').pathToFileURL(__filename).toString()");
  content = content.replace(/var (import_meta\d*) = \{\};/g, 'var $1 = { url: require("url").pathToFileURL(__filename).toString() };');

  // 3. Inject version (esbuild bundles from src/ which has the placeholder)
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  content = content.replace(
    /(?:var|const|let)\s+VERSION\d*\s*=\s*["']__INJECT_VERSION__["']/g,
    (match) => match.replace('__INJECT_VERSION__', pkg.version)
  );
  
  // 4. Add header with File polyfill for Node 18/SEA runtime
  const header = `#!/usr/bin/env node
if (typeof File === 'undefined') {
  global.File = class File extends Blob {
    constructor(fileBits, fileName, options) {
      super(fileBits, options);
      this.name = fileName;
      this.lastModified = options?.lastModified || Date.now();
    }
  };
}
`;
  content = header + content;

  writeFileSync(outfile, content);

  try {
    chmodSync(outfile, '755');
  } catch (e) { }

  console.log(`✅ CLI bundled successfully at ${outfile}`);

} catch (e) {
  console.error('❌ Bundling failed:', e);
  process.exit(1);
}
