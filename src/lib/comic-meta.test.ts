/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strToU8, zipSync } from 'fflate';

import { comicPages, comicTitle, naturalCompare, parseComicInfo, readCbz } from './comic-meta';

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);

const INFO = `<?xml version="1.0"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Title>The Haunted Press</Title>
  <Series>Grimmory Tales</Series>
  <Number>3</Number>
  <Volume>2</Volume>
  <Summary>Ink &amp; bone.</Summary>
  <Year>2024</Year><Month>7</Month>
  <Writer>Ada Quill, Bram Stoker</Writer>
  <Publisher>Pink Pony</Publisher>
  <Genre>Horror, Comedy</Genre>
  <LanguageISO>en</LanguageISO>
  <PageCount>12</PageCount>
  <Manga>YesAndRightToLeft</Manga>
  <Pages>
    <Page Image="0" Type="FrontCover" />
    <Page Image="4" DoublePage="true" />
    <Page Image="6" Bookmark="Chapter Two" />
  </Pages>
</ComicInfo>`;

describe('comic archives', () => {
  it('orders pages like a person would and drops junk entries', () => {
    const names = [
      'book/pg-10.jpg',
      'book/pg-2.JPG',
      'book/pg-1.jpg',
      'book/ComicInfo.xml',
      '__MACOSX/book/._pg-1.jpg',
      'book/.hidden.png',
      'book/Thumbs.db',
      'book/',
      'book/pg-010.jpg',
    ];
    assert.deepEqual(comicPages(names), ['book/pg-1.jpg', 'book/pg-2.JPG', 'book/pg-10.jpg', 'book/pg-010.jpg']);
    assert.ok(naturalCompare('a2', 'a10') < 0);
    assert.ok(naturalCompare('B', 'a') > 0);
    assert.equal(naturalCompare('x', 'x'), 0);
  });

  it('reads ComicInfo.xml', () => {
    const info = parseComicInfo(INFO);
    assert.equal(info.title, 'The Haunted Press');
    assert.equal(info.series, 'Grimmory Tales');
    assert.equal(info.number, '3');
    assert.equal(info.issue, 3);
    assert.equal(info.volume, 2);
    assert.equal(info.summary, 'Ink & bone.');
    assert.equal(info.published, '2024-07');
    assert.deepEqual(info.writers, ['Ada Quill', 'Bram Stoker']);
    assert.equal(info.publisher, 'Pink Pony');
    assert.deepEqual(info.genres, ['Horror', 'Comedy']);
    assert.equal(info.language, 'en');
    assert.equal(info.pageCount, 12);
    assert.equal(info.rtl, true);
    assert.deepEqual(info.doublePages, [4]);
    assert.deepEqual([...info.bookmarks], [[6, 'Chapter Two']]);
  });

  it('titles a comic from the info, the series or the file name', () => {
    assert.equal(comicTitle(parseComicInfo(INFO), 'x.cbz'), 'The Haunted Press');
    assert.equal(comicTitle(parseComicInfo('<ComicInfo><Series>Saga</Series><Number>7</Number></ComicInfo>'), 'x.cbz'), 'Saga 7');
    assert.equal(comicTitle(parseComicInfo('<ComicInfo><Manga>Yes</Manga></ComicInfo>'), 'Saga 007.cbz'), 'Saga 007');
    assert.equal(comicTitle(null, 'Saga 007.cbz'), 'Saga 007');
  });

  it('lists a CBZ and pulls the info and the first page out', () => {
    const zip = zipSync({
      'pg-3.jpg': JPG,
      'pg-1.jpeg': new Uint8Array([1, 2, 3]),
      'pg-2.png': JPG,
      'ComicInfo.xml': strToU8(INFO),
    });
    const meta = readCbz(zip);
    assert.deepEqual(meta.pages, ['pg-1.jpeg', 'pg-2.png', 'pg-3.jpg']);
    assert.equal(meta.info?.series, 'Grimmory Tales');
    assert.deepEqual(meta.cover, { bytes: new Uint8Array([1, 2, 3]), ext: 'jpg' });
  });

  it('copes with an archive that has no pages', () => {
    const meta = readCbz(zipSync({ 'readme.txt': strToU8('nope') }));
    assert.deepEqual(meta.pages, []);
    assert.equal(meta.info, null);
    assert.equal(meta.cover, undefined);
  });
});
