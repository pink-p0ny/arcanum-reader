/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { luckyCandidates, pickLocal, pickLucky, scoreCandidates, tasteSummary } from './lucky-core';
import type { AppBookSummary } from './types';

let nextId = 1;
const book = (over: Partial<AppBookSummary> = {}): AppBookSummary => ({
  id: nextId++,
  title: `Book ${nextId}`,
  authors: ['Some Author'],
  primaryFileId: 100 + nextId,
  categories: [],
  ...over,
});

const library = () => {
  nextId = 1;
  return [
    book({ title: 'Finished fantasy', categories: ['Fantasy'], readStatus: 'READ', personalRating: 5 }),
    book({ title: 'Finished fantasy 2', categories: ['Fantasy'], readStatus: 'READ', seriesName: 'Saga' }),
    book({ title: 'Hated romance', categories: ['Romance'], readStatus: 'READ', personalRating: 1 }),
    book({ title: 'In progress', categories: ['Fantasy'], readProgress: 40 }),
    book({ title: 'Unread fantasy', categories: ['Fantasy'], goodreadsRating: 4.2 }),
    book({ title: 'Unread saga next', categories: ['Fantasy'], seriesName: 'Saga', seriesNumber: 3 }),
    book({ title: 'Unread romance', categories: ['Romance'] }),
    book({ title: 'Unread nothing', categories: ['History'] }),
    book({ title: 'Physical', categories: ['Fantasy'], isPhysical: true }),
    book({ title: 'No file', categories: ['Fantasy'], primaryFileId: undefined }),
    book({ title: "Won't read", categories: ['Fantasy'], readStatus: 'WONT_READ' }),
  ];
};

describe('scoreCandidates', () => {
  it('only offers unread, downloadable books', () => {
    const titles = scoreCandidates(library(), {}).map((s) => s.book.title);
    assert.deepEqual(titles, ['Unread fantasy', 'Unread saga next', 'Unread romance', 'Unread nothing']);
  });

  it('honours skips and the excluded book', () => {
    const books = library();
    const unreadFantasy = books.find((b) => b.title === 'Unread fantasy')!;
    const saga = books.find((b) => b.title === 'Unread saga next')!;
    const titles = scoreCandidates(books, { [unreadFantasy.id]: Date.now() }, saga.id).map(
      (s) => s.book.title,
    );
    assert.deepEqual(titles, ['Unread romance', 'Unread nothing']);
  });

  it('weights liked genres, ratings and finished series above wildcards', () => {
    const scored = scoreCandidates(library(), {});
    const w = Object.fromEntries(scored.map((s) => [s.book.title, s.weight]));
    assert.ok(w['Unread saga next'] > w['Unread fantasy'], 'series continuation beats rating');
    assert.ok(w['Unread fantasy'] > w['Unread romance'], 'liked genre plus rating beats disliked genre');
    assert.ok(
      w['Unread romance'] < w['Unread nothing'] * 1.0001,
      'a disliked genre never scores above a wildcard',
    );
    assert.equal(w['Unread nothing'], 1, 'a wildcard has weight exp(0)');
  });

  it('explains each pick', () => {
    const scored = scoreCandidates(library(), {});
    const saga = scored.find((s) => s.book.title === 'Unread saga next')!;
    assert.deepEqual(saga.reasons, ['You tend to enjoy Fantasy', 'Continues Saga, a series you finished']);
    const wild = scored.find((s) => s.book.title === 'Unread nothing')!;
    assert.deepEqual(wild.reasons, ['A wildcard from your library']);
  });
});

describe('pickLocal', () => {
  it('draws in proportion to weight and never returns null for a non-empty list', () => {
    const scored = scoreCandidates(library(), {});
    assert.equal(pickLocal(scored, () => 0)?.book.title, 'Unread fantasy');
    assert.equal(pickLocal(scored, () => 0.999999)?.book.title, 'Unread nothing');
    assert.equal(pickLocal([]), null);
  });

  it('pickLucky is the composition of both', () => {
    assert.equal(pickLucky(library(), {}, null, () => 0)?.source, 'local');
    assert.equal(pickLucky([], {}), null);
  });
});

describe('luckyCandidates', () => {
  it('sends the strongest candidates first plus random extras, reduced to safe fields', () => {
    const scored = scoreCandidates(library(), {});
    const out = luckyCandidates(scored, () => 0, 3);
    assert.equal(out.length, 3);
    assert.equal(out[0].title, 'Unread saga next');
    assert.deepEqual(Object.keys(out[0]).sort(), ['authors', 'genres', 'id', 'rating', 'series', 'title']);
    assert.equal(out[0].series, 'Saga #3');
  });
});

describe('tasteSummary', () => {
  it('summarises genres, finished, loved and disliked without listing the library', () => {
    const text = tasteSummary(library());
    assert.match(text, /Genres they gravitate to: Fantasy/);
    assert.match(text, /Rated highly: Finished fantasy/);
    assert.match(text, /Did not enjoy: Hated romance/);
    assert.doesNotMatch(text, /Unread/);
  });

  it('has a fallback for an empty history', () => {
    assert.match(tasteSummary([]), /No reading history yet/);
  });
});
