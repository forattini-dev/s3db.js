import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import esbuild, { minify } from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';

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
      plugins: [],
    },
    {
      format: 'iife',
      file: 'dist/s3db.iife.min.js',
      inlineDynamicImports: true,
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
    
    esbuild({
      sourceMap: true,
      target: 'esnext',
    })
  ],

  external: [
    '@aws-sdk/client-s3',
    '@supercharge/promise-pool',
    'avsc',
    'crypto-js',
    'fastest-validator',
    'flat',
    'lodash-es',
    'nanoid'
  ],
};
