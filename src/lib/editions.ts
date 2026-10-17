import { READABLE_TYPES } from './formats';
import { inProgress, isFinished } from './taste';
import type { AppBookSummary } from './types';

/**
 * Servers often hold the same book twice, once per format. The app shows one card per title and lets the
 * reader pick the format on the book page. Grouping is by normalized title and first author; the server
 * records stay separate, so progress and highlights still belong to whichever edition was opened.
 */

export interface Edition {
  id: number;
  type: string;
}

const ARTICLES = /^(the|a|an)\s+/;

export function editionKey(b: Pick<AppBookSummary, 'title' | 'authors'>): string {
  const title = (b.title ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(ARTICLES, '');
  const author = (b.authors?.[0] ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${title}|${author}`;
}

const formatRank = (t: string | undefined) => {
  const i = (READABLE_TYPES as readonly string[]).indexOf((t ?? '').toUpperCase());
  return i < 0 ? READABLE_TYPES.length : i;
};

/** The edition to show on the card: the one being read, else finished, else the best format, else newest. */
function representative(group: AppBookSummary[]): AppBookSummary {
  return [...group].sort((a, b) => {
    const pa = inProgress(a) ? 0 : isFinished(a) ? 1 : 2;
    const pb = inProgress(b) ? 0 : isFinished(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    const fa = formatRank(a.primaryFileType);
    const fb = formatRank(b.primaryFileType);
    if (fa !== fb) return fa - fb;
    return (b.addedOn ?? '').localeCompare(a.addedOn ?? '');
  })[0];
}

/** One summary per title; the chosen edition carries `editions` listing every member, itself included. */
export function collapseEditions(books: AppBookSummary[]): AppBookSummary[] {
  const groups = new Map<string, AppBookSummary[]>();
  for (const b of books) {
    const key = editionKey(b);
    if (!key.startsWith('|')) {
      const g = groups.get(key);
      if (g) g.push(b);
      else groups.set(key, [b]);
    } else groups.set(`id:${b.id}`, [b]);
  }
  const out: AppBookSummary[] = [];
  const seen = new Set<number>();
  for (const b of books) {
    if (seen.has(b.id)) continue;
    const key = editionKey(b);
    const group = groups.get(key.startsWith('|') ? `id:${b.id}` : key) ?? [b];
    for (const m of group) seen.add(m.id);
    const rep = representative(group);
    out.push(
      group.length > 1
        ? {
            ...rep,
            editions: group.map((m) => ({ id: m.id, type: (m.primaryFileType ?? '?').toUpperCase() })),
          }
        : rep,
    );
  }
  return out;
}

/** Sibling editions of one book, excluding itself. */
export function siblingEditions(bookId: number, books: AppBookSummary[]): Edition[] {
  const me = books.find((b) => b.id === bookId);
  if (!me) return [];
  const key = editionKey(me);
  if (key.startsWith('|')) return [];
  return books
    .filter((b) => b.id !== bookId && editionKey(b) === key)
    .map((b) => ({ id: b.id, type: (b.primaryFileType ?? '?').toUpperCase() }));
}
