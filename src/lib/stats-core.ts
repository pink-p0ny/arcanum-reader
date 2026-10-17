/** Pure reading-statistics maths. No Expo imports, so it runs in Node for tests. */

export interface ReadingSession {
  bookId: number;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number;
}

export interface DayStat {
  /** YYYY-MM-DD in local time. */
  day: string;
  minutes: number;
}

export interface ReadingStats {
  todayMinutes: number;
  weekMinutes: number;
  /** Consecutive days with reading, ending today or yesterday. */
  streakDays: number;
  /** The last seven days, oldest first, today last. */
  week: DayStat[];
  booksThisWeek: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Minutes per local day, splitting sessions that cross midnight. */
export function minutesByDay(sessions: ReadingSession[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    let from = s.startedAt;
    while (from < s.endedAt) {
      const dayEnd = startOfDay(from) + DAY_MS;
      const to = Math.min(dayEnd, s.endedAt);
      const key = dayKey(from);
      out.set(key, (out.get(key) ?? 0) + (to - from) / 60000);
      from = to;
    }
  }
  return out;
}

export function computeStats(sessions: ReadingSession[], now: number = Date.now()): ReadingStats {
  const byDay = minutesByDay(sessions);
  const today = startOfDay(now);
  const week: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(today - i * DAY_MS);
    week.push({ day: key, minutes: Math.round(byDay.get(key) ?? 0) });
  }
  const todayMinutes = week[6].minutes;
  const weekMinutes = week.reduce((n, d) => n + d.minutes, 0);

  // A streak counts whole minutes; today counts if read, otherwise the streak is still alive from yesterday.
  const read = (ms: number) => (byDay.get(dayKey(ms)) ?? 0) >= 1;
  let streakDays = 0;
  let cursor = read(today) ? today : today - DAY_MS;
  while (read(cursor)) {
    streakDays += 1;
    cursor -= DAY_MS;
  }

  const weekStart = today - 6 * DAY_MS;
  const booksThisWeek = new Set(sessions.filter((s) => s.endedAt >= weekStart).map((s) => s.bookId)).size;

  return { todayMinutes, weekMinutes, streakDays, week, booksThisWeek };
}

export function formatMinutes(min: number): string {
  if (min < 1) return '0m';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
