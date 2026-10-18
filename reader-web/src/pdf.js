// PDF books for foliate-js, adapted from foliate-js's pdf.js (MIT). pdf.js itself (pdfjs-dist) is not part of
// the reader bundle: `pdfjs.webjs` and `pdf.worker.webjs` sit next to reader.html and are loaded as classic
// scripts the first time a PDF opens. Both run on the main thread: WKWebView serves the page from a file URL,
// where module workers are off limits, and pdf.js falls back to its in-page worker when `pdfjsWorker` is
// already a global.

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

const render = async (lib, page, doc, zoom) => {
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

export const makePDF = async (file) => {
  const lib = await pdfjs();
  const transport = new lib.PDFDataRangeTransport(file.size, []);
  transport.requestDataRange = (begin, end) => {
    file
      .slice(begin, end)
      .arrayBuffer()
      .then((chunk) => transport.onDataRange(begin, chunk));
  };
  const pdf = await lib.getDocument({ range: transport, isEvalSupported: false }).promise;

  const book = { rendition: { layout: 'pre-paginated' } };
  const { metadata, info } = (await pdf.getMetadata()) ?? {};
  book.metadata = {
    title: metadata?.get('dc:title') ?? info?.Title,
    author: metadata?.get('dc:creator') ?? info?.Author,
    description: metadata?.get('dc:description') ?? info?.Subject,
    language: metadata?.get('dc:language'),
    publisher: metadata?.get('dc:publisher'),
  };
  const outline = await pdf.getOutline().catch(() => null);
  book.toc = outline ? await Promise.all(outline.map((i) => makeTOCItem(pdf, i))) : [];

  const cache = new Map();
  book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
    id: i,
    load: async () => {
      const cached = cache.get(i);
      if (cached) return cached;
      const page = await pdf.getPage(i + 1);
      const src = pageDocument(page.getViewport({ scale: 1 }));
      const onZoom = ({ doc, scale }) => render(lib, page, doc, scale);
      const result = { src, onZoom };
      cache.set(i, result);
      return result;
    },
    // Search needs a document per section; a page of text is enough to find and jump to the right page.
    createDocument: async () => {
      const page = await pdf.getPage(i + 1);
      const { items } = await page.getTextContent();
      const lines = [];
      let line = '';
      for (const it of items) {
        line += it.str ?? '';
        if (it.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      const html = `<!DOCTYPE html><html><body>${lines
        .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
        .join('')}</body></html>`;
      return new DOMParser().parseFromString(html, 'text/html');
    },
    size: 1000,
  }));
  book.isExternal = (uri) => /^\w+:/i.test(uri);
  // "12" is a page index (TOC); anything else is a JSON destination from a link inside a page.
  book.resolveHref = (href) =>
    /^\d+$/.test(href)
      ? { index: Number(href) }
      : pageIndexOf(pdf, JSON.parse(href)).then((index) => ({ index }));
  book.splitTOCHref = (href) => [Number(href), null];
  book.getTOCFragment = (doc) => doc.documentElement;
  book.destroy = () => pdf.destroy();
  return book;
};
