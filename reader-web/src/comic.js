// Comic book archives for foliate-js: CBZ (zip) and CBR (RAR). A comic is a folder of page images, so each
// page becomes one pre-paginated section holding a single <img>, and foliate's fixed-layout renderer does
// the rest (fit-page zoom, two-page spreads with the cover alone, right-to-left for manga). Modelled on
// foliate-js's comic-book.js, with reading-order sorting, ComicInfo.xml metadata and RAR support added.
//
// RAR needs a decoder the browser does not have: `unrar.webjs` (node-unrar-js bundled as a classic script,
// global `ArcanumUnrar`) and `unrar.wasm` sit next to reader.html like pdf.js does and are fetched the first
// time a CBR opens. CB7 (7-Zip) is recognised but not supported.
//
// The page ordering and ComicInfo rules mirror `src/lib/comic-meta.ts`, which the app uses for covers.

import { BlobReader, BlobWriter, TextWriter, ZipReader, configure } from '../foliate/vendor/zip.js';

const IMAGE = /\.(jpe?g|png|gif|bmp|webp|avif|jxl)$/i;
const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
};

const ext = (name) => (name ?? '').toLowerCase().split('.').pop();

const magic = async (file, bytes) => {
  const head = new Uint8Array(await file.slice(0, bytes.length).arrayBuffer());
  return bytes.every((b, i) => head[i] === b);
};
const isZip = (file) => magic(file, [0x50, 0x4b, 0x03, 0x04]);
const isRar = (file) => magic(file, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
const is7z = (file) => magic(file, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

/** True for files to open as a comic: named like one, typed like one, or a RAR/7z archive of any name. */
export async function isComic(file) {
  if (['cbz', 'cbr', 'cb7'].includes(ext(file.name))) return true;
  if (/^application\/vnd\.comicbook/.test(file.type ?? '')) return true;
  return (await isRar(file)) || (await is7z(file));
}

/** "page-2" before "page-10"; the same rule as naturalCompare in src/lib/comic-meta.ts. */
export function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const pa = a.toLowerCase().match(re) ?? [];
  const pb = b.toLowerCase().match(re) ?? [];
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    const dx = /^\d/.test(x);
    const dy = /^\d/.test(y);
    if (dx && dy) {
      const diff = Number(x) - Number(y);
      if (diff) return diff;
      if (x.length !== y.length) return x.length - y.length;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length;
}

const pageNames = (names) =>
  names
    .filter((n) => IMAGE.test(n) && !n.endsWith('/'))
    .filter((n) => !n.split('/').some((part) => part.startsWith('.') || part === '__MACOSX'))
    .sort(naturalCompare);

// ---------- archives ----------

async function zipLoader(file) {
  configure({ useWebWorkers: false });
  const reader = new ZipReader(new BlobReader(file));
  const entries = await reader.getEntries();
  const map = new Map(entries.map((e) => [e.filename, e]));
  return {
    names: entries.map((e) => e.filename),
    loadBlob: (name, type) => map.get(name)?.getData(new BlobWriter(type)),
    loadText: (name) => map.get(name)?.getData(new TextWriter()),
    getSize: (name) => map.get(name)?.uncompressedSize ?? 0,
  };
}

let unrarLoading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response)) resolve(xhr.response);
      else reject(new Error(`Could not load ${url} (status ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error(`Could not load ${url}`));
    xhr.send();
  });
}

/** node-unrar-js plus its WebAssembly, loaded once from the files next to the page. */
function unrar() {
  if (!unrarLoading)
    unrarLoading = (async () => {
      if (!globalThis.ArcanumUnrar) await loadScript('unrar.webjs');
      const wasmBinary = await fetchBytes('unrar.wasm');
      return { ...globalThis.ArcanumUnrar, wasmBinary };
    })().catch((e) => {
      unrarLoading = null;
      throw e;
    });
  return unrarLoading;
}

async function rarLoader(file) {
  const { createExtractorFromData, wasmBinary } = await unrar();
  const data = await file.arrayBuffer();
  const extractor = await createExtractorFromData({ wasmBinary, data });
  const headers = [...extractor.getFileList().fileHeaders];
  if (headers.some((h) => h.flags.encrypted)) throw new Error('This comic is password protected');
  const map = new Map(headers.filter((h) => !h.flags.directory).map((h) => [h.name, h]));
  const extract = (name) => {
    if (!map.has(name)) return null;
    // The generator stops by itself once the one requested file is out, and must run to that end: the
    // archive handle is closed there, and leaving it open makes the next extraction fail.
    let bytes = null;
    for (const f of extractor.extract({ files: [name] }).files) {
      if (f.fileHeader.name === name && f.extraction) bytes = f.extraction;
    }
    if (!bytes) throw new Error(`Could not extract ${name}`);
    return bytes;
  };
  return {
    names: [...map.keys()],
    loadBlob: async (name, type) => {
      const bytes = extract(name);
      return bytes && new Blob([bytes], { type });
    },
    loadText: async (name) => {
      const bytes = extract(name);
      return bytes && new TextDecoder().decode(bytes);
    },
    getSize: (name) => map.get(name)?.unpSize ?? 0,
  };
}

// ---------- ComicInfo.xml ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() || undefined : undefined;
};

function parseComicInfo(xml) {
  const info = {
    title: tag(xml, 'Title'),
    series: tag(xml, 'Series'),
    number: tag(xml, 'Number'),
    writers: (tag(xml, 'Writer') ?? '')
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean),
    summary: tag(xml, 'Summary'),
    publisher: tag(xml, 'Publisher'),
    language: tag(xml, 'LanguageISO'),
    rtl: /^YesAndRightToLeft$/i.test(tag(xml, 'Manga') ?? ''),
    doublePages: new Set(),
    bookmarks: new Map(),
  };
  for (const m of xml.matchAll(/<Page\s([^>]*?)\/?>/gi)) {
    const attrs = m[1];
    const image = attrs.match(/\bImage="(\d+)"/i)?.[1];
    if (image == null) continue;
    if (/\bDoublePage="true"/i.test(attrs)) info.doublePages.add(Number(image));
    const bookmark = attrs.match(/\bBookmark="([^"]*)"/i)?.[1];
    if (bookmark) info.bookmarks.set(Number(image), decodeEntities(bookmark).trim());
  }
  return info;
}

// ---------- the book ----------

/**
 * Opens a comic archive as a foliate book. `direction` is the reader setting: 'auto' follows ComicInfo's
 * Manga flag, 'ltr' and 'rtl' force the page order.
 */
export async function makeComic(file, { direction = 'auto' } = {}) {
  let format;
  let loader;
  if (await isZip(file)) {
    format = 'cbz';
    loader = await zipLoader(file);
  } else if (await isRar(file)) {
    format = 'cbr';
    loader = await rarLoader(file);
  } else if (await is7z(file)) {
    throw new Error('CB7 comics are not supported yet; CBZ and CBR open fine');
  } else throw new Error('Not a comic book archive');

  const pages = pageNames(loader.names);
  if (!pages.length) throw new Error('No pages found in this comic');

  const infoName = loader.names.find((n) => /(^|\/)ComicInfo\.xml$/i.test(n));
  let info = null;
  if (infoName) {
    try {
      info = parseComicInfo((await loader.loadText(infoName)) ?? '');
    } catch {}
  }
  const rtl = direction === 'auto' ? !!info?.rtl : direction === 'rtl';

  const cache = new Map();
  const urls = new Map();
  const load = async (name) => {
    if (cache.has(name)) return cache.get(name);
    const blob = await loader.loadBlob(name, MIME[ext(name)] ?? 'application/octet-stream');
    const src = URL.createObjectURL(blob);
    // One image per page; the renderer reads its natural size as the page size once the frame has loaded.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}img{display:block}</style></head><body><img src="${src}" alt=""></body></html>`;
    const page = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    urls.set(name, [src, page]);
    cache.set(name, page);
    return page;
  };
  const unload = (name) => {
    urls.get(name)?.forEach((u) => URL.revokeObjectURL(u));
    urls.delete(name);
    cache.delete(name);
  };

  const title = info?.title || (info?.series ? (info.number ? `${info.series} ${info.number}` : info.series) : file.name.replace(/\.[^.]+$/, ''));
  const book = {};
  book.metadata = {
    title,
    author: info?.writers?.length ? info.writers.join(', ') : undefined,
    description: info?.summary,
    publisher: info?.publisher,
    language: info?.language,
  };
  book.getCover = () => loader.loadBlob(pages[0], MIME[ext(pages[0])]);
  book.sections = pages.map((name, i) => ({
    id: name,
    load: () => load(name),
    unload: () => unload(name),
    size: loader.getSize(name),
    // A spread drawn across two pages is one wide image: show it alone instead of pairing it.
    pageSpread: info?.doublePages.has(i) ? 'center' : undefined,
  }));
  book.toc = pages.map((name, i) => ({ label: info?.bookmarks.get(i) ?? `Page ${i + 1}`, href: name }));
  book.rendition = { layout: 'pre-paginated' };
  book.dir = rtl ? 'rtl' : 'ltr';
  book.resolveHref = (href) => ({ index: book.sections.findIndex((s) => s.id === href) });
  book.splitTOCHref = (href) => [href, null];
  book.getTOCFragment = (doc) => doc.documentElement;
  book.destroy = () => {
    for (const arr of urls.values()) for (const u of arr) URL.revokeObjectURL(u);
  };
  // What the app learns about the comic: `direction` is the setting it was opened with, so a change can
  // trigger a reopen; `infoRtl` is what the archive itself says.
  book.comic = { format, pages: pages.length, rtl, infoRtl: !!info?.rtl, direction };
  return book;
}
