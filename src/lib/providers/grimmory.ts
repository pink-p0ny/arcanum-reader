import { api, coverSource } from '../api';
import { getFreshSession, sessionStore } from '../session';
import type { UpdateProgressRequest } from '../types';
import type { LibraryProvider } from './types';

/** Grimmory (and its parent Booklore) through the `/api/v1/app/*` mobile endpoints. */
export const grimmoryProvider: LibraryProvider = {
  kind: 'grimmory',
  label: 'Grimmory',
  capabilities: { progress: true, annotations: true, status: true },

  async listBooks(page, size) {
    const res = await api.books.list({ page, size, sort: 'title', dir: 'asc' });
    return { items: res.content, hasNext: res.hasNext };
  },

  bookDetail: (bookId) => api.books.detail(bookId),

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

  async updateProgress(bookId, fileId, pos) {
    const percentage = Math.round(pos.fraction * 100 * 100) / 100;
    const body: UpdateProgressRequest = pos.page
      ? { pdfProgress: { page: pos.page, percentage } }
      : { epubProgress: { cfi: pos.cfi ?? undefined, href: pos.href ?? undefined, percentage } };
    if (fileId != null) {
      body.fileProgress = {
        bookFileId: fileId,
        positionData: pos.cfi ?? undefined,
        positionHref: pos.href ?? undefined,
        progressPercent: percentage,
      };
    }
    await api.books.updateProgress(bookId, body);
  },

  updateStatus: (bookId, status) => api.books.updateStatus(bookId, status),

  annotations: {
    list: (bookId) => api.annotations.forBook(bookId),
    create: (input) => api.annotations.create(input),
    update: (id, patch) => api.annotations.update(id, patch),
    remove: (id) => api.annotations.remove(id),
  },
};
