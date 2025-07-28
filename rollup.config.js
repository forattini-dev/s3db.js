import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import esbuild, { minify } from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import terser from '@rollup/plugin-terser';
import { readFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { dirname } from 'path';

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

export default {
  input: 'src/index.js',

  output: [
    // CommonJS for Node.js
    {
      format: 'cjs',
      file: 'dist/s3db.cjs.js',
      inlineDynamicImports: true,
      exports: 'named',
    },
    {
      format: 'cjs',
      file: 'dist/s3db.cjs.min.js',
      inlineDynamicImports: true,
      exports: 'named',
      plugins: [terser()],
    },
    // ES Modules for modern bundlers and Node.js
    {
      format: 'es',
      file: 'dist/s3db.es.js',
      inlineDynamicImports: true,
      exports: 'named',
    },
    {
      format: 'es',
      file: 'dist/s3db.es.min.js',
      inlineDynamicImports: true,
      exports: 'named',
      plugins: [terser()],
    },
    // IIFE for browser CDN usage
    {
      format: 'iife',
      file: 'dist/s3db.iife.js',
      inlineDynamicImports: true,
      name: 'S3DB',
      exports: 'named',
      globals: {
        // Nomes reais dos CDNs populares
        'nanoid': 'nanoid',
        'lodash-es': '_', 
        '@aws-sdk/client-s3': 'AWS',
        'fastest-validator': 'FastestValidator',
        'json-stable-stringify': 'stringify',
        'flat': 'flat',
        '@supercharge/promise-pool': 'PromisePool',
        // Node.js built-ins (polyfilled automaticamente)
        'crypto': 'crypto',
        'zlib': 'zlib',
        'node:stream/web': 'streams'
      },
    },
    {
      format: 'iife',
      file: 'dist/s3db.iife.min.js',
      inlineDynamicImports: true,
      name: 'S3DB',
      exports: 'named',
      globals: {
        'nanoid': 'nanoid',
        'lodash-es': '_',
        '@aws-sdk/client-s3': 'AWS', 
        'fastest-validator': 'FastestValidator',
        'json-stable-stringify': 'stringify',
        'flat': 'flat',
        '@supercharge/promise-pool': 'PromisePool',
        'crypto': 'crypto',
        'zlib': 'zlib',
        'node:stream/web': 'streams'
      },
      plugins: [terser()],
    },
  ],

  plugins: [
    commonjs(),
    resolve({
      preferBuiltins: false,
      browser: true, // Prefer browser versions when available
    }),
    json(),
    nodePolyfills({
      include: ['crypto', 'zlib'],
      preferBuiltins: false,
    }),
    
    // Copy TypeScript definitions to dist (only once)
    {
      name: 'copy-types',
      buildEnd() {
        const sourceFile = 'src/s3db.d.ts';
        const targetFile = 'dist/s3db.d.ts';
        
        if (existsSync(sourceFile)) {
          // Ensure dist directory exists
          const distDir = dirname(targetFile);
          if (!existsSync(distDir)) {
            mkdirSync(distDir, { recursive: true });
          }
          
          // Only copy if target doesn't exist or source is newer
          let shouldCopy = !existsSync(targetFile);
          if (!shouldCopy) {
            const sourceStats = statSync(sourceFile);
            const targetStats = statSync(targetFile);
            shouldCopy = sourceStats.mtime > targetStats.mtime;
          }
          
          if (shouldCopy) {
            copyFileSync(sourceFile, targetFile);
            console.log(`✅ Copied ${sourceFile} to ${targetFile}`);
          }
        }
      }
    },
    
    // Replace __PACKAGE_VERSION__ with actual version during build
    {
      name: 'version-replacement',
      transform(code, id) {
        if (id.includes('database.class.js')) {
          return code.replace(/__PACKAGE_VERSION__/g, `"${packageJson.version}"`);
        }
        return null;
      }
    },
    
    esbuild({
      sourceMap: true,
      target: 'esnext',
      format: 'esm',
      treeShaking: true,
      define: {
        __PACKAGE_VERSION__: `"${packageJson.version}"`
      }
    })
  ],

  external: [
    '@aws-sdk/client-s3',
    '@aws-sdk/client-sqs',
    '@smithy/node-http-handler',
    '@google-cloud/bigquery',
    '@supercharge/promise-pool',
    'avsc',
    'amqplib',
    'crypto',
    'fastest-validator',
    'json-stable-stringify',
    'flat',
    'lodash-es',
    'nanoid',
    'node:stream/web',
    'pg',
    'uuid',
    'zlib',
  ],
};