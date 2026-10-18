import { READABLE_TYPES } from './formats';
import { inProgress, isFinished } from './taste';
import type { AppBookSummary } from './types';

/**
 * Servers often hold the same book twice, once per format, and the two copies rarely carry identical
 * metadata: "Barr, Nevada" against "Nevada Barr", "Liar's Poker" against "Liars Poker", a subtitle on one
 * copy, no author at all on the PDF. The app shows one card per title and lets the reader pick the format
 * on the book page. Server records stay separate, so progress and highlights still belong to whichever
 * edition was opened.
 *
 * Grouping: books share a coarse key (title without subtitle, plus author) and are then clustered inside
 * it. Two titles only merge when they are the same or one is the other without its subtitle, so "Star
 * Wars: A New Hope" never joins "Star Wars: The Last Jedi". A copy with no author joins the group when
 * every other copy agrees on one.
 */

export interface Edition {
  id: number;
  type: string;
}

const ARTICLES = /^(the|a|an)\s+/;
const SUBTITLE = /\s*[:;–—]\s.*$|\s+-\s+.*$|:.*$/;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The full title, normalized: bracketed notes dropped, punctuation and articles ignored. */
export function titleKey(title: string | undefined): string {
  return words((title ?? '').replace(/\(.*?\)|\[.*?\]/g, ' ')).replace(ARTICLES, '');
}

/** The title before any subtitle separator, normalized the same way. */
export function baseTitleKey(title: string | undefined): string {
  const bare = (title ?? '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(SUBTITLE, '');
  return words(bare).replace(ARTICLES, '') || titleKey(title);
}

/** First author as sorted name parts, so "Barr, Nevada" and "Nevada Barr" agree. Empty when unknown. */
export function authorKey(authors: string[] | undefined): string {
  return words(authors?.[0] ?? '')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Base title and author, as a readable key for scripts and tests; grouping itself is `groupEditions`. */
export function editionKey(b: Pick<AppBookSummary, 'title' | 'authors'>): string {
  const t = baseTitleKey(b.title);
  const a = authorKey(b.authors);
  return t || a ? `${t}|${a}` : '';
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

/**
 * Splits books sharing a coarse key into clusters that are really the same book. A title equal to the base
 * title ("bare") and an empty author are wildcards: they adopt the one variant the rest of the group uses,
 * and stay apart when the group is ambiguous.
 */
function cluster(group: AppBookSummary[]): AppBookSummary[][] {
  if (group.length < 2) return [group];
  const base = baseTitleKey(group[0].title);
  const variant = (b: AppBookSummary) => {
    const t = titleKey(b.title);
    return t === base ? '*' : t;
  };
  const author = (b: AppBookSummary) => authorKey(b.authors) || '*';
  const variants = new Set(group.map(variant).filter((v) => v !== '*'));
  const authors = new Set(group.map(author).filter((a) => a !== '*'));
  const fill = (v: string, set: Set<string>) => (v === '*' && set.size === 1 ? [...set][0] : v);
  const clusters = new Map<string, AppBookSummary[]>();
  for (const b of group) {
    const key = `${fill(variant(b), variants)}|${fill(author(b), authors)}`;
    const c = clusters.get(key);
    if (c) c.push(b);
    else clusters.set(key, [b]);
  }
  return [...clusters.values()];
}

/** Every book in its edition group, in the input's order of first appearance. */
export function groupEditions(books: AppBookSummary[]): AppBookSummary[][] {
  const coarse = new Map<string, AppBookSummary[]>();
  const singles: AppBookSummary[][] = [];
  for (const b of books) {
    // Base title only: authors are settled inside the cluster, so a copy with none can still join.
    const key = baseTitleKey(b.title);
    if (!key) {
      singles.push([b]);
      continue;
    }
    const g = coarse.get(key);
    if (g) g.push(b);
    else coarse.set(key, [b]);
  }
  const groupOf = new Map<number, AppBookSummary[]>();
  for (const g of coarse.values()) for (const c of cluster(g)) for (const b of c) groupOf.set(b.id, c);
  for (const s of singles) groupOf.set(s[0].id, s);
  const out: AppBookSummary[][] = [];
  const seen = new Set<number>();
  for (const b of books) {
    if (seen.has(b.id)) continue;
    const g = groupOf.get(b.id) ?? [b];
    for (const m of g) seen.add(m.id);
    out.push(g);
  }
  return out;
}

const edition = (m: AppBookSummary): Edition => ({ id: m.id, type: (m.primaryFileType ?? '?').toUpperCase() });

/** One summary per title; the chosen edition carries `editions` listing every member, itself included. */
export function collapseEditions(books: AppBookSummary[]): AppBookSummary[] {
  return groupEditions(books).map((group) => {
    const rep = representative(group);
    return group.length > 1 ? { ...rep, editions: group.map(edition) } : rep;
  });
}

/** Sibling editions of one book, excluding itself. */
export function siblingEditions(bookId: number, books: AppBookSummary[]): Edition[] {
  const group = groupEditions(books).find((g) => g.some((b) => b.id === bookId));
  return (group ?? []).filter((b) => b.id !== bookId).map(edition);
}
