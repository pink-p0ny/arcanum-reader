import { kvGet, kvSet } from './db';
import { DEFAULT_HIDDEN_GENRES, toggleGenre } from './genres-core';
import { createStore } from './store';

export { DEFAULT_HIDDEN_GENRES, pruneGenres } from './genres-core';

const KEY = 'hiddenGenres';

/** Genres left out of Browse by Genre, the taste shelves and Surprise Me. Persisted in kv. */
export const hiddenGenresStore = createStore<string[]>(DEFAULT_HIDDEN_GENRES);

let loaded: Promise<void> | null = null;
export function ensureHiddenGenresLoaded() {
  loaded ??= kvGet<string[]>(KEY).then((saved) => {
    if (saved) hiddenGenresStore.set(saved);
  });
  return loaded;
}

export async function setHiddenGenres(list: string[]) {
  hiddenGenresStore.set(list);
  await kvSet(KEY, list);
}

export const toggleHiddenGenre = (name: string) =>
  setHiddenGenres(toggleGenre(hiddenGenresStore.get(), name));
