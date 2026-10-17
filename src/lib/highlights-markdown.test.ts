/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { highlightsMarkdown, safeFileName } from './highlights-markdown';

describe('highlightsMarkdown', () => {
  it('groups by chapter, quotes the text, and includes notes and metadata', () => {
    const md = highlightsMarkdown({ title: 'Pride and Prejudice', authors: ['Jane Austen'] }, [
      {
        text: 'It is a truth universally\n acknowledged',
        style: 'highlight',
        chapterTitle: 'Chapter 1',
        createdAt: '2026-10-17T01:02:03Z',
        note: 'Famous opening.',
      },
      { text: 'Second quote', style: 'underline', chapterTitle: 'Chapter 1' },
      { text: 'Later quote', style: 'squiggly', chapterTitle: 'Chapter 2' },
    ]);
    assert.equal(
      md,
      [
        '# Pride and Prejudice',
        '*Jane Austen*',
        '',
        '3 highlights',
        '',
        '## Chapter 1',
        '',
        '> It is a truth universally acknowledged',
        '>',
        '> <sup>Highlight · 2026-10-17</sup>',
        '',
        'Famous opening.',
        '',
        '> Second quote',
        '>',
        '> <sup>Underline</sup>',
        '',
        '## Chapter 2',
        '',
        '> Later quote',
        '>',
        '> <sup>Squiggle</sup>',
        '',
      ].join('\n'),
    );
  });

  it('handles a single untitled highlight and no authors', () => {
    const md = highlightsMarkdown({ title: 'T' }, [{ text: 'x' }]);
    assert.match(md, /^# T\n\n1 highlight\n\n## Untitled\n\n> x\n/);
  });
});

describe('safeFileName', () => {
  it('strips characters that filesystems reject and caps the length', () => {
    assert.equal(safeFileName('A/B: C?'), 'A B C');
    assert.equal(safeFileName('   '), 'Highlights');
    assert.equal(safeFileName('x'.repeat(100)).length, 80);
  });
});
