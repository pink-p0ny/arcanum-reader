import { Directory, File, Paths } from 'expo-file-system';

import {
  ensureDownloaded,
  iCloudAvailableInBinary,
  iCloudDocumentsUrl,
} from '../../modules/icloud-container';
import { kvGet, kvSet } from './db';
import { parseEpubMeta, type EpubMeta } from './epub-meta';
import { typeFromName } from './formats';
import type { LibraryProvider } from './providers/types';
import type { Annotation, AppBookDetail, AppBookSummary, ReadStatus } from './types';

/**
 * A library that is just a folder of EPUBs: the app's iCloud Drive folder when iCloud is on, otherwise a
 * local folder filled through the Files picker or "Open in Arcanum". Reading position, status, rating and
 * highlights live in a small JSON sidecar next to each book, so iCloud syncs them between devices and
 * nothing needs a server. Book ids are negative so they never collide with server ids.
 */

// ---------- location ----------

let folderPromise: Promise<{ dir: Directory; icloud: boolean }> | null = null;

export function libraryFolder(): Promise<{ dir: Directory; icloud: boolean }> {
  if (!folderPromise) {
    folderPromise = (async () => {
      const url = await iCloudDocumentsUrl();
      const dir = url ? new Directory(url) : new Directory(Paths.document, 'Library');
      if (!dir.exists) dir.create({ intermediates: true });
      return { dir, icloud: !!url };
    })().catch((e) => {
      folderPromise = null;
      throw e;
    });
  }
  return folderPromise;
}

export const folderSupportsICloud = () => iCloudAvailableInBinary;

// ---------- ids and cache ----------

/** FNV-1a over the file name, made negative. Stable across devices as long as the name is. */
export function folderBookId(fileName: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < fileName.length; i++) {
    h ^= fileName.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return -((h % 0x7fffffff) + 1);
}

export const isFolderBook = (bookId: number) => bookId < 0;

interface CachedMeta {
  name: string;
  size: number;
  firstSeen: string;
  meta: Omit<EpubMeta, 'cover'>;
  coverUri: string | null;
}

const META_KEY = 'folderMeta';
const metaCache = new Map<number, CachedMeta>();
let metaLoaded: Promise<void> | null = null;

/**
 * Covers resolve synchronously from the cached metadata, so the cache is loaded at app start; otherwise a
 * launch that skips the sync (within five minutes of the last one) shows folder books without covers.
 */
export const loadFolderMeta = () => ensureMetaLoaded();

function ensureMetaLoaded() {
  if (!metaLoaded) {
    metaLoaded = kvGet<[number, CachedMeta][]>(META_KEY).then((rows) => {
      for (const [id, m] of rows ?? []) metaCache.set(id, m);
    });
  }
  return metaLoaded;
}

const persistMeta = () => kvSet(META_KEY, [...metaCache.entries()]);

// ---------- sidecars ----------

export interface Sidecar {
  version: 1;
  addedOn?: string;
  progress?: { cfi?: string; href?: string; fraction: number; updatedAt: string };
  status?: string;
  rating?: number;
  annotations: Annotation[];
  nextAnnotationId: number;
}

const sidecarFile = (dir: Directory, name: string) =>
  new File(dir, `${name.replace(/\.[^.]+$/, '')}.arcanum.json`);

function readSidecar(dir: Directory, name: string): Sidecar {
  const f = sidecarFile(dir, name);
  if (f.exists) {
    try {
      const parsed = JSON.parse(f.textSync()) as Partial<Sidecar>;
      return {
        version: 1,
        annotations: [],
        nextAnnotationId: 1,
        ...parsed,
      };
    } catch {}
  }
  return { version: 1, annotations: [], nextAnnotationId: 1 };
}

function writeSidecar(dir: Directory, name: string, s: Sidecar) {
  const f = sidecarFile(dir, name);
  if (!f.exists) f.create();
  f.write(JSON.stringify(s, null, 2));
}

async function withSidecar<T>(bookId: number, fn: (s: Sidecar) => T): Promise<T> {
  await ensureMetaLoaded();
  const entry = metaCache.get(bookId);
  if (!entry) throw new Error('Book is not in the library folder');
  const { dir } = await libraryFolder();
  const s = readSidecar(dir, entry.name);
  const out = fn(s);
  writeSidecar(dir, entry.name, s);
  return out;
}

// ---------- scanning ----------

function coverFile(id: number, ext: string) {
  const dir = new Directory(Paths.cache, 'covers');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${Math.abs(id)}.${ext}`);
}

function indexBook(file: File, id: number, previous: CachedMeta | undefined): CachedMeta {
  const name = file.name;
  const size = file.size ?? 0;
  if (previous && previous.size === size && previous.name === name) return previous;
  let meta: Omit<EpubMeta, 'cover'> = { title: name.replace(/\.[^.]+$/, ''), authors: [] };
  let coverUri = previous?.coverUri ?? null;
  try {
    if (typeFromName(name) !== 'EPUB') throw new Error('metadata is only read from EPUB');
    const parsed = parseEpubMeta(file.bytesSync());
    const { cover, ...rest } = parsed;
    meta = { ...rest, title: rest.title || meta.title };
    if (cover) {
      const cf = coverFile(id, cover.ext);
      if (cf.exists) cf.delete();
      cf.create();
      cf.write(cover.bytes);
      coverUri = cf.uri;
    }
  } catch {
    // Not a readable EPUB (or still an iCloud placeholder); list it by file name.
  }
  return { name, size, firstSeen: previous?.firstSeen ?? new Date().toISOString(), meta, coverUri };
}

function toSummary(id: number, c: CachedMeta, s: Sidecar): AppBookSummary {
  return {
    id,
    title: c.meta.title,
    authors: c.meta.authors,
    readStatus: s.status as ReadStatus | undefined,
    personalRating: s.rating,
    seriesName: c.meta.series,
    seriesNumber: c.meta.seriesNumber,
    addedOn: s.addedOn ?? c.firstSeen,
    lastReadTime: s.progress?.updatedAt,
    readProgress: s.progress ? s.progress.fraction * 100 : undefined,
    primaryFileId: id,
    primaryFileType: typeFromName(c.name) ?? 'EPUB',
    primaryFileName: c.name,
    coverUpdatedOn: String(c.size),
    isPhysical: false,
    publisher: c.meta.publisher,
    categories: c.meta.subjects ?? [],
    language: c.meta.language,
    fileSizeKb: Math.round(c.size / 1024),
  };
}

/** Re-reads the folder, parsing any new or changed books, and returns every book in it. */
export async function scanFolder(): Promise<AppBookSummary[]> {
  await ensureMetaLoaded();
  const { dir } = await libraryFolder();
  const seen = new Set<number>();
  const out: AppBookSummary[] = [];
  let changed = false;
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || !typeFromName(entry.name)) continue;
    const id = folderBookId(entry.name);
    seen.add(id);
    const previous = metaCache.get(id);
    const downloaded = await ensureDownloaded(entry.uri);
    const next = downloaded ? indexBook(entry, id, previous) : (previous ?? indexBook(entry, id, undefined));
    if (next !== previous) {
      metaCache.set(id, next);
      changed = true;
    }
    out.push(toSummary(id, next, readSidecar(dir, entry.name)));
  }
  for (const id of [...metaCache.keys()]) {
    if (!seen.has(id)) {
      metaCache.delete(id);
      changed = true;
    }
  }
  if (changed) await persistMeta();
  return out;
}

/** Copies EPUBs (from the Files picker or an "Open in" URL) into the library folder. Returns their ids. */
export async function importEpubs(uris: string[]): Promise<number[]> {
  const { dir } = await libraryFolder();
  const ids: number[] = [];
  for (const uri of uris) {
    const src = new File(uri);
    if (!src.exists) continue;
    if (!typeFromName(src.name)) continue;
    const name = src.name;
    const dest = new File(dir, name);
    if (dest.exists) dest.delete();
    src.copy(dest);
    ids.push(folderBookId(name));
  }
  if (ids.length) await scanFolder();
  return ids;
}

export async function removeFromFolder(bookId: number) {
  await ensureMetaLoaded();
  const entry = metaCache.get(bookId);
  if (!entry) return;
  const { dir } = await libraryFolder();
  const f = new File(dir, entry.name);
  if (f.exists) f.delete();
  const s = sidecarFile(dir, entry.name);
  if (s.exists) s.delete();
  metaCache.delete(bookId);
  await persistMeta();
}

// ---------- provider ----------

export const folderProvider: LibraryProvider = {
  kind: 'folder',
  label: 'Books folder',
  capabilities: { progress: true, annotations: true, status: true },

  async listBooks(page) {
    if (page > 0) return { items: [], hasNext: false };
    return { items: await scanFolder(), hasNext: false };
  },

  async bookDetail(bookId) {
    await ensureMetaLoaded();
    const c = metaCache.get(bookId);
    if (!c) throw new Error('Book is not in the library folder');
    const { dir } = await libraryFolder();
    const s = readSidecar(dir, c.name);
    const summary = toSummary(bookId, c, s);
    const detail: AppBookDetail = {
      ...summary,
      description: c.meta.description,
      publishedDate: c.meta.published,
      fileTypes: [summary.primaryFileType ?? 'EPUB'],
      files: [
        {
          id: bookId,
          bookId,
          fileName: c.name,
          isBook: true,
          folderBased: false,
          bookType: summary.primaryFileType ?? 'EPUB',
          fileSizeKb: summary.fileSizeKb,
          isPrimary: true,
        },
      ],
      epubProgress: s.progress
        ? {
            cfi: s.progress.cfi,
            href: s.progress.href,
            percentage: s.progress.fraction * 100,
            updatedAt: s.progress.updatedAt,
          }
        : undefined,
    };
    return detail;
  },

  coverSource(book) {
    const uri = metaCache.get(book.id)?.coverUri;
    return uri ? { uri } : null;
  },

  async downloadSource(bookId) {
    await ensureMetaLoaded();
    const c = metaCache.get(bookId);
    if (!c) throw new Error('Book is not in the library folder');
    const { dir } = await libraryFolder();
    return { url: new File(dir, c.name).uri };
  },

  updateProgress: (bookId, _fileId, pos) =>
    withSidecar(bookId, (s) => {
      s.progress = {
        cfi: pos.cfi ?? undefined,
        href: pos.href ?? undefined,
        fraction: pos.fraction,
        updatedAt: new Date().toISOString(),
      };
    }),

  updateStatus: (bookId, status) =>
    withSidecar(bookId, (s) => {
      s.status = status;
    }),

  annotations: {
    list: (bookId) => withSidecar(bookId, (s) => s.annotations),
    create: (input) =>
      withSidecar(input.bookId, (s) => {
        const now = new Date().toISOString();
        const a: Annotation = { ...input, id: s.nextAnnotationId++, createdAt: now, updatedAt: now };
        s.annotations.push(a);
        return a;
      }),
    update: async (id, patch) => {
      // The id alone does not say which book; search the cache for the sidecar that holds it.
      await ensureMetaLoaded();
      const { dir } = await libraryFolder();
      for (const [bookId, c] of metaCache) {
        const s = readSidecar(dir, c.name);
        const a = s.annotations.find((x) => x.id === id);
        if (a) {
          Object.assign(a, patch, { updatedAt: new Date().toISOString() });
          writeSidecar(dir, c.name, s);
          return a;
        }
        void bookId;
      }
      throw new Error('Annotation not found');
    },
    remove: async (id) => {
      await ensureMetaLoaded();
      const { dir } = await libraryFolder();
      for (const c of metaCache.values()) {
        const s = readSidecar(dir, c.name);
        const i = s.annotations.findIndex((x) => x.id === id);
        if (i >= 0) {
          s.annotations.splice(i, 1);
          writeSidecar(dir, c.name, s);
          return;
        }
      }
    },
  },
};
