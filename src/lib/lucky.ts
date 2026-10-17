import { getBooks, kvGet, kvSet } from './db';
import { bestRating, genreAffinity, inProgress, isFinished } from './home';
import type { AppBookSummary } from './types';

/** A "surprise me" pick: one unread book, drawn at random but weighted by the reader's own taste. */
export interface LuckyPick {
  book: AppBookSummary;
  reasons: string[];
}

const SKIPS_KEY = 'luckySkips';
/** A skipped book stays out of the draw this long. */
const SKIP_TTL_MS = 60 * 24 * 60 * 60 * 1000;

type Skips = Record<string, number>;

export async function loadSkips(): Promise<Skips> {
  const skips = (await kvGet<Skips>(SKIPS_KEY)) ?? {};
  const cutoff = Date.now() - SKIP_TTL_MS;
  return Object.fromEntries(Object.entries(skips).filter(([, t]) => t > cutoff));
}

export async function skipBook(id: number): Promise<Skips> {
  const skips = await loadSkips();
  skips[String(id)] = Date.now();
  await kvSet(SKIPS_KEY, skips);
  return skips;
}

export async function clearSkips() {
  await kvSet(SKIPS_KEY, {});
}

const eligible = (b: AppBookSummary) =>
  !isFinished(b) &&
  !inProgress(b) &&
  !b.isPhysical &&
  !!b.primaryFileId &&
  b.readStatus !== 'WONT_READ' &&
  b.readStatus !== 'ABANDONED';

/**
 * Scores every eligible book against the reader's genre affinity, community rating and series they have
 * finished, then draws one with probability proportional to exp(score). High scores win most of the time,
 * long shots still come up, and nothing in the library is ever impossible.
 */
export function pickLucky(
  books: AppBookSummary[],
  skips: Skips,
  exclude: number | null = null,
  random: () => number = Math.random,
): LuckyPick | null {
  const { affinity } = genreAffinity(books);
  const maxAffinity = Math.max(1, ...affinity.values());
  const finishedSeries = new Set(
    books
      .filter(isFinished)
      .map((b) => b.seriesName)
      .filter(Boolean),
  );

  const candidates = books.filter((b) => eligible(b) && !skips[String(b.id)] && b.id !== exclude);
  if (candidates.length === 0) return null;

  const scored = candidates.map((b) => {
    const reasons: string[] = [];
    let score = 0;

    const liked = (b.categories ?? [])
      .map((c) => ({ c, a: (affinity.get(c) ?? 0) / maxAffinity }))
      .filter((x) => x.a > 0)
      .sort((x, y) => y.a - x.a);
    if (liked.length) {
      score += Math.min(2.5, liked.reduce((sum, x) => sum + x.a, 0) * 2);
      reasons.push(`You tend to enjoy ${liked[0].c}`);
    }

    const rating = bestRating(b);
    if (rating >= 4) {
      score += Math.min(1.5, (rating - 3.5) * 2);
      reasons.push(`Readers rate it ${rating.toFixed(1)} out of 5`);
    }

    if (b.seriesName && finishedSeries.has(b.seriesName)) {
      score += 1.5;
      reasons.push(`Continues ${b.seriesName}, a series you finished`);
    }

    if (reasons.length === 0) reasons.push('A wildcard from your library');
    return { book: b, reasons, weight: Math.exp(score) };
  });

  const total = scored.reduce((sum, s) => sum + s.weight, 0);
  let r = random() * total;
  for (const s of scored) {
    r -= s.weight;
    if (r <= 0) return { book: s.book, reasons: s.reasons };
  }
  const last = scored[scored.length - 1];
  return { book: last.book, reasons: last.reasons };
}

export async function drawLucky(exclude: number | null = null): Promise<LuckyPick | null> {
  const [books, skips] = await Promise.all([getBooks({ sort: 'title' }), loadSkips()]);
  return pickLucky(books, skips, exclude);
}
