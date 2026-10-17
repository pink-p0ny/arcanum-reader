/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeStats, dayKey, formatMinutes, minutesByDay } from './stats-core';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 17, 21, 0);

describe('minutesByDay', () => {
  it('splits a session that crosses midnight', () => {
    const m = minutesByDay([
      { bookId: 1, startedAt: at(2026, 10, 16, 23, 30), endedAt: at(2026, 10, 17, 0, 15) },
    ]);
    assert.equal(m.get('2026-10-16'), 30);
    assert.equal(m.get('2026-10-17'), 15);
  });
});

describe('computeStats', () => {
  it('reports today, the week and the streak', () => {
    const s = computeStats(
      [
        { bookId: 1, startedAt: at(2026, 10, 17, 8), endedAt: at(2026, 10, 17, 8, 25) },
        { bookId: 2, startedAt: at(2026, 10, 16, 20), endedAt: at(2026, 10, 16, 21) },
        { bookId: 1, startedAt: at(2026, 10, 15, 20), endedAt: at(2026, 10, 15, 20, 10) },
        // a gap on the 14th breaks the streak
        { bookId: 3, startedAt: at(2026, 10, 13, 20), endedAt: at(2026, 10, 13, 21) },
        // older than a week: not counted in the week or books
        { bookId: 4, startedAt: at(2026, 10, 1, 20), endedAt: at(2026, 10, 1, 21) },
      ],
      NOW,
    );
    assert.equal(s.todayMinutes, 25);
    assert.equal(s.weekMinutes, 25 + 60 + 10 + 60);
    assert.equal(s.streakDays, 3);
    assert.equal(s.booksThisWeek, 3);
    assert.equal(s.week.length, 7);
    assert.equal(s.week[6].day, dayKey(NOW));
    assert.deepEqual(
      s.week.map((d) => d.minutes),
      [0, 0, 60, 0, 10, 60, 25],
    );
  });

  it('keeps yesterday’s streak alive before today’s first read, and needs a full minute', () => {
    const s = computeStats(
      [
        { bookId: 1, startedAt: at(2026, 10, 16, 20), endedAt: at(2026, 10, 16, 20, 5) },
        { bookId: 1, startedAt: at(2026, 10, 15, 20), endedAt: at(2026, 10, 15, 20) + 20000 },
      ],
      NOW,
    );
    assert.equal(s.streakDays, 1, 'the 20-second day does not count');
    assert.equal(computeStats([], NOW).streakDays, 0);
  });
});

describe('formatMinutes', () => {
  it('renders minutes and hours', () => {
    assert.equal(formatMinutes(0.4), '0m');
    assert.equal(formatMinutes(12), '12m');
    assert.equal(formatMinutes(60), '1h');
    assert.equal(formatMinutes(134), '2h 14m');
  });
});
