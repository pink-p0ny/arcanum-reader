import type { AppBookFile } from './types';

/** Formats the reader engine (foliate-js) can open, best first. PDF and comics are not supported yet. */
export const READABLE_TYPES = ['EPUB', 'AZW3', 'MOBI', 'FB2'] as const;
export type ReadableType = (typeof READABLE_TYPES)[number];

const EXT: Record<ReadableType, string> = { EPUB: 'epub', AZW3: 'azw3', MOBI: 'mobi', FB2: 'fb2' };

export const isReadableType = (t: string | undefined | null): t is ReadableType =>
  !!t && (READABLE_TYPES as readonly string[]).includes(t.toUpperCase());

export const extensionFor = (t: string) => EXT[t.toUpperCase() as ReadableType] ?? t.toLowerCase();

/** Server file type for a file name's extension, or null when it is not a book the reader can open. */
export function typeFromName(name: string): ReadableType | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'epub') return 'EPUB';
  if (ext === 'azw3' || ext === 'azw' || ext === 'kf8') return 'AZW3';
  if (ext === 'mobi' || ext === 'prc') return 'MOBI';
  if (ext === 'fb2') return 'FB2';
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
