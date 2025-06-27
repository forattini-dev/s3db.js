import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import esbuild, { minify } from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { readFileSync } from 'fs';

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

// Plugin to copy types file
const copyTypesPlugin = {
  name: 'copy-types',
  writeBundle() {
    // Copy the types file to dist if it exists
    try {
      const fs = require('fs');
      if (fs.existsSync('./dist/s3db.d.ts')) {
        console.log('✅ Types file already exists in dist/');
      }
    } catch (error) {
      console.log('⚠️  Types file not found, you may need to create it manually');
    }
  }
};

export default {
  input: 'src/index.js',

  output: [
    {
      format: 'cjs',
      file: 'dist/s3db.cjs.js',
      inlineDynamicImports: true,
      plugins: [],
    },
    {
      format: 'cjs',
      file: 'dist/s3db.cjs.min.js',
      inlineDynamicImports: true,
      plugins: [
        minify(),
      ],
    },
    {
      format: 'iife',
      file: 'dist/s3db.iife.js',
      name: 's3db',
      inlineDynamicImports: true,
      plugins: [],
      globals: {
        'nanoid': 'nanoid',
        'lodash-es': 'lodashEs',
        '@supercharge/promise-pool': 'promisePool',
        '@aws-sdk/client-s3': 'clientS3',
        'crypto': 'crypto',
        'flat': 'flat',
        'fastest-validator': 'FastestValidator',
        'node:stream/web': 'web'
      }
    },
    {
      format: 'iife',
      file: 'dist/s3db.iife.min.js',
      name: 's3db',
      inlineDynamicImports: true,
      plugins: [
        minify(),
      ],
      globals: {
        'nanoid': 'nanoid',
        'lodash-es': 'lodashEs',
        '@supercharge/promise-pool': 'promisePool',
        '@aws-sdk/client-s3': 'clientS3',
        'crypto': 'crypto',
        'flat': 'flat',
        'fastest-validator': 'FastestValidator',
        'node:stream/web': 'web'
      }
    },
    {
      format: 'es',
      file: 'dist/s3db.es.js',
      inlineDynamicImports: true,
      plugins: [],
    },
    {
      format: 'es',
      file: 'dist/s3db.es.min.js',
      inlineDynamicImports: true,
      plugins: [
        minify(),
      ],
    },
  ],

  plugins: [
    commonjs(),
    resolve(),
    json(),
    nodePolyfills({
      include: ['crypto', 'node:stream/web'],
      globals: {
        Buffer: true,
        global: true,
        process: true
      }
    }),
    
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
      define: {
        __PACKAGE_VERSION__: `"${packageJson.version}"`
      }
    }),

    copyTypesPlugin
  ],

  external: [
    'crypto',
    '@aws-sdk/client-s3',
    '@supercharge/promise-pool',
    'avsc',
    'fastest-validator',
    'flat',
    'lodash-es',
    'nanoid'
  ],
};
