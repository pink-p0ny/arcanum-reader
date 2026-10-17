import { aiEnabled, aiPick, ensureAiLoaded } from './ai';
import { getBooks, kvGet, kvSet } from './db';
import {
  luckyCandidates,
  pickLocal,
  scoreCandidates,
  tasteSummary,
  type LuckyPick,
  type Skips,
} from './lucky-core';

export type { LuckyPick } from './lucky-core';
export { pickLucky } from './lucky-core';

const SKIPS_KEY = 'luckySkips';
/** A skipped book stays out of the draw this long. */
const SKIP_TTL_MS = 60 * 24 * 60 * 60 * 1000;

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

/** Draw a pick from the cached library: the AI when it is set up, the local scorer otherwise or on failure. */
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
