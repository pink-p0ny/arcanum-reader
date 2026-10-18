/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { authorKey, collapseEditions, editionKey, siblingEditions } from './editions';
import { cfiForPage, pageFromCfi, pickReadableFile, typeFromName } from './formats';
import type { AppBookSummary } from './types';

const b = (id: number, title: string, type: string, over: Partial<AppBookSummary> = {}): AppBookSummary => ({
  id,
  title,
  authors: ['Jane Austen'],
  primaryFileType: type,
  primaryFileId: id * 10,
  ...over,
});

describe('editionKey', () => {
  it('ignores case, punctuation, bracketed notes, subtitles and a leading article', () => {
    assert.equal(
      editionKey({ title: 'The Hobbit: Or There & Back (Illustrated)', authors: ['J.R.R. Tolkien'] }),
      'hobbit|j r r tolkien',
    );
    assert.equal(editionKey({ title: "Liar's Poker", authors: ['Michael Lewis'] }), 'liars poker|lewis michael');
    assert.equal(editionKey({ title: 'Liars Poker', authors: ['Michael Lewis'] }), 'liars poker|lewis michael');
    assert.equal(editionKey({ title: 'Waking Up: A Guide to Spirituality', authors: ['Sam Harris'] }), 'waking up|harris sam');
    assert.equal(editionKey({ title: 'Hunting Season - Anna Pigeon 10', authors: [] }), 'hunting season|');
    assert.equal(editionKey({ title: '', authors: [] }), '');
  });

  it('matches authors written last name first', () => {
    assert.equal(authorKey(['Barr, Nevada']), authorKey(['Nevada Barr']));
    assert.notEqual(authorKey(['Nevada Barr']), authorKey(['Sam Harris']));
    assert.equal(
      editionKey({ title: 'Pride and Prejudice', authors: ['Jane Austen'] }),
      'pride and prejudice|austen jane',
    );
  });
});

describe('collapseEditions', () => {
  it('shows one card per title and lists the editions', () => {
    const out = collapseEditions([
      b(1, 'Pride and Prejudice', 'MOBI'),
      b(2, 'Emma', 'EPUB'),
      b(3, 'Pride & Prejudice', 'EPUB'),
    ]);
    assert.equal(out.length, 2);
    const pp = out.find((x) => x.title.startsWith('Pride'))!;
    assert.equal(pp.id, 3, 'EPUB edition represents the group');
    assert.deepEqual(pp.editions, [
      { id: 1, type: 'MOBI' },
      { id: 3, type: 'EPUB' },
    ]);
    assert.equal(out.find((x) => x.title === 'Emma')!.editions, undefined);
  });

  it('prefers the edition being read over a better format', () => {
    const out = collapseEditions([b(1, 'Emma', 'MOBI', { readProgress: 40 }), b(2, 'Emma', 'EPUB')]);
    assert.equal(out[0].id, 1);
  });

  it('never merges books with no title or author', () => {
    const out = collapseEditions([b(1, '', 'EPUB', { authors: [] }), b(2, '', 'EPUB', { authors: [] })]);
    assert.equal(out.length, 2);
  });

  it('merges copies whose metadata differs in author order, apostrophes, subtitle or a missing author', () => {
    const out = collapseEditions([
      b(1, 'Borderline', 'EPUB', { authors: ['Nevada Barr'] }),
      b(2, 'Borderline', 'PDF', { authors: ['Barr, Nevada'] }),
      b(3, "Liar's Poker", 'EPUB', { authors: ['Michael Lewis'] }),
      b(4, 'Liars Poker', 'PDF', { authors: ['Michael Lewis'] }),
      b(5, 'Waking Up', 'EPUB', { authors: ['Sam Harris'] }),
      b(6, 'Waking Up: A Guide to Spirituality Without Religion', 'PDF', { authors: ['Sam Harris'] }),
      b(7, 'Burn', 'EPUB', { authors: ['Nevada Barr'] }),
      b(8, 'Burn', 'PDF', { authors: [] }),
    ]);
    assert.deepEqual(
      out.map((x) => [x.id, (x.editions ?? []).map((e) => e.id)]),
      [
        [1, [1, 2]],
        [3, [3, 4]],
        [5, [5, 6]],
        [7, [7, 8]],
      ],
    );
  });

  it('keeps different books apart when only the base title matches', () => {
    const out = collapseEditions([
      b(1, 'Star Wars: A New Hope', 'EPUB', { authors: ['George Lucas'] }),
      b(2, 'Star Wars: The Last Jedi', 'EPUB', { authors: ['Jason Fry'] }),
      b(3, 'Star Wars: The Last Jedi', 'PDF', { authors: ['Jason Fry'] }),
      b(4, 'Burn', 'EPUB', { authors: ['Nevada Barr'] }),
      b(5, 'Burn', 'EPUB', { authors: ['James Patterson'] }),
      b(6, 'Burn', 'PDF', { authors: [] }),
    ]);
    assert.deepEqual(
      out.map((x) => [x.id, (x.editions ?? []).map((e) => e.id)]),
      [
        [1, []],
        [2, [2, 3]],
        [4, []],
        [5, []],
        [6, []],
      ],
    );
  });
});

describe('siblingEditions', () => {
  it('lists the other editions of a book', () => {
    const books = [b(1, 'Emma', 'MOBI'), b(2, 'Emma', 'EPUB'), b(3, 'Persuasion', 'EPUB')];
    assert.deepEqual(siblingEditions(2, books), [{ id: 1, type: 'MOBI' }]);
    assert.deepEqual(siblingEditions(3, books), []);
  });
});

describe('formats', () => {
  it('maps file names to server types and picks the best readable file', () => {
    assert.equal(typeFromName('a.EPUB'), 'EPUB');
    assert.equal(typeFromName('a.azw'), 'AZW3');
    assert.equal(typeFromName('a.pdf'), 'PDF');
    assert.equal(typeFromName('notes.TXT'), 'TXT');
    assert.equal(typeFromName('a.cbz'), null);
    const files = [
      {
        id: 1,
        bookId: 9,
        fileName: 'a.mobi',
        isBook: true,
        folderBased: false,
        bookType: 'MOBI',
        isPrimary: true,
      },
      {
        id: 2,
        bookId: 9,
        fileName: 'a.epub',
        isBook: true,
        folderBased: false,
        bookType: 'EPUB',
        isPrimary: false,
      },
      {
        id: 3,
        bookId: 9,
        fileName: 'a.pdf',
        isBook: true,
        folderBased: false,
        bookType: 'PDF',
        isPrimary: false,
      },
    ];
    assert.deepEqual(pickReadableFile(files, { id: 1, type: 'MOBI' }), {
      id: 2,
      type: 'EPUB',
      name: 'a.epub',
    });
    assert.deepEqual(pickReadableFile(undefined, { id: 7, type: 'mobi', name: 'x.mobi' }), {
      id: 7,
      type: 'MOBI',
      name: 'x.mobi',
    });
    assert.deepEqual(pickReadableFile([files[2]], { id: 3, type: 'PDF' }), { id: 3, type: 'PDF', name: 'a.pdf' });
    assert.equal(pickReadableFile(undefined, { id: 3, type: 'CBX' }), null);
  });

  it('maps PDF pages to foliate section CFIs and back', () => {
    assert.equal(cfiForPage(1), 'epubcfi(/6/2)');
    assert.equal(pageFromCfi('epubcfi(/6/24)'), 12);
    assert.equal(pageFromCfi('epubcfi(/6/24!/4/2)'), 12);
    assert.equal(pageFromCfi('epubcfi(/6/3)'), null);
    assert.equal(pageFromCfi(null), null);
  });
});
