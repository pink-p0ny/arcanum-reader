import { Directory, File, Paths } from 'expo-file-system';

import { getDownload, removeDownload, setDownload } from './db';
import { extensionFor } from './formats';
import { isFolderBook } from './library-folder';
import { getProvider } from './provider';
import { createStore } from './store';

export const booksDir = () => new Directory(Paths.document, 'books');

type DownloadState = { status: 'downloading'; progress: number } | { status: 'error'; message: string };

/** In-flight downloads keyed by book id. Finished downloads live in SQLite. */
export const downloadsStore = createStore<Record<number, DownloadState>>({});

function setState(bookId: number, state: DownloadState | null) {
  downloadsStore.set((prev) => {
    const next = { ...prev };
    if (state) next[bookId] = state;
    else delete next[bookId];
    return next;
  });
}

export async function localBookFile(bookId: number): Promise<File | null> {
  const row = await getDownload(bookId);
  if (!row) return null;
  const file = new File(row.path);
  if (!file.exists) {
    await removeDownload(bookId);
    return null;
  }
  return file;
}

export async function downloadBook(bookId: number, fileId: number | null | undefined, bookType = 'EPUB') {
  const source = await getProvider(bookId).downloadSource(bookId, bookType);
  if (source.url.startsWith('file://')) return registerLocalFile(bookId, fileId, source.url);
  const dir = booksDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${bookId}.${extensionFor(bookType)}`);
  if (dest.exists) dest.delete();
  setState(bookId, { status: 'downloading', progress: 0 });
  try {
    const task = File.createDownloadTask(source.url, dest, {
      headers: source.headers ?? {},
      sessionType: 'foreground',
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0)
          setState(bookId, {
            status: 'downloading',
            progress: bytesWritten / totalBytes,
          });
      },
    });
    const file = await task.downloadAsync();
    if (!file) throw new Error('Download did not complete');
    await setDownload({
      book_id: bookId,
      file_id: fileId ?? null,
      path: file.uri,
      size_bytes: file.size ?? null,
    });
    setState(bookId, null);
    return file;
  } catch (e) {
    if (dest.exists) dest.delete();
    setState(bookId, { status: 'error', message: (e as Error).message });
    throw e;
  }
}

/** Folder-library books are already on disk (or arriving from iCloud); record where, without copying. */
async function registerLocalFile(bookId: number, fileId: number | null | undefined, url: string) {
  const file = new File(url);
  setState(bookId, { status: 'downloading', progress: 0 });
  try {
    const deadline = Date.now() + 90 * 1000;
    while (!(file.exists && (file.size ?? 0) > 0)) {
      if (Date.now() > deadline) throw new Error('Still waiting for iCloud to download this book.');
      await new Promise((r) => setTimeout(r, 1000));
    }
    await setDownload({
      book_id: bookId,
      file_id: fileId ?? null,
      path: file.uri,
      size_bytes: file.size ?? null,
    });
    setState(bookId, null);
    return file;
  } catch (e) {
    setState(bookId, { status: 'error', message: (e as Error).message });
    throw e;
  }
}

export async function deleteDownload(bookId: number) {
  const row = await getDownload(bookId);
  if (isFolderBook(bookId)) {
    // The file is the library copy; only forget that it was "downloaded".
    if (row) await removeDownload(bookId);
    return;
  }
  if (row) {
    const f = new File(row.path);
    if (f.exists) f.delete();
    await removeDownload(bookId);
  }
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
