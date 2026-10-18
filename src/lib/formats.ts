import type { AppBookFile } from './types';

/**
 * Formats the reader engine (foliate-js) can open, best first. PDF renders page images (no highlights or
 * read-aloud); TXT is a folder-library format only, the servers do not store it. Comics and audiobooks are
 * not supported yet.
 */
export const READABLE_TYPES = ['EPUB', 'AZW3', 'MOBI', 'FB2', 'PDF', 'TXT'] as const;
export type ReadableType = (typeof READABLE_TYPES)[number];

const EXT: Record<ReadableType, string> = {
  EPUB: 'epub',
  AZW3: 'azw3',
  MOBI: 'mobi',
  FB2: 'fb2',
  PDF: 'pdf',
  TXT: 'txt',
};

export const isReadableType = (t: string | undefined | null): t is ReadableType =>
  !!t && (READABLE_TYPES as readonly string[]).includes(t.toUpperCase());

export const extensionFor = (t: string) => EXT[t.toUpperCase() as ReadableType] ?? t.toLowerCase();

/** Matches file names the app can open, for pickers and "Open in Arcanum". */
export const READABLE_FILE = /\.(epub|mobi|azw3?|kf8|prc|fb2|pdf|txt|text)$/i;

/** Server file type for a file name's extension, or null when it is not a book the reader can open. */
export function typeFromName(name: string): ReadableType | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'epub') return 'EPUB';
  if (ext === 'azw3' || ext === 'azw' || ext === 'kf8') return 'AZW3';
  if (ext === 'mobi' || ext === 'prc') return 'MOBI';
  if (ext === 'fb2') return 'FB2';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'txt' || ext === 'text') return 'TXT';
  return null;
}

/**
 * Which file to read: the best readable format among a book's files, falling back to the primary file
 * when the detail is not available. Returns null when nothing is readable.
 */
export function pickReadableFile(
  files: AppBookFile[] | undefined,
  primary: { id?: number; type?: string; name?: string },
): { id: number | null; type: ReadableType; name: string } | null {
  for (const type of READABLE_TYPES) {
    const f = files?.find((x) => x.isBook && x.bookType?.toUpperCase() === type);
    if (f) return { id: f.id, type, name: f.fileName };
  }
  if (isReadableType(primary.type))
    return {
      id: primary.id ?? null,
      type: primary.type.toUpperCase() as ReadableType,
      name: primary.name ?? `book.${extensionFor(primary.type)}`,
    };
  return null;
}

/**
 * PDF pages are foliate "sections", and a location in one is the fake spine CFI `epubcfi(/6/N)` with
 * N = 2 × page number. Grimmory stores PDF progress as a 1-based page.
 */
export function pageFromCfi(cfi: string | null | undefined): number | null {
  const m = cfi?.match(/^epubcfi\(\/6\/(\d+)/);
  if (!m) return null;
  const page = Number(m[1]) / 2;
  return Number.isInteger(page) && page > 0 ? page : null;
}

export const cfiForPage = (page: number) => `epubcfi(/6/${page * 2})`;
