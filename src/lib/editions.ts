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
 * Grouping: copies with the same base title (subtitle dropped) merge when their titles and authors are
 * compatible (see `sameBook`), and copies whose file names differ only by extension merge regardless of
 * metadata. "Star Wars: A New Hope" never joins "Star Wars: The Last Jedi"; "Burn" by nobody stays apart
 * from "Burn" by two different authors.
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

/** Every author's name parts, sorted and de-duplicated, so "Barr, Nevada", "Nevada Barr" and the split
 *  pair ["Barr", "Nevada"] all agree. Empty when unknown. */
export function authorKey(authors: string[] | undefined): string {
  return [...new Set((authors ?? []).flatMap((a) => words(a).split(' ')).filter(Boolean))].sort().join(' ');
}

/** Base title and author, as a readable key for scripts and tests; grouping itself is `groupEditions`. */
export function editionKey(b: Pick<AppBookSummary, 'title' | 'authors'>): string {
  const t = baseTitleKey(b.title);
  const a = authorKey(b.authors);
  return t || a ? `${t}|${a}` : '';
}

const PERSON = /^[\p{L}.'\u2019\- ]+,\s*[\p{L}.'\u2019\- ]+$/u;

/**
 * Some imports land with the fields swapped: title "Barr, Nevada", author "Hunting Season (V1.0 Txt)".
 * A title shaped like "Last, First" next to an author that does not look like a name is read swapped.
 */
export function readMetadata(b: Pick<AppBookSummary, 'title' | 'authors'>): { title: string; authors: string[] } {
  const title = b.title ?? '';
  const authors = b.authors ?? [];
  const first = authors[0] ?? '';
  const titleIsName = PERSON.test(title.trim()) && title.trim().split(/\s+/).length <= 4;
  const authorIsNotName = first.length > 0 && (/[()\[\]\d:]/.test(first) || first.split(/\s+/).length > 4);
  return titleIsName && authors.length === 1 && authorIsNotName ? { title: first, authors: [title] } : { title, authors };
}

/** File name without its extension, when it is specific enough to identify a book ("Burn - Nevada Barr"). */
export function fileStem(name: string | undefined): string | null {
  const stem = words((name ?? '').replace(/\.[^.]+$/, ''));
  if (stem.length < 8 || !/\p{L}{3}/u.test(stem) || /^(book|document|untitled|file|download)\s*\d*$/.test(stem))
    return null;
  return stem;
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

interface Facts {
  base: string;
  variant: string; // normalized full title, or '*' when it equals the base title
  author: string[]; // sorted name parts; empty when unknown
  stem: string | null;
}

const facts = (b: AppBookSummary): Facts => {
  const m = readMetadata(b);
  const base = baseTitleKey(m.title);
  const full = titleKey(m.title);
  return {
    base,
    variant: full === base ? '*' : full,
    author: authorKey(m.authors).split(' ').filter(Boolean),
    stem: fileStem(b.primaryFileName),
  };
};

const subset = (a: string[], b: string[]) => a.every((x) => b.includes(x));

/**
 * Whether two copies with the same base title are one book. Titles agree when equal or when one is the bare
 * base title; authors agree when one name list contains the other. The bare title and the empty author are
 * wildcards, and a wildcard only matches when the whole group is unambiguous about that field, so "Burn" by
 * nobody stays apart from "Burn" by Barr and "Burn" by Patterson.
 */
function sameBook(a: Facts, b: Facts, group: Facts[]): boolean {
  if (a.variant !== b.variant) {
    if (a.variant !== '*' && b.variant !== '*') return false;
    if (new Set(group.map((f) => f.variant).filter((v) => v !== '*')).size > 1) return false;
  }
  if (!a.author.length || !b.author.length) {
    const full = group.map((f) => f.author).filter((x) => x.length);
    const unambiguous = full.every((x) => full.every((y) => subset(x, y) || subset(y, x)));
    return unambiguous;
  }
  return subset(a.author, b.author) || subset(b.author, a.author);
}

/** Every book in its edition group, in the input's order of first appearance. */
export function groupEditions(books: AppBookSummary[]): AppBookSummary[][] {
  const info = new Map(books.map((b) => [b.id, facts(b)]));
  const parent = new Map<number, number>(books.map((b) => [b.id, b.id]));
  const find = (id: number): number => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: number, b: number) => parent.set(find(a), find(b));

  // 1. Same base title and compatible metadata.
  const byBase = new Map<string, AppBookSummary[]>();
  for (const b of books) {
    const base = info.get(b.id)!.base;
    if (!base) continue;
    byBase.set(base, [...(byBase.get(base) ?? []), b]);
  }
  for (const group of byBase.values()) {
    const fs = group.map((b) => info.get(b.id)!);
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (sameBook(fs[i], fs[j], fs)) union(group[i].id, group[j].id);
  }
  // 2. Same file name apart from the extension: the same book however its metadata came out.
  const byStem = new Map<string, number>();
  for (const b of books) {
    const stem = info.get(b.id)!.stem;
    if (!stem) continue;
    const other = byStem.get(stem);
    if (other != null) union(other, b.id);
    else byStem.set(stem, b.id);
  }

  const groups = new Map<number, AppBookSummary[]>();
  for (const b of books) {
    const root = find(b.id);
    groups.set(root, [...(groups.get(root) ?? []), b]);
  }
  const out: AppBookSummary[][] = [];
  const seen = new Set<number>();
  for (const b of books) {
    const root = find(b.id);
    if (seen.has(root)) continue;
    seen.add(root);
    out.push(groups.get(root)!);
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
