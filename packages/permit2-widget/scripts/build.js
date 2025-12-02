const esbuild = require('esbuild');
const path = require('path');

const root = path.resolve(__dirname, '..');
esbuild.build({
  entryPoints: [path.join(root, 'src', 'index.js')],
  bundle: true,
  minify: true,
  format: 'cjs',
  platform: 'browser',
  outfile: path.join(root, 'dist', 'index.cjs.js')
}).catch(() => process.exit(1));

esbuild.build({
  entryPoints: [path.join(root, 'src', 'index.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  outfile: path.join(root, 'dist', 'index.esm.js')
}).catch(() => process.exit(1));
