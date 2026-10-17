import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { LocalAnnotation } from './db';
import { highlightsMarkdown, safeFileName } from './highlights-markdown';
import type { AppBookSummary } from './types';

/** Writes the book's highlights as Markdown to the cache and opens the share sheet. */
export async function shareHighlights(
  book: Pick<AppBookSummary, 'title' | 'authors'>,
  annotations: LocalAnnotation[],
): Promise<void> {
  const file = new File(Paths.cache, `${safeFileName(book.title)} – Highlights.md`);
  if (file.exists) file.delete();
  file.create();
  file.write(highlightsMarkdown(book, annotations));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', dialogTitle: 'Share highlights' });
}
