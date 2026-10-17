// Bundles reader-web (foliate-js + bridge) into one self-contained HTML asset for the WebView.
import terser from '@rollup/plugin-terser';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const debug = !!process.env.READER_DEBUG;

const stubPdf = {
  // Grimmory's vendored foliate-js omits pdf.js; the app only opens EPUBs.
  name: 'stub-pdf',
  resolveId(id) {
    return id === './pdf.js' ? '\0pdf-stub' : null;
  },
  load(id) {
    return id === '\0pdf-stub'
      ? 'export const makePDF = () => { throw new Error("PDF is not supported in this app") }'
      : null;
  },
};

const bundle = await rollup({
  input: resolve(root, 'reader-web/src/main.js'),
  plugins: [stubPdf, ...(debug ? [] : [terser({ format: { comments: false } })])],
  onwarn(w, warn) {
    if (w.code === 'CIRCULAR_DEPENDENCY' || w.code === 'EVAL') return;
    warn(w);
  },
});
const { output } = await bundle.generate({
  format: 'iife',
  inlineDynamicImports: true,
  name: 'ArcanumReader',
});
await bundle.close();

const js = output[0].code.replace(/<\/script/gi, '<\\/script');
// Note: not String.replace — `$$`/`$&` in a replacement string are special and would corrupt the bundle.
const template = readFileSync(resolve(root, 'reader-web/src/index.html'), 'utf8');
const marker = '<!--SCRIPT-->';
const at = template.indexOf(marker);
const html = `${template.slice(0, at)}<script>${js}</script>${template.slice(at + marker.length)}`;
mkdirSync(resolve(root, 'assets/reader'), { recursive: true });
writeFileSync(resolve(root, 'assets/reader/reader.html'), html);
console.log(`reader.html: ${(html.length / 1024).toFixed(0)} KB${debug ? ' (debug)' : ''}`);
