import dts from 'rollup-plugin-dts';

export default {
  input: './dist/types/index.d.ts', // Input from tsc output to dist/types
  output: [{ file: 'dist/s3db.d.ts', format: 'es' }],
  plugins: [dts()],
};
