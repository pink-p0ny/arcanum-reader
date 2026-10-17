import type { AppBookSummary } from './types';

/** Pure helpers about a reader's history. No Expo imports, so they run in plain Node for tests. */

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
    const rating = b.personalRating ?? 0;
    let weight = 0;
    if (rating > 0 && rating <= 2) {
      // Finishing a book you disliked is not a vote for its genre.
      weight = -1;
    } else {
      if (isFinished(b)) weight += 2;
      else if (inProgress(b)) weight += 1.5;
      if (rating >= 4) weight += 2;
    }
    for (const c of cats) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
      if (weight) affinity.set(c, (affinity.get(c) ?? 0) + weight);
    }
  }
  return { affinity, counts };
}
