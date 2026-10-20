// Bundles magicards/src into the single ES module the page loads.
//   npm run build            one-off minified build
//   npm run watch            rebuild on change and serve the site on http://localhost:8123
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');

const options = {
  entryPoints: [path.join(SITE, 'magicards', 'src', 'main.js')],
  outfile: path.join(SITE, 'magicards', 'assets', 'js', 'magicards.js'),
  bundle: true,
  nodePaths: [path.join(HERE, 'node_modules')],
  format: 'esm',
  target: ['es2020'],
  minify: true,
  legalComments: 'eof',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: SITE, port: 8123 });
  console.log(`Serving ${SITE} on http://localhost:${port}/magicards/`);
} else {
  await esbuild.build(options);
}
