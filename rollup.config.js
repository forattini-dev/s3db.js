import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import esbuild, { minify } from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import terser from '@rollup/plugin-terser';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

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
        terser()
      ],
    },
    {
      format: 'iife',
      file: 'dist/s3db.iife.js',
      inlineDynamicImports: true,
      name: 'S3DB',
      plugins: [],
    },
    {
      format: 'iife',
      file: 'dist/s3db.iife.min.js',
      inlineDynamicImports: true,
      name: 'S3DB',
      plugins: [
        terser()
      ],
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
        terser()
      ],
    },
  ],

  plugins: [
    commonjs(),
    resolve(),
    json(),
    nodePolyfills(),
    
    // Copy TypeScript definitions to dist
    {
      name: 'copy-types',
      writeBundle() {
        const sourceFile = 'src/s3db.d.ts';
        const targetFile = 'dist/s3db.d.ts';
        
        if (existsSync(sourceFile)) {
          // Ensure dist directory exists
          const distDir = dirname(targetFile);
          if (!existsSync(distDir)) {
            mkdirSync(distDir, { recursive: true });
          }
          
          copyFileSync(sourceFile, targetFile);
          console.log(`✅ Copied ${sourceFile} to ${targetFile}`);
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
      define: {
        __PACKAGE_VERSION__: `"${packageJson.version}"`
      }
    })
  ],

  external: [
    '@aws-sdk/client-s3',
    '@aws-sdk/client-sqs',
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
    'pg',
    'uuid',
    'zlib',
  ],
};