import * as SecureStore from 'expo-secure-store';

import { kvGet, kvSet } from './db';
import { normalizeServerUrl } from './session';
import { createStore } from './store';

/**
 * Bindery (github.com/vavallee/bindery) finds and downloads books and pushes them into Grimmory's
 * BookDrop. This client covers what a reader needs: search the metadata providers, ask for a book, and
 * see what has been asked for. Auth is the server's API key in `X-Api-Key`.
 */

const URL_KEY = 'binderyUrl';
const SECRET_KEY = 'arcanum.bindery.apiKey';

export const binderyStore = createStore<{ url: string | null; hasKey: boolean; loaded: boolean }>({
  url: null,
  hasKey: false,
  loaded: false,
});

let loading: Promise<void> | null = null;

export function ensureBinderyLoaded(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const url = await kvGet<string>(URL_KEY);
      let hasKey = false;
      try {
        hasKey = !!(await SecureStore.getItemAsync(SECRET_KEY));
      } catch {}
      binderyStore.set({ url, hasKey, loaded: true });
    })().catch(() => {
      loading = null;
    });
  }
  return loading;
}

export async function setBinderyUrl(url: string | null) {
  const normalized = url?.trim() ? normalizeServerUrl(url) : null;
  await kvSet(URL_KEY, normalized);
  binderyStore.set((s) => ({ ...s, url: normalized }));
}

export async function setBinderyKey(key: string | null) {
  const trimmed = key?.trim() || null;
  if (trimmed) await SecureStore.setItemAsync(SECRET_KEY, trimmed);
  else await SecureStore.deleteItemAsync(SECRET_KEY);
  binderyStore.set((s) => ({ ...s, hasKey: !!trimmed }));
}

export function binderyConfigured() {
  const s = binderyStore.get();
  return !!s.url && s.hasKey;
}

export class BinderyError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  creds?: { url: string; key: string },
): Promise<T> {
  let url = creds?.url;
  let key = creds?.key;
  if (!url || !key) {
    await ensureBinderyLoaded();
    url = binderyStore.get().url ?? undefined;
    key = (await SecureStore.getItemAsync(SECRET_KEY)) ?? undefined;
  }
  if (!url || !key)
    throw new BinderyError(0, 'Bindery is not set up. Add its address and API key in Settings.');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Api-Key': key,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${url}${path}`, { ...init, headers });
  const text = await res.text();
  let body: Record<string, unknown> | undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {}
  if (!res.ok) {
    const msg =
      (body?.error as string | undefined) ??
      (res.status === 401 ? 'Bindery rejected the API key.' : `Bindery answered HTTP ${res.status}`);
    throw new BinderyError(res.status, msg, body);
  }
  return body as T;
}

/** A metadata search hit. Field names follow Bindery's search payload; the optional ones vary by provider. */
export interface BinderyHit {
  foreignBookId: string;
  title: string;
  authorName?: string;
  author?: string;
  foreignAuthorId?: string;
  releaseDate?: string;
  year?: number;
  averageRating?: number;
  ratingsCount?: number;
  coverUrl?: string;
  remoteCover?: string;
  images?: { url: string }[];
  /** Set when the book is already in Bindery's library. */
  libraryBookId?: number;
  series?: string;
  seriesPosition?: string;
}

export const hitAuthor = (h: BinderyHit) => h.authorName ?? h.author ?? '';
export const hitYear = (h: BinderyHit) =>
  h.year ?? (h.releaseDate ? Number(h.releaseDate.slice(0, 4)) : null);
export const hitCover = (h: BinderyHit) => h.coverUrl ?? h.remoteCover ?? h.images?.[0]?.url ?? null;

export function searchBooks(term: string) {
  return request<BinderyHit[]>(`/api/v1/search/book?term=${encodeURIComponent(term.trim())}`);
}

/** Cover images go through Bindery's cached proxy, which takes the key as a query parameter on GET. */
export async function coverSource(remoteUrl: string) {
  await ensureBinderyLoaded();
  const url = binderyStore.get().url;
  const key = await SecureStore.getItemAsync(SECRET_KEY);
  if (!url || !key) return null;
  return { uri: `${url}/api/v1/images?url=${encodeURIComponent(remoteUrl)}`, headers: { 'X-Api-Key': key } };
}

export type GetBookOutcome =
  | { status: 'added'; bookId?: number }
  | { status: 'requested'; requestId?: number }
  | { status: 'exists'; bookId?: number };

/**
 * Ask Bindery for a book. With an admin key the book is added and searched right away; with a requester
 * key Bindery answers 403 and the book is filed as a request for an admin to approve.
 */
export async function getBook(hit: BinderyHit): Promise<GetBookOutcome> {
  try {
    const added = await request<{ id?: number }>('/api/v1/author/book', {
      method: 'POST',
      body: JSON.stringify({ foreignBookId: hit.foreignBookId, monitored: true, searchOnAdd: true }),
    });
    return { status: 'added', bookId: added?.id };
  } catch (e) {
    if (!(e instanceof BinderyError)) throw e;
    if (e.status === 409) return { status: 'exists', bookId: e.body?.existingBookId as number | undefined };
    if (e.status !== 403) throw e;
  }
  try {
    const req = await request<{ id?: number }>('/api/v1/requests', {
      method: 'POST',
      body: JSON.stringify({ kind: 'book', foreignId: hit.foreignBookId, mediaType: 'ebook' }),
    });
    return { status: 'requested', requestId: req?.id };
  } catch (e) {
    if (e instanceof BinderyError && e.status === 409) return { status: 'exists' };
    throw e;
  }
}

export interface BinderyRequest {
  id: number;
  kind: 'book' | 'author';
  title: string;
  authorName?: string;
  status: 'pending' | 'approved' | 'declined';
  declineReason?: string;
  fulfilled?: boolean;
  createdAt: string;
}

export async function listRequests(limit = 20) {
  const res = await request<BinderyRequest[] | { items: BinderyRequest[] }>(
    `/api/v1/requests?limit=${limit}`,
  );
  return Array.isArray(res) ? res : (res?.items ?? []);
}

export interface BinderyWanted {
  id: number;
  title: string;
  authorName?: string;
  status?: string;
  monitored?: boolean;
}

/** Books Bindery is still hunting for (admin keys only; requesters get a 403 which we swallow). */
export async function listWanted(limit = 20): Promise<BinderyWanted[]> {
  try {
    const res = await request<{ items: BinderyWanted[] } | BinderyWanted[]>(
      `/api/v1/wanted/missing?limit=${limit}&offset=0`,
    );
    return Array.isArray(res) ? res : (res?.items ?? []);
  } catch (e) {
    if (e instanceof BinderyError && e.status === 403) return [];
    throw e;
  }
}

/** Validates an address and key before saving them. */
export async function testBindery(url: string, key: string) {
  const creds = { url: normalizeServerUrl(url), key: key.trim() };
  await request<{ authenticated?: boolean }>('/api/v1/auth/status', {}, creds);
  // /auth/status is public; a search with no results proves the key is accepted.
  await request<unknown>('/api/v1/search/library?q=arcanum&limit=1', {}, creds);
}
