import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { terser } from 'rollup-plugin-terser';
import shebang from 'rollup-plugin-shebang-bin';

export default {
  input: 'src/cli/index.js',
  output: {
    file: 'dist/s3db-cli.js',
    format: 'cjs', // CommonJS for pkg compatibility
    banner: '#!/usr/bin/env node'
  },
  external: [
    // Keep AWS SDK external as it's large
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
    '@smithy/node-http-handler',
    
    // These will be bundled by pkg
    'fs',
    'path',
    'os',
    'crypto',
    'stream',
    'util',
    'events',
    'buffer',
    'child_process',
    'repl'
  ],
  plugins: [
    shebang(),
    json(),
    resolve({
      preferBuiltins: true,
      exportConditions: ['node']
    }),
    commonjs(),
    terser({
      compress: {
        drop_console: false, // Keep console for CLI
        drop_debugger: true
      },
      mangle: {
        keep_fnames: true // Keep function names for debugging
      }
    })
  ]
};