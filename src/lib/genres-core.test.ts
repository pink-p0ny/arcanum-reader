/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hiddenGenreSet, isHiddenGenre, pruneGenres, toggleGenre } from './genres-core';
import type { AppBookSummary } from './types';

const book = (id: number, categories: string[]): AppBookSummary => ({ id, title: `b${id}`, categories });

describe('hidden genres', () => {
  it('matches regardless of case, spaces and punctuation', () => {
    const set = hiddenGenreSet(['Non-Fiction', 'Adult']);
    assert.equal(isHiddenGenre('nonfiction', set), true);
    assert.equal(isHiddenGenre('Non Fiction', set), true);
    assert.equal(isHiddenGenre('ADULT', set), true);
    assert.equal(isHiddenGenre('Adult Fiction', set), false);
  });

  it('prunes hidden genres from books and leaves untouched books as the same object', () => {
    const a = book(1, ['Fiction', 'Romance']);
    const b = book(2, ['Romance']);
    const out = pruneGenres([a, b], ['fiction']);
    assert.deepEqual(out[0].categories, ['Romance']);
    assert.equal(out[1], b);
    const same = [a];
    assert.equal(pruneGenres(same, []), same, 'nothing hidden returns the same array');
  });

  it('toggles by normalized name', () => {
    assert.deepEqual(toggleGenre(['Fiction'], 'fiction'), []);
    assert.deepEqual(toggleGenre(['Fiction'], 'Horror'), ['Fiction', 'Horror']);
  });
});
