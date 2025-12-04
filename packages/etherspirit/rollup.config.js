import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default {
  input: 'src/index.js',
  output: [
    { file: 'dist/etherspirit.esm.js', format: 'es' },
    { file: 'dist/etherspirit.umd.js', format: 'umd', name: 'ETHERSpirit', globals: {} }
  ],
  plugins: [resolve(), commonjs(), terser()]
};
