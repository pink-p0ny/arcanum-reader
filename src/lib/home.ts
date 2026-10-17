import { useQuery } from '@tanstack/react-query';

import { getBooks } from './db';
import type { AppBookSummary } from './types';

export interface HomeSection {
  key: string;
  title: string;
  subtitle?: string;
  books: AppBookSummary[];
  category?: string;
}

export interface HomeData {
  continueReading: AppBookSummary[];
  sections: HomeSection[];
  genres: { name: string; count: number }[];
  empty: boolean;
}

const LIMIT = 14;

export const isFinished = (b: AppBookSummary) => b.readStatus === 'READ' || (b.readProgress ?? 0) >= 99;
export const inProgress = (b: AppBookSummary) =>
  !isFinished(b) &&
  (b.readStatus === 'READING' || b.readStatus === 'RE_READING' || (b.readProgress ?? 0) > 0);
export const bestRating = (b: AppBookSummary) =>
  b.goodreadsRating ?? b.hardcoverRating ?? b.amazonRating ?? 0;

/**
 * How much the reader gravitates to each genre, from their own history: finished and in-progress books
 * and high personal ratings add weight, low ratings subtract. Also returns how many books carry each genre.
 */
export function genreAffinity(books: AppBookSummary[]) {
  const affinity = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const b of books) {
    const cats = b.categories ?? [];
    let weight = 0;
    if (isFinished(b)) weight += 2;
    else if (inProgress(b)) weight += 1.5;
    if ((b.personalRating ?? 0) >= 4) weight += 2;
    if ((b.personalRating ?? 0) > 0 && (b.personalRating ?? 0) <= 2) weight -= 1;
    for (const c of cats) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
      if (weight) affinity.set(c, (affinity.get(c) ?? 0) + weight);
    }
  }
  return { affinity, counts };
}
const byRating = (a: AppBookSummary, b: AppBookSummary) => bestRating(b) - bestRating(a);
const byDate = (key: 'lastReadTime' | 'addedOn') => (a: AppBookSummary, b: AppBookSummary) =>
  (b[key] ?? '').localeCompare(a[key] ?? '');

/**
 * Builds the Home tab from the cached library: what you're reading, what's new, and genre shelves ranked
 * by your own taste (finished, in-progress and highly rated books weight the genres you gravitate to).
 */
export function buildHome(books: AppBookSummary[]): HomeData {
  const continueReading = books.filter(inProgress).sort(byDate('lastReadTime')).slice(0, LIMIT);
  const recentlyAdded = [...books].sort(byDate('addedOn')).slice(0, LIMIT);

  const { affinity, counts } = genreAffinity(books);

  const genres = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const ranked = [...affinity.entries()]
    .filter(([name]) => (counts.get(name) ?? 0) >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const sections: HomeSection[] = [];
  const used = new Set<number>(continueReading.map((b) => b.id));

  for (const cat of ranked.slice(0, 4)) {
    const picks = books
      .filter((b) => !isFinished(b) && !used.has(b.id) && (b.categories ?? []).includes(cat))
      .sort(byRating)
      .slice(0, LIMIT);
    if (picks.length < 3) continue;
    picks.forEach((b) => used.add(b.id));
    sections.push({
      key: `cat:${cat}`,
      title: `Because you like ${cat}`,
      books: picks,
      category: cat,
    });
  }

  const topRated = books
    .filter((b) => !isFinished(b) && bestRating(b) >= 4.1)
    .sort(byRating)
    .slice(0, LIMIT);
  if (topRated.length >= 3)
    sections.push({
      key: 'top',
      title: 'Top Rated',
      subtitle: 'Highest community ratings in your library',
      books: topRated,
    });

  sections.push({ key: 'new', title: 'Recently Added', books: recentlyAdded });

  // Round out the page with popular genres that didn't make the affinity cut.
  for (const g of genres.filter((g) => !ranked.slice(0, 4).includes(g.name)).slice(0, 3)) {
    const picks = books
      .filter((b) => (b.categories ?? []).includes(g.name))
      .sort(byRating)
      .slice(0, LIMIT);
    if (picks.length >= 3)
      sections.push({
        key: `genre:${g.name}`,
        title: g.name,
        books: picks,
        category: g.name,
      });
  }

  return { continueReading, sections, genres, empty: books.length === 0 };
}

export function useHome() {
  return useQuery({
    queryKey: ['home'],
    queryFn: async () => buildHome(await getBooks({ sort: 'title' })),
    placeholderData: (prev) => prev,
  });
}
