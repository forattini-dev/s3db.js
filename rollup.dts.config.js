import dts from 'rollup-plugin-dts';

export default [
  {
    input: './dist/types/index.d.ts',
    output: [{ file: 'dist/s3db.d.ts', format: 'es' }],
    plugins: [dts()],
  },
  {
    input: './dist/types/lite.d.ts',
    output: [{ file: 'dist/s3db-lite.d.ts', format: 'es' }],
    plugins: [dts()],
  }
];
