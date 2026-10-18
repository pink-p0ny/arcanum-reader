// Plain-text books for foliate-js. The file becomes a reflowable book: paragraphs from blank-line (or
// single-line) breaks, chapters from heading-looking lines, everything else as <p>. CFIs, highlights, search
// and read-aloud then work exactly as for an EPUB.

const MAX_SECTION = 120_000; // characters; longer chapters are split so the paginator stays quick

function decode(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const HEADING =
  /^(chapter|part|book|section|prologue|epilogue|preface|introduction|letter|canto|act|scene|stave|volume)\b[^\n]{0,70}$|^[IVXLC]+\.?$|^\d{1,3}\.?$/i;

/** A short block that is all capitals or looks like "Chapter IV" starts a new chapter. */
function isHeading(block) {
  if (block.length > 80 || block.includes('\n')) return false;
  if (HEADING.test(block)) return true;
  const letters = block.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && block.length < 60;
}

/** Paragraph strings from raw text, joining hard-wrapped lines inside a paragraph. */
export function toParagraphs(text) {
  const t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  let blocks = t.split(/\n[ \t]*\n+/);
  // No blank lines to speak of: every line is its own paragraph.
  if (blocks.length < 3 && t.split('\n').length > 20) blocks = t.split('\n');
  return blocks
    .map((b) =>
      b
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean);
}

/** Groups paragraphs into chapters; the first chapter has no title when the text does not start with one. */
export function toChapters(paragraphs) {
  const chapters = [];
  let current = { title: null, paragraphs: [] };
  for (const p of paragraphs) {
    if (isHeading(p) && (current.paragraphs.length || current.title)) {
      chapters.push(current);
      current = { title: p, paragraphs: [] };
    } else if (isHeading(p) && !current.title) current.title = p;
    else current.paragraphs.push(p);
  }
  chapters.push(current);
  // Split very long chapters into untitled continuation sections.
  const out = [];
  for (const c of chapters) {
    let part = { title: c.title, paragraphs: [] };
    let size = 0;
    for (const p of c.paragraphs) {
      if (size + p.length > MAX_SECTION && part.paragraphs.length) {
        out.push(part);
        part = { title: null, paragraphs: [] };
        size = 0;
      }
      part.paragraphs.push(p);
      size += p.length;
    }
    if (part.paragraphs.length || part.title) out.push(part);
  }
  return out.filter((c) => c.paragraphs.length || c.title);
}

const LANGUAGES = {
  english: 'en', french: 'fr', german: 'de', spanish: 'es', italian: 'it', portuguese: 'pt', dutch: 'nl',
  russian: 'ru', swedish: 'sv', danish: 'da', norwegian: 'no', finnish: 'fi', polish: 'pl', latin: 'la',
  greek: 'el', chinese: 'zh', japanese: 'ja', hungarian: 'hu', czech: 'cs', esperanto: 'eo',
};

/** "Title: X" / "Author: Y" / "Language: Z" lines near the top (Project Gutenberg style), if any. */
export function headerMeta(text) {
  const head = text.slice(0, 4000);
  const title = head.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
  const author = head.match(/^Author:\s*(.+)$/m)?.[1]?.trim();
  const langName = head.match(/^Language:\s*(.+)$/m)?.[1]?.trim().toLowerCase();
  const language = langName ? (LANGUAGES[langName] ?? (/^[a-z]{2,3}(-[a-z]+)?$/i.test(langName) ? langName : undefined)) : undefined;
  return { title, author, language };
}

const render = (chapter) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(chapter.title ?? '')}</title>
<style>body { max-width: 40em; margin: 0 auto; } p { margin: 0 0 1em; } h2 { text-align: center; margin: 2em 0 1.5em; }</style>
</head><body>${chapter.title ? `<h2>${esc(chapter.title)}</h2>` : ''}${chapter.paragraphs
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n')}</body></html>`;

export async function makeTxt(file) {
  const text = decode(await file.arrayBuffer());
  const meta = headerMeta(text);
  const chapters = toChapters(toParagraphs(text));
  if (!chapters.length) throw new Error('The text file is empty');
  const urls = [];
  const book = {};
  book.metadata = {
    title: meta.title ?? (file.name ?? 'book.txt').replace(/\.[^.]+$/, ''),
    author: meta.author,
    // Read-aloud segments sentences per language; the device locale is the best guess for a bare text file.
    language: meta.language ?? navigator.language ?? 'en',
  };
  book.sections = chapters.map((c, index) => {
    const html = render(c);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    urls.push(url);
    return {
      id: index,
      load: () => url,
      createDocument: () => new DOMParser().parseFromString(html, 'text/html'),
      size: html.length,
      linear: 'yes',
    };
  });
  book.toc = chapters
    .map((c, index) => (c.title ? { label: c.title, href: String(index) } : null))
    .filter(Boolean);
  book.resolveHref = (href) => ({ index: Number(href.split('#')[0]) });
  book.splitTOCHref = (href) => [Number(href), null];
  book.getTOCFragment = (doc) => doc.documentElement;
  book.destroy = () => {
    for (const url of urls) URL.revokeObjectURL(url);
  };
  return book;
}
