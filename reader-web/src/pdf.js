// PDF books for foliate-js, adapted from foliate-js's pdf.js (MIT). pdf.js itself (pdfjs-dist) is not part of
// the reader bundle: `pdfjs.webjs` and `pdf.worker.webjs` sit next to reader.html and are loaded as classic
// scripts the first time a PDF opens. Both run on the main thread: WKWebView serves the page from a file URL,
// where module workers are off limits, and pdf.js falls back to its in-page worker when `pdfjsWorker` is
// already a global.
//
// Two ways to read a PDF:
//  - pages: each page rendered to a canvas with a text layer (fixed layout; what the file looks like)
//  - reflow: the text pulled out of each page and rebuilt as paragraphs and headings, read like an EPUB with
//    every typography setting working. One section per page in both modes, so a position (`epubcfi(/6/N)`,
//    N = 2 × page) survives switching, and progress is still kept by page.

import textLayerCSS from '../pdf/text_layer_builder.css';
import annotationLayerCSS from '../pdf/annotation_layer_builder.css';

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

async function pdfjs() {
  if (!loading)
    loading = (async () => {
      // pdf.js 4.x needs Promise.withResolvers (Safari 17.4); older WebKit gets this shim.
      if (!Promise.withResolvers)
        Promise.withResolvers = function withResolvers() {
          let resolve, reject;
          const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
          return { promise, resolve, reject };
        };
      await loadScript('pdfjs.webjs');
      await loadScript('pdf.worker.webjs');
      const lib = globalThis.pdfjsLib;
      if (!lib) throw new Error('pdf.js did not initialise');
      return lib;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

const renderPage = async (lib, page, doc, zoom) => {
  const scale = zoom * devicePixelRatio;
  doc.documentElement.style.transform = `scale(${1 / devicePixelRatio})`;
  doc.documentElement.style.transformOrigin = 'top left';
  doc.documentElement.style.setProperty('--scale-factor', scale);
  const viewport = page.getViewport({ scale });

  // The canvas must belong to this document (where pdf.js loaded the fonts), then move into the frame.
  const canvas = document.createElement('canvas');
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  doc.querySelector('#canvas').replaceChildren(doc.adoptNode(canvas));

  const container = doc.querySelector('.textLayer');
  container.replaceChildren();
  const textLayer = new lib.TextLayer({
    textContentSource: await page.streamTextContent(),
    container,
    viewport,
  });
  await textLayer.render();
  for (const c of document.querySelectorAll('.hiddenCanvasElement'))
    Object.assign(c.style, { position: 'absolute', top: '0', left: '0', width: '0', height: '0', display: 'none' });
  const endOfContent = document.createElement('div');
  endOfContent.className = 'endOfContent';
  container.append(endOfContent);

  try {
    const div = doc.querySelector('.annotationLayer');
    div.replaceChildren();
    const linkService = {
      goToDestination: () => {},
      getDestinationHash: (dest) => JSON.stringify(dest),
      addLinkAttributes: (link, url) => (link.href = url),
    };
    await new lib.AnnotationLayer({ page, viewport, div, linkService }).render({
      annotations: await page.getAnnotations(),
    });
  } catch {
    // Links and form widgets are decoration; the page itself is already drawn.
  }
};

const pageDocument = (viewport) =>
  URL.createObjectURL(
    new Blob(
      [
        `<!DOCTYPE html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
<style>
html, body { margin: 0; padding: 0; }
:root {
  --user-unit: 1;
  --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
  --scale-round-x: 1px;
  --scale-round-y: 1px;
}
${textLayerCSS}
${annotationLayerCSS}
</style>
<div id="canvas"></div>
<div class="textLayer"></div>
<div class="annotationLayer"></div>`,
      ],
      { type: 'text/html' },
    ),
  );

// Outline entries resolve to page indexes up front: the vendored view.js does not await `resolveHref`, so
// hrefs must resolve synchronously. Links inside pages still carry JSON destinations (see resolveHref).
const makeTOCItem = async (pdf, item) => ({
  label: item.title,
  href: String(await pageIndexOf(pdf, item.dest).catch(() => 0)),
  subitems: item.items?.length ? await Promise.all(item.items.map((i) => makeTOCItem(pdf, i))) : null,
});

const pageIndexOf = async (pdf, destOrName) => {
  const dest = typeof destOrName === 'string' ? await pdf.getDestination(destOrName) : destOrName;
  return pdf.getPageIndex(dest[0]);
};

async function loadPdf(file) {
  const lib = await pdfjs();
  const transport = new lib.PDFDataRangeTransport(file.size, []);
  transport.requestDataRange = (begin, end) => {
    file
      .slice(begin, end)
      .arrayBuffer()
      .then((chunk) => transport.onDataRange(begin, chunk));
  };
  const pdf = await lib.getDocument({ range: transport, isEvalSupported: false }).promise;
  const { metadata, info } = (await pdf.getMetadata()) ?? {};
  const book = {
    metadata: {
      title: metadata?.get('dc:title') ?? info?.Title,
      author: metadata?.get('dc:creator') ?? info?.Author,
      description: metadata?.get('dc:description') ?? info?.Subject,
      language: metadata?.get('dc:language'),
      publisher: metadata?.get('dc:publisher'),
    },
  };
  const outline = await pdf.getOutline().catch(() => null);
  book.toc = outline ? await Promise.all(outline.map((i) => makeTOCItem(pdf, i))) : [];
  // "12" is a page index (TOC); anything else is a JSON destination from a link inside a page.
  book.resolveHref = (href) =>
    /^\d+$/.test(href)
      ? { index: Number(href) }
      : pageIndexOf(pdf, JSON.parse(href)).then((index) => ({ index }));
  book.splitTOCHref = (href) => [Number(href), null];
  book.getTOCFragment = (doc) => doc.documentElement;
  book.isExternal = (uri) => /^\w+:/i.test(uri);
  book.destroy = () => pdf.destroy();
  return { lib, pdf, book };
}

// OCR layers sometimes report a width that runs on past the word (to the next word box, or the end of
// the line), which hides the gap before the next item and glues words together; no glyph is wider than
// its em, so that is the ceiling.
const itemWidth = (it, size) => Math.min(it.width ?? 0, Math.max(1, (it.str ?? '').length) * size);

/** Lines of text on a page, top to bottom, from pdf.js text items. */
async function pageLines(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const { items } = await page.getTextContent();
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (!('str' in it)) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const size = Math.hypot(it.transform[0], it.transform[1]) || it.height || 0;
    if (cur && Math.abs(cur.y - y) <= Math.max(2, size * 0.4)) {
      const gap = x - cur.right;
      if (it.str)
        cur.text +=
          (gap > size * 0.15 && !cur.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
      cur.right = Math.max(cur.right, x + itemWidth(it, size));
      cur.size = Math.max(cur.size, size);
    } else {
      cur = { text: it.str ?? '', x, y, right: x + itemWidth(it, size), size };
      lines.push(cur);
    }
    if (it.hasEOL) cur = null;
  }
  // OCR layers mark a line-end hyphenation with a soft hyphen (U+00AD, invisible when drawn) or a Unicode
  // hyphen; make it the plain hyphen the paragraph builder joins on, and drop soft hyphens elsewhere.
  const tidy = (t) =>
    t
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[\u00ad\u2010\u2011]\s*$/, '-')
      .replace(/\u00ad/g, '');
  return lines.map((l) => ({ ...l, text: tidy(l.text) })).filter((l) => l.text);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Paragraphs and headings for one page. A new paragraph starts after a line that ended early with a full
 * stop, at an indented line, or after a larger vertical gap; a line much bigger than the page's text is a
 * heading. Running heads and page numbers (short lines repeated across pages) are dropped. A page whose
 * first line continues a sentence from the previous page is marked so it gets no paragraph gap.
 */
function pageBlocks(lines, stats, running) {
  const blocks = [];
  let para = null;
  let prev = null;
  const push = () => {
    if (para && para.text) blocks.push(para);
    para = null;
  };
  lines = lines.map((l) => ({ ...l }));
  // A drop cap is one big letter on its own baseline; give it back to the paragraph it starts.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/^[A-Za-z]$/.test(l.text) || l.size <= stats.size * 1.6) continue;
    const next = lines[i + 1]?.text && /^[a-z]/.test(lines[i + 1].text) ? lines[i + 1] : null;
    const before = !next && lines[i - 1]?.text && /^[a-z]/.test(lines[i - 1].text) ? lines[i - 1] : null;
    const target = next ?? before;
    if (!target) continue;
    target.text = l.text + target.text;
    lines.splice(i, 1);
    i--;
  }
  // A running head sharing a line with other text (the chapter title on the facing page of a scan).
  const heads = [...running].filter((r) => r.length >= 8);
  for (const line of lines) {
    const key = line.text.toLowerCase();
    for (const r of heads) {
      if (key.length > r.length && key.startsWith(r)) line.text = line.text.slice(r.length).trim();
      else if (key.length > r.length && key.endsWith(r)) line.text = line.text.slice(0, -r.length).trim();
    }
  }
  for (const line of lines) {
    const key = line.text.toLowerCase();
    if (!key || /^[\divxlc]+$/i.test(key) || running.has(key)) continue;
    const heading = line.size > stats.size * 1.25 && line.text.length < 90;
    if (heading) {
      push();
      blocks.push({ text: line.text, heading: true });
      prev = { ...line, heading: true };
      continue;
    }
    const gap = prev ? prev.y - line.y : 0;
    const endedEarly = !!prev && prev.right < stats.right - stats.size * 2 && /[.!?:”"')\]]$/.test(prev.text);
    const indented = line.x > stats.left + stats.size * 0.8;
    const bigGap = !!prev && gap > stats.gap * 1.6;
    if (!para || (prev && !prev.heading && (endedEarly || indented || bigGap))) {
      push();
      para = { text: line.text, cont: !prev && !indented && /^[a-z]/.test(line.text) };
    } else if (para.text.endsWith('-') && /^[a-z]/.test(line.text)) para.text = para.text.slice(0, -1) + line.text;
    else para.text += ' ' + line.text;
    prev = line;
  }
  push();
  return blocks;
}

async function reflowSections(pdf) {
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) pages.push(await pageLines(pdf, p));
  const all = pages.flat();
  const stats = {
    size: median(all.map((l) => l.size).filter(Boolean)) || 10,
    left: median(all.map((l) => l.x)),
    right: median(all.map((l) => l.right)),
    gap: 0,
  };
  const gaps = [];
  for (const ls of pages) for (let i = 1; i < ls.length; i++) gaps.push(ls[i - 1].y - ls[i].y);
  stats.gap = median(gaps.filter((g) => g > 0)) || stats.size * 1.2;
  // Lines that recur on many pages: title, author or chapter name in a running head, "Page 3 of 200".
  const seen = new Map();
  for (const ls of pages)
    for (const l of [ls[0], ls[1], ls[ls.length - 2], ls[ls.length - 1]].filter(Boolean))
      if (l.text.length < 70) seen.set(l.text.toLowerCase(), (seen.get(l.text.toLowerCase()) ?? 0) + 1);
  const running = new Set([...seen].filter(([, n]) => n >= Math.max(3, pages.length * 0.2)).map(([k]) => k));
  const chars = all.reduce((n, l) => n + l.text.length, 0);
  return { pages: pages.map((ls) => pageBlocks(ls, stats, running)), chars };
}

const renderHtml = (blocks, pageNumber) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Page ${pageNumber}</title>
<style>body { max-width: 40em; margin: 0 auto; } p { margin: 0 0 1em; } p.cont { margin-top: 0; } h2 { margin: 1.5em 0 1em; }</style>
</head><body>${blocks
    .map((b) => (b.heading ? `<h2>${esc(b.text)}</h2>` : `<p${b.cont ? ' class="cont"' : ''}>${esc(b.text)}</p>`))
    .join('\n')}</body></html>`;

const mulMatrix = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

const samplePages = (n) => [...new Set([1, 2, Math.ceil(n / 2), n].filter((p) => p >= 1 && p <= n))];

/**
 * True when the sampled pages are each one image covering the page: a scan, whether or not OCR text was
 * laid over it. Images are painted into the unit square under the current transform, so its scale is
 * the drawn size.
 */
async function isScanned(pdf, lib) {
  const O = lib.OPS;
  const paints = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintJpegXObject].filter((x) => x != null));
  let scans = 0;
  const sample = samplePages(pdf.numPages);
  for (const p of sample) {
    const page = await pdf.getPage(p);
    const { width, height } = page.getViewport({ scale: 1 });
    const { fnArray, argsArray } = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let full = false;
    for (let i = 0; i < fnArray.length && !full; i++) {
      const fn = fnArray[i];
      if (fn === O.save) stack.push(ctm);
      else if (fn === O.restore) ctm = stack.pop() ?? ctm;
      else if (fn === O.transform) ctm = mulMatrix(argsArray[i], ctm);
      else if (paints.has(fn)) {
        const w = Math.hypot(ctm[0], ctm[1]);
        const h = Math.hypot(ctm[2], ctm[3]);
        if (w >= width * 0.7 && h >= height * 0.7) full = true;
      }
    }
    if (full) scans++;
  }
  return scans >= Math.ceil(sample.length / 2);
}

/** Whether the sampled pages carry any text at all (a scan's OCR layer counts). */
async function hasText(pdf) {
  let chars = 0;
  for (const p of samplePages(pdf.numPages)) {
    for (const l of await pageLines(pdf, p)) chars += l.text.length;
    if (chars > 50) return true;
  }
  return false;
}

/**
 * Open a PDF. `reflow` asks for the text to be rebuilt as a reflowable book; a scan comes back as pages
 * unless `reflowScans` says otherwise, and a PDF with no text layer always does. `book.pdf` reports what
 * happened: `{ text, reflow, scanned }`.
 */
export const makePDF = async (file, { reflow = false, reflowScans = false } = {}) => {
  const { lib, pdf, book } = await loadPdf(file);
  const scanned = await isScanned(pdf, lib).catch((e) => {
    console.warn('[reader] scan check failed', e);
    return false;
  });

  if (scanned ? reflowScans : reflow) {
    const { pages, chars } = await reflowSections(pdf);
    if (chars > 200) {
      const urls = [];
      book.sections = pages.map((blocks, i) => {
        const html = renderHtml(blocks, i + 1);
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        urls.push(url);
        return {
          id: i,
          load: () => url,
          createDocument: () => new DOMParser().parseFromString(html, 'text/html'),
          size: Math.max(html.length, 200),
          linear: 'yes',
        };
      });
      book.pdf = { text: true, reflow: true, scanned };
      const destroy = book.destroy;
      book.destroy = () => {
        for (const u of urls) URL.revokeObjectURL(u);
        destroy();
      };
      return book;
    }
    book.pdf = { text: false, reflow: false, scanned };
  }

  book.rendition = { layout: 'pre-paginated' };
  book.pdf ??= { text: await hasText(pdf), reflow: false, scanned };
  book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
    id: i,
    load: async () => {
      const page = await pdf.getPage(i + 1);
      const src = pageDocument(page.getViewport({ scale: 1 }));
      const onZoom = ({ doc, scale }) => renderPage(lib, page, doc, scale);
      return { src, onZoom };
    },
    // Search needs a document per section; a page of text is enough to find and jump to the right page.
    createDocument: async () => {
      const lines = await pageLines(pdf, i + 1);
      const html = `<!DOCTYPE html><html><body>${lines.map((l) => `<p>${esc(l.text)}</p>`).join('')}</body></html>`;
      return new DOMParser().parseFromString(html, 'text/html');
    },
    size: 1000,
  }));
  return book;
};
