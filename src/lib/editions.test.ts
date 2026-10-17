/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collapseEditions, editionKey, siblingEditions } from './editions';
import { pickReadableFile, typeFromName } from './formats';
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
  it('ignores case, punctuation, bracketed notes and a leading article', () => {
    assert.equal(
      editionKey({ title: 'The Hobbit: Or There & Back (Illustrated)', authors: ['J.R.R. Tolkien'] }),
      'hobbit or there and back|j r r tolkien',
    );
    assert.equal(
      editionKey({ title: 'Pride and Prejudice', authors: ['Jane Austen'] }),
      'pride and prejudice|jane austen',
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
    assert.equal(typeFromName('a.pdf'), null);
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
    assert.equal(pickReadableFile([files[2]], { id: 3, type: 'PDF' }), null);
  });
});
