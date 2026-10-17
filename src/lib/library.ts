import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { isOfflineError } from './api';
import { getProvider } from './provider';
import { deleteBooksNotIn, getBooks, kvGet, kvSet, upsertBooks, type LibrarySort } from './db';
import type { AppBookSummary } from './types';

const PAGE = 200;

/** Pull the whole catalog into SQLite. Safe to call often; it replaces the cache atomically per page. */
export async function syncLibrary(): Promise<{ count: number }> {
  const ids: number[] = [];
  let page = 0;
  for (;;) {
    const res = await getProvider().listBooks(page, PAGE);
    await upsertBooks(res.items);
    ids.push(...res.items.map((b) => b.id));
    if (!res.hasNext) break;
    page += 1;
  }
  await deleteBooksNotIn(ids);
  await kvSet('librarySyncedAt', Date.now());
  return { count: ids.length };
}

export function useLibrary(opts: { search?: string; sort: LibrarySort }) {
  return useQuery({
    queryKey: ['library', opts.sort, opts.search ?? ''],
    queryFn: () => getBooks(opts),
    placeholderData: (prev) => prev,
  });
}

export function useLibrarySync() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncLibrary();
    } catch (e) {
      setError(isOfflineError(e) ? 'Offline. Showing your cached library.' : (e as Error).message);
    } finally {
      setSyncing(false);
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    }
  }, [qc]);
  return { sync, syncing, error };
}

export async function lastSyncedAt() {
  return kvGet<number>('librarySyncedAt');
}

export const authorsLine = (b: Pick<AppBookSummary, 'authors'>) => (b.authors ?? []).join(', ');
