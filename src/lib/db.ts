import * as SQLite from 'expo-sqlite';

import type { Annotation, AppBookSummary } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('grimmory.db');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY,
        json TEXT NOT NULL,
        title TEXT NOT NULL,
        authors TEXT,
        last_read_time TEXT,
        added_on TEXT,
        read_progress REAL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS downloads (
        book_id INTEGER PRIMARY KEY,
        file_id INTEGER,
        path TEXT NOT NULL,
        size_bytes INTEGER,
        downloaded_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS annotations (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER UNIQUE,
        book_id INTEGER NOT NULL,
        json TEXT NOT NULL,
        pending TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS annotations_book ON annotations(book_id);
      CREATE TABLE IF NOT EXISTS progress (
        book_id INTEGER PRIMARY KEY,
        file_id INTEGER,
        cfi TEXT,
        href TEXT,
        fraction REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    version = 1;
  }
  await db.execAsync(`PRAGMA user_version = ${version}`);
}

// ---- kv ----
export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet(key: string, value: unknown) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

// ---- books ----
export async function upsertBooks(books: AppBookSummary[]) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const b of books) {
      await db.runAsync(
        `INSERT OR REPLACE INTO books (id, json, title, authors, last_read_time, added_on, read_progress, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        b.id,
        JSON.stringify(b),
        b.title ?? '',
        (b.authors ?? []).join(', '),
        b.lastReadTime ?? null,
        b.addedOn ?? null,
        b.readProgress ?? null,
        now,
      );
    }
  });
}

export async function deleteBooksNotIn(ids: number[]) {
  const db = await getDb();
  if (ids.length === 0) {
    await db.runAsync('DELETE FROM books');
    return;
  }
  // SQLite caps bound params; chunk the NOT IN list by deleting everything not in a temp table.
  await db.withTransactionAsync(async () => {
    await db.execAsync('CREATE TEMP TABLE IF NOT EXISTS keep (id INTEGER PRIMARY KEY); DELETE FROM keep;');
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await db.runAsync(
        `INSERT OR IGNORE INTO keep (id) VALUES ${chunk.map(() => '(?)').join(',')}`,
        ...chunk,
      );
    }
    await db.execAsync('DELETE FROM books WHERE id NOT IN (SELECT id FROM keep); DELETE FROM keep;');
  });
}

export type LibrarySort = 'title' | 'recent' | 'added';

export async function getBooks(opts: { search?: string; sort: LibrarySort }): Promise<AppBookSummary[]> {
  const db = await getDb();
  const order =
    opts.sort === 'recent'
      ? 'last_read_time DESC NULLS LAST, title COLLATE NOCASE'
      : opts.sort === 'added'
        ? 'added_on DESC, title COLLATE NOCASE'
        : 'title COLLATE NOCASE';
  const where = opts.search ? 'WHERE title LIKE ? OR authors LIKE ?' : '';
  const params = opts.search ? [`%${opts.search}%`, `%${opts.search}%`] : [];
  const rows = await db.getAllAsync<{ json: string }>(
    `SELECT json FROM books ${where} ORDER BY ${order}`,
    ...params,
  );
  return rows.map((r) => JSON.parse(r.json) as AppBookSummary);
}

export async function getBook(id: number): Promise<AppBookSummary | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM books WHERE id = ?', id);
  return row ? (JSON.parse(row.json) as AppBookSummary) : null;
}

export async function patchBook(id: number, patch: Partial<AppBookSummary>) {
  const existing = await getBook(id);
  if (!existing) return;
  await upsertBooks([{ ...existing, ...patch }]);
}

// ---- downloads ----
export interface DownloadRow {
  book_id: number;
  file_id: number | null;
  path: string;
  size_bytes: number | null;
  downloaded_at: number;
}

export async function getDownload(bookId: number) {
  const db = await getDb();
  return db.getFirstAsync<DownloadRow>('SELECT * FROM downloads WHERE book_id = ?', bookId);
}

export async function getDownloads() {
  const db = await getDb();
  return db.getAllAsync<DownloadRow>('SELECT * FROM downloads ORDER BY downloaded_at DESC');
}

export async function setDownload(row: Omit<DownloadRow, 'downloaded_at'>) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO downloads (book_id, file_id, path, size_bytes, downloaded_at) VALUES (?, ?, ?, ?, ?)',
    row.book_id,
    row.file_id,
    row.path,
    row.size_bytes,
    Date.now(),
  );
}

export async function removeDownload(bookId: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM downloads WHERE book_id = ?', bookId);
}

// ---- progress ----
export interface ProgressRow {
  book_id: number;
  file_id: number | null;
  cfi: string | null;
  href: string | null;
  fraction: number;
  updated_at: number;
  synced: number;
}

export async function getLocalProgress(bookId: number) {
  const db = await getDb();
  return db.getFirstAsync<ProgressRow>('SELECT * FROM progress WHERE book_id = ?', bookId);
}

export async function saveLocalProgress(
  row: Omit<ProgressRow, 'updated_at' | 'synced'> & { synced?: boolean },
) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO progress (book_id, file_id, cfi, href, fraction, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
    row.book_id,
    row.file_id,
    row.cfi,
    row.href,
    row.fraction,
    Date.now(),
    row.synced ? 1 : 0,
  );
}

export async function markProgressSynced(bookId: number, updatedAt: number) {
  const db = await getDb();
  await db.runAsync('UPDATE progress SET synced = 1 WHERE book_id = ? AND updated_at = ?', bookId, updatedAt);
}

export async function getUnsyncedProgress() {
  const db = await getDb();
  return db.getAllAsync<ProgressRow>('SELECT * FROM progress WHERE synced = 0');
}

// ---- annotations ----
export type PendingOp = 'create' | 'update' | 'delete' | null;

export interface AnnotationRow {
  local_id: number;
  server_id: number | null;
  book_id: number;
  json: string;
  pending: PendingOp;
  updated_at: number;
}

export interface LocalAnnotation extends Annotation {
  localId: number;
  pending: PendingOp;
}

const toLocal = (r: AnnotationRow): LocalAnnotation => ({
  ...(JSON.parse(r.json) as Annotation),
  id: r.server_id ?? -r.local_id,
  localId: r.local_id,
  pending: r.pending,
});

export async function getAnnotations(bookId: number): Promise<LocalAnnotation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AnnotationRow>(
    "SELECT * FROM annotations WHERE book_id = ? AND (pending IS NULL OR pending != 'delete') ORDER BY updated_at",
    bookId,
  );
  return rows.map(toLocal);
}

export async function getAllPendingAnnotations(): Promise<AnnotationRow[]> {
  const db = await getDb();
  return db.getAllAsync<AnnotationRow>(
    'SELECT * FROM annotations WHERE pending IS NOT NULL ORDER BY updated_at',
  );
}

/** Replace the cached server copies for a book, keeping local pending edits. */
export async function replaceServerAnnotations(bookId: number, list: Annotation[]) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM annotations WHERE book_id = ? AND pending IS NULL', bookId);
    for (const a of list) {
      const pending = await db.getFirstAsync<{ local_id: number }>(
        'SELECT local_id FROM annotations WHERE server_id = ?',
        a.id,
      );
      if (pending) continue; // a local edit is queued for it; keep ours until it syncs
      await db.runAsync(
        'INSERT OR REPLACE INTO annotations (server_id, book_id, json, pending, updated_at) VALUES (?, ?, ?, NULL, ?)',
        a.id,
        bookId,
        JSON.stringify(a),
        now,
      );
    }
  });
}

export async function insertLocalAnnotation(a: Omit<Annotation, 'id'>): Promise<LocalAnnotation> {
  const db = await getDb();
  const res = await db.runAsync(
    "INSERT INTO annotations (server_id, book_id, json, pending, updated_at) VALUES (NULL, ?, ?, 'create', ?)",
    a.bookId,
    JSON.stringify({ ...a, id: 0 }),
    Date.now(),
  );
  return {
    ...a,
    id: -res.lastInsertRowId,
    localId: res.lastInsertRowId,
    pending: 'create',
  };
}

export async function updateLocalAnnotation(localId: number, patch: Partial<Annotation>, pending: PendingOp) {
  const db = await getDb();
  const row = await db.getFirstAsync<AnnotationRow>('SELECT * FROM annotations WHERE local_id = ?', localId);
  if (!row) return;
  const merged = { ...(JSON.parse(row.json) as Annotation), ...patch };
  // A not-yet-created annotation stays a "create"; an existing one becomes an "update".
  const nextPending: PendingOp = row.pending === 'create' ? 'create' : pending;
  await db.runAsync(
    'UPDATE annotations SET json = ?, pending = ?, updated_at = ? WHERE local_id = ?',
    JSON.stringify(merged),
    nextPending,
    Date.now(),
    localId,
  );
}

export async function deleteLocalAnnotation(localId: number) {
  const db = await getDb();
  const row = await db.getFirstAsync<AnnotationRow>('SELECT * FROM annotations WHERE local_id = ?', localId);
  if (!row) return;
  if (row.server_id == null) {
    await db.runAsync('DELETE FROM annotations WHERE local_id = ?', localId);
  } else {
    await db.runAsync(
      "UPDATE annotations SET pending = 'delete', updated_at = ? WHERE local_id = ?",
      Date.now(),
      localId,
    );
  }
}

export async function resolveAnnotationSync(localId: number, result: Annotation | null) {
  const db = await getDb();
  if (!result) {
    await db.runAsync('DELETE FROM annotations WHERE local_id = ?', localId);
  } else {
    await db.runAsync(
      'UPDATE annotations SET server_id = ?, json = ?, pending = NULL, updated_at = ? WHERE local_id = ?',
      result.id,
      JSON.stringify(result),
      Date.now(),
      localId,
    );
  }
}

export async function clearLocalData() {
  const db = await getDb();
  await db.execAsync(
    'DELETE FROM books; DELETE FROM downloads; DELETE FROM annotations; DELETE FROM progress; DELETE FROM kv;',
  );
}
