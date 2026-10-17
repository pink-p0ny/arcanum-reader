import { unzipSync } from 'fflate';

/** Metadata pulled from an EPUB's package document, enough to list it in the library and show a cover. */
export interface EpubMeta {
  title: string;
  authors: string[];
  language?: string;
  description?: string;
  publisher?: string;
  published?: string;
  series?: string;
  seriesNumber?: number;
  subjects?: string[];
  cover?: { bytes: Uint8Array; ext: string };
}

const decoder = new TextDecoder();

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const stripTags = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** All text contents of `<prefix:name>` elements (namespace prefix optional). */
function textAll(xml: string, name: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${name}>`,
    'g',
  );
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    const t = stripTags(m[1]);
    if (t) out.push(t);
  }
  return out;
}

function attr(tag: string, name: string): string | undefined {
  const m =
    tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`)) ??
    tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`));
  return m ? decodeEntities(m[1]) : undefined;
}

function resolve(base: string, href: string): string {
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const parts = (dir + decodeURIComponent(href)).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

function readEntry(zip: Uint8Array, path: string): Uint8Array | null {
  const files = unzipSync(zip, { filter: (f) => f.name === path });
  return files[path] ?? null;
}

/** Parses the package document. Throws when the file is not an EPUB. */
export function parseEpubMeta(zip: Uint8Array): EpubMeta {
  const container = readEntry(zip, 'META-INF/container.xml');
  if (!container) throw new Error('Not an EPUB: META-INF/container.xml is missing');
  const rootfile = decoder.decode(container).match(/<rootfile[^>]*full-path\s*=\s*"([^"]+)"/)?.[1];
  if (!rootfile) throw new Error('Not an EPUB: no rootfile in container.xml');
  const opfBytes = readEntry(zip, rootfile);
  if (!opfBytes) throw new Error(`Not an EPUB: package document ${rootfile} is missing`);
  const opf = decoder.decode(opfBytes);

  const metaBlock =
    opf.match(/<(?:[a-zA-Z0-9]+:)?metadata[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?metadata>/)?.[0] ?? opf;
  const title = textAll(metaBlock, 'title')[0] ?? '';
  const authors = textAll(metaBlock, 'creator');
  const language = textAll(metaBlock, 'language')[0];
  const description = textAll(metaBlock, 'description')[0];
  const publisher = textAll(metaBlock, 'publisher')[0];
  const published = textAll(metaBlock, 'date')[0];
  const subjects = textAll(metaBlock, 'subject').slice(0, 12);

  // Series: Calibre's meta tags, or EPUB 3 belongs-to-collection.
  const metas = [
    ...metaBlock.matchAll(/<(?:[a-zA-Z0-9]+:)?meta\b[^>]*\/?>(?:([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?meta>)?/g),
  ];
  let series: string | undefined;
  let seriesNumber: number | undefined;
  for (const m of metas) {
    const tag = m[0];
    const name = attr(tag, 'name');
    const property = attr(tag, 'property');
    const content = attr(tag, 'content');
    if (name === 'calibre:series' && content) series = content;
    if (name === 'calibre:series_index' && content) seriesNumber = Number(content) || undefined;
    if (property === 'belongs-to-collection' && m[1]) series = series ?? stripTags(m[1]);
    if (property === 'group-position' && m[1])
      seriesNumber = seriesNumber ?? (Number(stripTags(m[1])) || undefined);
  }

  // Cover: EPUB 3 manifest property first, then the EPUB 2 <meta name="cover"> pointer.
  const items = [...opf.matchAll(/<(?:[a-zA-Z0-9]+:)?item\b[^>]*\/?>/g)].map((m) => m[0]);
  let coverHref = items.find((t) => /\bproperties\s*=\s*"[^"]*\bcover-image\b/.test(t));
  if (!coverHref) {
    const coverId = metas.map((m) => m[0]).find((t) => attr(t, 'name') === 'cover');
    const id = coverId ? attr(coverId, 'content') : undefined;
    if (id) coverHref = items.find((t) => attr(t, 'id') === id);
  }
  let cover: EpubMeta['cover'];
  const href = coverHref ? attr(coverHref, 'href') : undefined;
  if (href) {
    const path = resolve(rootfile, href);
    const bytes = readEntry(zip, path);
    const ext = (path.split('.').pop() ?? 'jpg').toLowerCase();
    if (bytes && /^(jpe?g|png|gif|webp)$/.test(ext)) cover = { bytes, ext: ext === 'jpeg' ? 'jpg' : ext };
  }

  return {
    title,
    authors,
    language,
    description,
    publisher,
    published,
    series,
    seriesNumber,
    subjects,
    cover,
  };
}
