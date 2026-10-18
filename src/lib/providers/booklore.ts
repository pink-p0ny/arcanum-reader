import { coverSource } from '../api';
import { ApiError, getFreshSession, refreshSession, sessionStore } from '../session';
import type { AppBookDetail, AppBookFile, AppBookSummary, ReadStatus } from '../types';
import type { LibraryProvider } from './types';

/**
 * Booklore (the project Grimmory forked from) through its regular `/api/v1/books` API. Auth, covers,
 * downloads and annotations are identical to Grimmory; the catalog, detail and progress calls differ and
 * the Book DTO is nested, so this provider flattens it into the same summary shape Grimmory's mobile
 * endpoints return.
 */

interface BlFile {
  id: number;
  bookId: number;
  fileName: string;
  isBook: boolean;
  folderBased: boolean;
  bookType: string;
  archiveType?: string;
  fileSizeKb?: number;
  extension?: string;
  addedOn?: string;
}

interface BlProgress {
  cfi?: string;
  href?: string;
  percentage?: number;
  updatedAt?: string;
}

interface BlBook {
  id: number;
  libraryId?: number;
  libraryName?: string;
  primaryFile?: BlFile;
  title?: string;
  lastReadTime?: string;
  addedOn?: string;
  metadata?: {
    title?: string;
    subtitle?: string;
    publisher?: string;
    publishedDate?: string;
    description?: string;
    seriesName?: string;
    seriesNumber?: number;
    isbn13?: string;
    pageCount?: number;
    language?: string;
    amazonRating?: number;
    amazonReviewCount?: number;
    goodreadsRating?: number;
    goodreadsReviewCount?: number;
    hardcoverRating?: number;
    hardcoverReviewCount?: number;
    coverUpdatedOn?: string;
    authors?: string[];
    categories?: string[];
    tags?: string[];
  };
  pdfProgress?: BlProgress & { page?: number };
  epubProgress?: BlProgress;
  cbxProgress?: BlProgress;
  personalRating?: number;
  shelves?: { id: number; name: string; icon?: string }[];
  readStatus?: string;
  alternativeFormats?: BlFile[];
  isPhysical?: boolean;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = await getFreshSession();
  if (!session) throw new ApiError(401, 'Not signed in');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${session.serverUrl}${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, init, false);
    throw new ApiError(401, 'Session expired');
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      message = (await res.json())?.message ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const progressOf = (b: BlBook) => {
  const type = b.primaryFile?.bookType;
  const p =
    type === 'PDF' ? b.pdfProgress : type === 'CBX' ? b.cbxProgress : (b.epubProgress ?? b.pdfProgress);
  return p?.percentage;
};

function toSummary(b: BlBook): AppBookSummary {
  const m = b.metadata ?? {};
  return {
    id: b.id,
    title: m.title ?? b.title ?? '',
    authors: m.authors ?? [],
    readStatus: b.readStatus as ReadStatus | undefined,
    personalRating: b.personalRating,
    seriesName: m.seriesName,
    seriesNumber: m.seriesNumber,
    libraryId: b.libraryId,
    addedOn: b.addedOn,
    lastReadTime: b.lastReadTime,
    readProgress: progressOf(b),
    primaryFileId: b.primaryFile?.id,
    primaryFileType: b.primaryFile?.bookType,
    primaryFileName: b.primaryFile?.fileName,
    coverUpdatedOn: m.coverUpdatedOn,
    isPhysical: b.isPhysical,
    publisher: m.publisher,
    categories: m.categories ? [...m.categories] : [],
    tags: m.tags ? [...m.tags] : [],
    language: m.language,
    pageCount: m.pageCount,
    fileSizeKb: b.primaryFile?.fileSizeKb,
    goodreadsRating: m.goodreadsRating,
    goodreadsReviewCount: m.goodreadsReviewCount,
    amazonRating: m.amazonRating,
    amazonReviewCount: m.amazonReviewCount,
    hardcoverRating: m.hardcoverRating,
    hardcoverReviewCount: m.hardcoverReviewCount,
  };
}

function toFile(f: BlFile, primary: boolean): AppBookFile {
  return { ...f, isPrimary: primary };
}

function toDetail(b: BlBook): AppBookDetail {
  const m = b.metadata ?? {};
  const files: AppBookFile[] = [];
  if (b.primaryFile) files.push(toFile(b.primaryFile, true));
  for (const f of b.alternativeFormats ?? []) files.push(toFile(f, false));
  return {
    ...toSummary(b),
    subtitle: m.subtitle,
    description: m.description,
    publishedDate: m.publishedDate,
    isbn13: m.isbn13,
    libraryName: b.libraryName,
    shelves: b.shelves,
    fileTypes: files.filter((f) => f.isBook).map((f) => f.bookType),
    files,
    epubProgress: b.epubProgress,
  };
}

export const bookloreProvider: LibraryProvider = {
  kind: 'booklore',
  label: 'Booklore',
  capabilities: { progress: true, annotations: true, status: true },

  // Booklore returns the whole catalog in one response; present it as a single page.
  async listBooks(page) {
    if (page > 0) return { items: [], hasNext: false };
    const books = await request<BlBook[]>('/api/v1/books?withDescription=false');
    return { items: books.map(toSummary), hasNext: false };
  },

  bookDetail: async (bookId) => toDetail(await request<BlBook>(`/api/v1/books/${bookId}`)),

  coverSource(book) {
    const session = sessionStore.get().session;
    if (!session) return null;
    return coverSource(session.serverUrl, session.accessToken, book.id, book.coverUpdatedOn);
  },

  async downloadSource(bookId, bookType = 'EPUB') {
    const session = await getFreshSession();
    if (!session) throw new Error('Not signed in');
    return {
      url: `${session.serverUrl}/api/v1/books/${bookId}/content?bookType=${encodeURIComponent(bookType)}`,
      headers: { Authorization: `Bearer ${session.accessToken}` },
    };
  },

  async updateProgress(bookId, _fileId, pos) {
    const percentage = Math.round(pos.fraction * 100 * 100) / 100;
    await request<void>('/api/v1/books/progress', {
      method: 'POST',
      body: JSON.stringify({
        bookId,
        ...(pos.page
          ? { pdfProgress: { page: pos.page, percentage } }
          : { epubProgress: { cfi: pos.cfi ?? undefined, href: pos.href ?? undefined, percentage } }),
      }),
    });
  },

  updateStatus: (bookId, status) =>
    request<void>('/api/v1/books/status', {
      method: 'POST',
      body: JSON.stringify({ bookIds: [bookId], status }),
    }),

  annotations: {
    list: (bookId) => request(`/api/v1/annotations/book/${bookId}`),
    create: (input) => request('/api/v1/annotations', { method: 'POST', body: JSON.stringify(input) }),
    update: (id, patch) =>
      request(`/api/v1/annotations/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
    remove: (id) => request<void>(`/api/v1/annotations/${id}`, { method: 'DELETE' }),
  },
};
