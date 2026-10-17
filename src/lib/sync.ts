import { isOfflineError } from './api';
import { getProvider } from './provider';
import {
  deleteLocalAnnotation,
  getAllPendingAnnotations,
  getAnnotations,
  getLocalProgress,
  getUnsyncedProgress,
  insertLocalAnnotation,
  markProgressSynced,
  patchBook,
  replaceServerAnnotations,
  resolveAnnotationSync,
  saveLocalProgress,
  updateLocalAnnotation,
  type LocalAnnotation,
} from './db';
import type { Annotation, AnnotationStyle, AppBookDetail } from './types';

// ---------- progress ----------

export interface Position {
  cfi: string | null;
  href: string | null;
  fraction: number;
}

async function pushProgress(bookId: number, fileId: number | null, pos: Position, updatedAt: number) {
  const provider = getProvider();
  if (provider.capabilities.progress) await provider.updateProgress(bookId, fileId, pos);
  await markProgressSynced(bookId, updatedAt);
}

/** The active provider's annotation API, or null for backends that keep highlights on the device only. */
const remoteAnnotations = () => getProvider().annotations ?? null;

/** Save locally right away, then try to push. Failures stay queued for `flushPending`. */
export async function saveProgress(bookId: number, fileId: number | null, pos: Position) {
  await saveLocalProgress({
    book_id: bookId,
    file_id: fileId,
    cfi: pos.cfi,
    href: pos.href,
    fraction: pos.fraction,
  });
  await patchBook(bookId, {
    readProgress: pos.fraction * 100,
    lastReadTime: new Date().toISOString(),
  });
  const row = await getLocalProgress(bookId);
  if (!row) return;
  try {
    await pushProgress(bookId, fileId, pos, row.updated_at);
  } catch (e) {
    if (!isOfflineError(e)) console.warn('progress push failed', e);
  }
}

/** Decide where to open: the newer of local and server positions. */
export async function resolveStartPosition(
  detail: AppBookDetail | null,
  bookId: number,
): Promise<Position | null> {
  const local = await getLocalProgress(bookId);
  const server = detail?.epubProgress;
  const serverAt = server?.updatedAt ? Date.parse(server.updatedAt) : 0;
  if (local && (!local.synced || local.updated_at >= serverAt)) {
    return { cfi: local.cfi, href: local.href, fraction: local.fraction };
  }
  if (server?.cfi || server?.percentage != null) {
    return {
      cfi: server.cfi ?? null,
      href: server.href ?? null,
      fraction: (server.percentage ?? 0) / 100,
    };
  }
  return local ? { cfi: local.cfi, href: local.href, fraction: local.fraction } : null;
}

// ---------- annotations ----------

export async function loadAnnotations(bookId: number): Promise<LocalAnnotation[]> {
  const remote = remoteAnnotations();
  if (remote) {
    try {
      const server = await remote.list(bookId);
      await replaceServerAnnotations(bookId, server);
    } catch (e) {
      if (!isOfflineError(e)) console.warn('annotation fetch failed', e);
    }
  }
  return getAnnotations(bookId);
}

export async function createAnnotation(input: {
  bookId: number;
  cfi: string;
  text: string;
  color: string;
  style: AnnotationStyle;
  note?: string;
  chapterTitle?: string;
}): Promise<LocalAnnotation> {
  const local = await insertLocalAnnotation({
    ...input,
    text: input.text.slice(0, 5000),
  });
  const remote = remoteAnnotations();
  if (!remote) return local;
  try {
    const created = await remote.create({
      bookId: input.bookId,
      cfi: input.cfi,
      text: local.text,
      color: input.color,
      style: input.style,
      note: input.note,
      chapterTitle: input.chapterTitle?.slice(0, 500),
    });
    await resolveAnnotationSync(local.localId, created);
    return { ...created, localId: local.localId, pending: null };
  } catch (e) {
    if (!isOfflineError(e)) console.warn('annotation create failed', e);
    return local;
  }
}

export async function updateAnnotation(
  a: LocalAnnotation,
  patch: { color?: string; style?: AnnotationStyle; note?: string },
) {
  await updateLocalAnnotation(a.localId, patch, 'update');
  const remote = remoteAnnotations();
  if (remote && a.id > 0) {
    try {
      const updated = await remote.update(a.id, patch);
      await resolveAnnotationSync(a.localId, updated);
    } catch (e) {
      if (!isOfflineError(e)) console.warn('annotation update failed', e);
    }
  }
}

export async function deleteAnnotation(a: LocalAnnotation) {
  await deleteLocalAnnotation(a.localId);
  const remote = remoteAnnotations();
  if (remote && a.id > 0) {
    try {
      await remote.remove(a.id);
      await resolveAnnotationSync(a.localId, null);
    } catch (e) {
      if (!isOfflineError(e)) console.warn('annotation delete failed', e);
    }
  }
}

// ---------- outbox ----------

let flushing = false;

/** Push anything that failed earlier. Called on app start, on reader open and when the app returns to the foreground. */
export async function flushPending() {
  if (flushing) return;
  flushing = true;
  try {
    for (const p of await getUnsyncedProgress()) {
      try {
        await pushProgress(
          p.book_id,
          p.file_id,
          { cfi: p.cfi, href: p.href, fraction: p.fraction },
          p.updated_at,
        );
      } catch (e) {
        if (isOfflineError(e)) return;
      }
    }
    const remote = remoteAnnotations();
    if (!remote) return;
    for (const row of await getAllPendingAnnotations()) {
      const a = JSON.parse(row.json) as Annotation;
      try {
        if (row.pending === 'create') {
          const created = await remote.create({
            bookId: row.book_id,
            cfi: a.cfi,
            text: a.text,
            color: a.color,
            style: a.style,
            note: a.note,
            chapterTitle: a.chapterTitle,
          });
          await resolveAnnotationSync(row.local_id, created);
        } else if (row.pending === 'update' && row.server_id) {
          const updated = await remote.update(row.server_id, {
            color: a.color,
            style: a.style,
            note: a.note,
          });
          await resolveAnnotationSync(row.local_id, updated);
        } else if (row.pending === 'delete' && row.server_id) {
          try {
            await remote.remove(row.server_id);
          } catch (e) {
            if (isOfflineError(e)) throw e; // anything else (e.g. already gone) counts as done
          }
          await resolveAnnotationSync(row.local_id, null);
        }
      } catch (e) {
        if (isOfflineError(e)) return;
        console.warn('annotation sync failed', e);
      }
    }
  } finally {
    flushing = false;
  }
}
