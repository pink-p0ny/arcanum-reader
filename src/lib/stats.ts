import { useQuery } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { getSessionsSince, insertSession } from './db';
import { computeStats, type ReadingStats } from './stats-core';

export type { ReadingStats } from './stats-core';
export { formatMinutes } from './stats-core';

/** Sessions shorter than this are noise (opening a book by mistake). */
const MIN_SESSION_MS = 30 * 1000;

/**
 * Measures time actually spent in the reader for one book. Time in the background does not count. Call
 * `stop()` when the reader closes; partial sessions are flushed when the app goes to the background so a
 * swipe-kill still records what was read.
 */
export class SessionTracker {
  private startedAt: number | null = Date.now();
  private sub = AppState.addEventListener('change', (s) => this.onAppState(s));

  constructor(private readonly bookId: number) {}

  private onAppState(state: AppStateStatus) {
    if (state === 'active') {
      if (this.startedAt == null) this.startedAt = Date.now();
    } else {
      this.flush();
    }
  }

  private flush() {
    if (this.startedAt == null) return;
    const started = this.startedAt;
    this.startedAt = null;
    const ended = Date.now();
    if (ended - started >= MIN_SESSION_MS) {
      insertSession({ book_id: this.bookId, started_at: started, ended_at: ended }).catch(() => {});
    }
  }

  stop() {
    this.flush();
    this.sub.remove();
  }
}

export async function loadStats(now = Date.now()): Promise<ReadingStats> {
  // Streaks can be long; a year of sessions is plenty and still tiny.
  const rows = await getSessionsSince(now - 366 * 24 * 60 * 60 * 1000);
  return computeStats(
    rows.map((r) => ({ bookId: r.book_id, startedAt: r.started_at, endedAt: r.ended_at })),
    now,
  );
}

export function useReadingStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => loadStats(), placeholderData: (prev) => prev });
}
