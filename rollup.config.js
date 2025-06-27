import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import esbuild, { minify } from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { readFileSync } from 'fs';

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
        minify(),
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
        minify(),
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
        minify(),
      ],
    },
  ],

  plugins: [
    commonjs(),
    resolve(),
    json(),
    nodePolyfills(),
    
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