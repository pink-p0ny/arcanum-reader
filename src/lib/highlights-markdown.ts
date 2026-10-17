import type { Annotation } from './types';

/** Pure Markdown rendering of a book's highlights and notes. No Expo imports, so it runs in Node for tests. */

const STYLE_WORD: Record<string, string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  squiggly: 'Squiggle',
};

export function highlightsMarkdown(
  book: { title: string; authors?: string[] },
  annotations: Pick<Annotation, 'text' | 'style' | 'note' | 'chapterTitle' | 'createdAt'>[],
): string {
  const lines: string[] = [`# ${book.title}`];
  if (book.authors?.length) lines.push(`*${book.authors.join(', ')}*`);
  lines.push('', `${annotations.length} ${annotations.length === 1 ? 'highlight' : 'highlights'}`, '');

  let chapter: string | undefined;
  for (const a of annotations) {
    const title = a.chapterTitle?.trim() || 'Untitled';
    if (title !== chapter) {
      chapter = title;
      lines.push(`## ${chapter}`, '');
    }
    const quote = (a.text ?? '').trim().replace(/\s+/g, ' ');
    lines.push(`> ${quote}`);
    const meta = [STYLE_WORD[a.style ?? 'highlight'] ?? a.style, a.createdAt?.slice(0, 10)].filter(Boolean);
    if (meta.length) lines.push('>', `> <sup>${meta.join(' · ')}</sup>`);
    if (a.note?.trim()) lines.push('', a.note.trim());
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** A file name that is safe on every filesystem the share sheet might hand it to. */
export const safeFileName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Highlights';
