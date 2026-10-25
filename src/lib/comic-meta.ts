import { unzipSync } from 'fflate';

import { decodeEntities } from './epub-meta';

/**
 * Comic book archives (CBZ/CBR): a folder of page images, optionally with a ComicInfo.xml (the de facto
 * metadata file written by ComicRack, Komga, Mylar and friends). This file knows how to order the pages and
 * read that metadata; the RN side uses it to list and show covers for folder-library comics, the reader page
 * has the same rules in `reader-web/src/comic.js`.
 */

export const COMIC_IMAGE = /\.(jpe?g|png|gif|bmp|webp|avif|jxl)$/i;

export interface ComicInfo {
  title?: string;
  series?: string;
  /** Issue number as written, e.g. "3" or "3.5"; `issue` is the numeric form when it has one. */
  number?: string;
  issue?: number;
  volume?: number;
  writers: string[];
  summary?: string;
  publisher?: string;
  /** ISO date assembled from Year/Month/Day, as far as they are given. */
  published?: string;
  genres: string[];
  language?: string;
  pageCount?: number;
  /** ComicInfo's Manga = YesAndRightToLeft: pages are read right to left. */
  rtl: boolean;
  /** 0-based page indexes marked as double-page spreads. */
  doublePages: number[];
  /** Bookmarks from the <Pages> list, by 0-based page index. */
  bookmarks: Map<number, string>;
}

/** Compares file names the way a person reads them: "page-2" before "page-10". Case-insensitive. */
export function naturalCompare(a: string, b: string): number {
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
      // Same value, different zero padding: shorter first, keeps ordering stable.
      if (x.length !== y.length) return x.length - y.length;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** The page images of an archive in reading order; metadata, thumbnails and macOS resource forks dropped. */
export function comicPages(names: string[]): string[] {
  return names
    .filter((n) => COMIC_IMAGE.test(n) && !n.endsWith('/'))
    .filter((n) => !n.split('/').some((part) => part.startsWith('.') || part === '__MACOSX'))
    .sort(naturalCompare);
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() || undefined : undefined;
}

const num = (s: string | undefined) => {
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const list = (s: string | undefined) =>
  (s ?? '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Reads what the library and the reader use from a ComicInfo.xml document. Tolerant of partial files. */
export function parseComicInfo(xml: string): ComicInfo {
  const info: ComicInfo = {
    title: tag(xml, 'Title'),
    series: tag(xml, 'Series'),
    number: tag(xml, 'Number'),
    volume: num(tag(xml, 'Volume')),
    writers: list(tag(xml, 'Writer')),
    summary: tag(xml, 'Summary'),
    publisher: tag(xml, 'Publisher'),
    genres: list(tag(xml, 'Genre')),
    language: tag(xml, 'LanguageISO'),
    pageCount: num(tag(xml, 'PageCount')),
    rtl: /^YesAndRightToLeft$/i.test(tag(xml, 'Manga') ?? ''),
    doublePages: [],
    bookmarks: new Map(),
  };
  info.issue = num(info.number);
  const year = num(tag(xml, 'Year'));
  if (year) {
    const month = num(tag(xml, 'Month'));
    const day = num(tag(xml, 'Day'));
    const pad = (n: number) => String(n).padStart(2, '0');
    info.published = month ? (day ? `${year}-${pad(month)}-${pad(day)}` : `${year}-${pad(month)}`) : String(year);
  }
  for (const m of xml.matchAll(/<Page\s([^>]*?)\/?>/gi)) {
    const attrs = m[1];
    const image = num(attrs.match(/\bImage="(\d+)"/i)?.[1]);
    if (image == null) continue;
    if (/\bDoublePage="true"/i.test(attrs)) info.doublePages.push(image);
    const bookmark = attrs.match(/\bBookmark="([^"]*)"/i)?.[1];
    if (bookmark) info.bookmarks.set(image, decodeEntities(bookmark).trim());
  }
  return info;
}

/** The title to list a comic under: its own title, else "Series 3", else the file name without extension. */
export function comicTitle(info: ComicInfo | null, fileName: string): string {
  if (info?.title) return info.title;
  if (info?.series) return info.number ? `${info.series} ${info.number}` : info.series;
  return fileName.replace(/\.[^.]+$/, '');
}

export interface CbzMeta {
  info: ComicInfo | null;
  pages: string[];
  cover?: { bytes: Uint8Array; ext: string };
}

/** Lists a CBZ's pages and reads its ComicInfo.xml and first page without inflating the rest. */
export function readCbz(zip: Uint8Array): CbzMeta {
  const names: string[] = [];
  unzipSync(zip, {
    filter: (f) => {
      names.push(f.name);
      return false;
    },
  });
  const pages = comicPages(names);
  const infoName = names.find((n) => /(^|\/)ComicInfo\.xml$/i.test(n));
  const wanted = new Set([infoName, pages[0]].filter((x): x is string => !!x));
  const files = wanted.size ? unzipSync(zip, { filter: (f) => wanted.has(f.name) }) : {};
  const info = infoName && files[infoName] ? parseComicInfo(new TextDecoder().decode(files[infoName])) : null;
  const first = pages[0] ? files[pages[0]] : undefined;
  const cover = first ? { bytes: first, ext: pages[0].split('.').pop()!.toLowerCase().replace('jpeg', 'jpg') } : undefined;
  return { info, pages, cover };
}
