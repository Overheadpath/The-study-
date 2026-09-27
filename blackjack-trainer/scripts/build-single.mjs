// Bundles the whole app into one self-contained HTML file that can be opened
// straight from disk (no server needed):  npm run build
//   --fragment  writes page content only (no <html>/<head>/<body> wrapper), for
//               hosts that supply their own document skeleton.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fragment = process.argv.includes('--fragment');
const outFile = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || `${root}dist/blackjack-strategy-lab${fragment ? '.fragment' : ''}.html`;

const result = await build({
  entryPoints: [`${root}src/ui/main.js`],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'none',
  write: false,
  // Hosts that supply their own page skeleton (hosted previews) also block downloads.
  define: fragment ? { 'globalThis.__BJ_NO_DOWNLOAD__': 'true' } : {},
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(`${root}src/ui/styles.css`, 'utf8');
const fonts =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&family=Young+Serif&display=swap">';
const content = [
  '<title>Blackjack Strategy Lab</title>',
  fonts,
  `<style>\n${css}</style>`,
  '<div id="app"><noscript>Blackjack Strategy Lab needs JavaScript to run.</noscript></div>',
  `<script type="module">${js}</script>`,
].join('\n');

const html = fragment
  ? content
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${content.replace('<div id="app">', '</head>\n<body>\n<div id="app">')}\n</body>\n</html>\n`;

await mkdir(new URL('.', `file://${outFile}`), { recursive: true }).catch(() => {});
await writeFile(outFile, html);
console.log(`Wrote ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);
