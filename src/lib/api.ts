import { ApiError, getFreshSession, refreshSession } from './session';
import type {
  Annotation,
  AppBookDetail,
  AppBookProgressResponse,
  AppBookSummary,
  AppLibrarySummary,
  AppPageResponse,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  UpdateProgressRequest,
} from './types';

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
      const body = await res.json();
      message = body?.message ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const q = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

export const api = {
  books: {
    list: (params: {
      page: number;
      size: number;
      sort?: string;
      dir?: 'asc' | 'desc';
      search?: string;
      libraryId?: number;
    }) => request<AppPageResponse<AppBookSummary>>(`/api/v1/app/books?${q(params)}`),
    detail: (bookId: number) => request<AppBookDetail>(`/api/v1/app/books/${bookId}`),
    progress: (bookId: number) => request<AppBookProgressResponse>(`/api/v1/app/books/${bookId}/progress`),
    updateProgress: (bookId: number, body: UpdateProgressRequest) =>
      request<void>(`/api/v1/app/books/${bookId}/progress`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    continueReading: (limit = 10) =>
      request<AppBookSummary[]>(`/api/v1/app/books/continue-reading?limit=${limit}`),
    updateStatus: (bookId: number, status: string) =>
      request<void>(`/api/v1/app/books/${bookId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
  },
  libraries: {
    list: () => request<AppLibrarySummary[]>('/api/v1/app/libraries'),
  },
  annotations: {
    forBook: (bookId: number) => request<Annotation[]>(`/api/v1/annotations/book/${bookId}`),
    create: (body: CreateAnnotationRequest) =>
      request<Annotation>('/api/v1/annotations', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: number, body: UpdateAnnotationRequest) =>
      request<Annotation>(`/api/v1/annotations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    remove: (id: number) => request<void>(`/api/v1/annotations/${id}`, { method: 'DELETE' }),
  },
};

/** URL + headers for an authenticated image (covers). */
export function coverSource(serverUrl: string, accessToken: string, bookId: number, updatedOn?: string) {
  const bust = updatedOn ? `?v=${encodeURIComponent(updatedOn)}` : '';
  return {
    uri: `${serverUrl}/api/v1/media/book/${bookId}/thumbnail${bust}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

export function isOfflineError(err: unknown) {
  return err instanceof TypeError || (err instanceof Error && /network/i.test(err.message));
}
