// Bundles reader-web (foliate-js + bridge) into one self-contained HTML asset for the WebView.
import terser from '@rollup/plugin-terser';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const debug = !!process.env.READER_DEBUG;

// Grimmory's vendored foliate-js omits pdf.js; `view.js` still dynamically imports it, which resolves to ours.
const ourPdf = {
  name: 'arcanum-pdf',
  resolveId(id, importer) {
    return id === './pdf.js' && importer?.includes('/foliate/') ? resolve(root, 'reader-web/src/pdf.js') : null;
  },
};

// `import css from './x.css'` yields the stylesheet as a string (pdf.js layer styles go into each page frame).
const cssString = {
  name: 'css-string',
  transform(code, id) {
    return id.endsWith('.css') ? { code: `export default ${JSON.stringify(code)};`, map: null } : null;
  },
};

const bundle = await rollup({
  input: resolve(root, 'reader-web/src/main.js'),
  plugins: [ourPdf, cssString, ...(debug ? [] : [terser({ format: { comments: false } })])],
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

// pdf.js ships as ES modules; WKWebView cannot load those from a file URL, so each becomes a classic
// script (both set their own globals: pdfjsLib and pdfjsWorker). They are copied next to reader.html on the
// device and fetched only when a PDF opens. `.webjs` keeps Metro from treating them as app source.
for (const [input, out] of [
  ['pdfjs-dist/build/pdf.min.mjs', 'pdfjs.webjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.webjs'],
]) {
  const b = await rollup({ input: resolve(root, 'node_modules', input), onwarn() {} });
  const { output: o } = await b.generate({ format: 'iife', name: 'pdfjsModule' });
  await b.close();
  writeFileSync(resolve(root, 'assets/reader', out), o[0].code);
  console.log(`${out}: ${(o[0].code.length / 1024).toFixed(0)} KB`);
}
