import { aiEnabled, aiPick, ensureAiLoaded, type AiCandidate } from './ai';
import { getBooks, kvGet, kvSet } from './db';
import { bestRating, genreAffinity, inProgress, isFinished } from './home';
import { authorsLine } from './library';
import type { AppBookSummary } from './types';

/** A "surprise me" pick: one unread book, drawn at random but weighted by the reader's own taste. */
export interface LuckyPick {
  book: AppBookSummary;
  reasons: string[];
  /** Who chose: the on-device model or the AI. */
  source: 'local' | 'ai';
  /** Set when the AI was configured but failed and the local draw stood in. */
  aiError?: string;
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

interface Scored {
  book: AppBookSummary;
  reasons: string[];
  weight: number;
}

/**
 * Scores every eligible book against the reader's genre affinity, community rating and series they have
 * finished. Weight is exp(score): high scores win most of the time, long shots still come up.
 */
export function scoreCandidates(
  books: AppBookSummary[],
  skips: Skips,
  exclude: number | null = null,
): Scored[] {
  const { affinity } = genreAffinity(books);
  const maxAffinity = Math.max(1, ...affinity.values());
  const finishedSeries = new Set(
    books
      .filter(isFinished)
      .map((b) => b.seriesName)
      .filter(Boolean),
  );

  return books
    .filter((b) => eligible(b) && !skips[String(b.id)] && b.id !== exclude)
    .map((b) => {
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
}

/** Weighted random draw. */
export function pickLocal(scored: Scored[], random: () => number = Math.random): LuckyPick | null {
  if (scored.length === 0) return null;
  const total = scored.reduce((sum, s) => sum + s.weight, 0);
  let r = random() * total;
  for (const s of scored) {
    r -= s.weight;
    if (r <= 0) return { book: s.book, reasons: s.reasons, source: 'local' };
  }
  const last = scored[scored.length - 1];
  return { book: last.book, reasons: last.reasons, source: 'local' };
}

/** Convenience used by tests and callers that already hold the books. */
export function pickLucky(
  books: AppBookSummary[],
  skips: Skips,
  exclude: number | null = null,
  random: () => number = Math.random,
): LuckyPick | null {
  return pickLocal(scoreCandidates(books, skips, exclude), random);
}

/**
 * What the AI gets to see: a short list, not the library. The strongest local candidates plus a few random
 * ones so it can surprise, each reduced to title, author, genres, rating and series.
 */
export function luckyCandidates(scored: Scored[], random: () => number = Math.random, n = 30): AiCandidate[] {
  const sorted = [...scored].sort((a, b) => b.weight - a.weight);
  const top = sorted.slice(0, Math.ceil(n * 0.7));
  const rest = sorted.slice(top.length);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...top, ...rest.slice(0, n - top.length)].map(({ book: b }) => ({
    id: b.id,
    title: b.title,
    authors: authorsLine(b) || 'Unknown',
    genres: (b.categories ?? []).slice(0, 4),
    rating: bestRating(b) || null,
    series: b.seriesName ? `${b.seriesName}${b.seriesNumber ? ` #${b.seriesNumber}` : ''}` : null,
  }));
}

/** A few lines about the reader, built on the device. */
export function tasteSummary(books: AppBookSummary[]): string {
  const { affinity } = genreAffinity(books);
  const genres = [...affinity.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g);
  const finished = books
    .filter(isFinished)
    .sort((a, b) => (b.lastReadTime ?? '').localeCompare(a.lastReadTime ?? ''))
    .slice(0, 6)
    .map((b) => b.title);
  const loved = books
    .filter((b) => (b.personalRating ?? 0) >= 4)
    .slice(0, 6)
    .map((b) => b.title);
  const disliked = books
    .filter((b) => (b.personalRating ?? 0) > 0 && (b.personalRating ?? 0) <= 2)
    .slice(0, 4)
    .map((b) => b.title);
  const lines = [];
  if (genres.length) lines.push(`Genres they gravitate to: ${genres.join(', ')}.`);
  if (finished.length) lines.push(`Recently finished: ${finished.join('; ')}.`);
  if (loved.length) lines.push(`Rated highly: ${loved.join('; ')}.`);
  if (disliked.length) lines.push(`Did not enjoy: ${disliked.join('; ')}.`);
  return lines.length ? lines.join('\n') : 'No reading history yet; pick something broadly appealing.';
}

export async function drawLucky(
  exclude: number | null = null,
  opts: { mood?: string } = {},
): Promise<LuckyPick | null> {
  const [books, skips] = await Promise.all([getBooks({ sort: 'title' }), loadSkips(), ensureAiLoaded()]);
  const scored = scoreCandidates(books, skips, exclude);
  if (scored.length === 0) return null;
  if (!aiEnabled()) return pickLocal(scored);

  try {
    const result = await aiPick({
      candidates: luckyCandidates(scored),
      taste: tasteSummary(books),
      mood: opts.mood?.trim() || undefined,
    });
    const chosen = scored.find((s) => s.book.id === result.bookId);
    if (chosen) return { book: chosen.book, reasons: [result.reason], source: 'ai' };
    return { ...pickLocal(scored)!, aiError: 'The model picked something unavailable.' };
  } catch (e) {
    return { ...pickLocal(scored)!, aiError: (e as Error).message };
  }
}
