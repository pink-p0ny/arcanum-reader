import type { AppBookSummary } from './types';

/**
 * Some library tags say nothing about taste: "Fiction", "Adult" and the like sit on half the shelf. The
 * reader keeps a list of genres to leave out of Browse by Genre, the taste shelves and Surprise Me.
 * Pure helpers, no Expo imports, so they run in plain Node for tests.
 */

export const DEFAULT_HIDDEN_GENRES = ['Fiction', 'Nonfiction', 'General', 'Adult', 'Literature'];

/** Case, spacing and punctuation insensitive, so "Non-Fiction" and "nonfiction" are the same genre. */
export const normalizeGenre = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const hiddenGenreSet = (hidden: readonly string[]) => new Set(hidden.map(normalizeGenre));

export const isHiddenGenre = (name: string, hidden: Set<string>) => hidden.has(normalizeGenre(name));

/** The same books with hidden genres removed from their categories, so every consumer sees one truth. */
export function pruneGenres(books: AppBookSummary[], hidden: readonly string[]): AppBookSummary[] {
  if (!hidden.length) return books;
  const set = hiddenGenreSet(hidden);
  return books.map((b) => {
    const cats = b.categories ?? [];
    const kept = cats.filter((c) => !isHiddenGenre(c, set));
    return kept.length === cats.length ? b : { ...b, categories: kept };
  });
}

/** Toggles one genre in the list, matching by normalized name. */
export function toggleGenre(hidden: readonly string[], name: string): string[] {
  const key = normalizeGenre(name);
  return hidden.some((h) => normalizeGenre(h) === key)
    ? hidden.filter((h) => normalizeGenre(h) !== key)
    : [...hidden, name];
}
