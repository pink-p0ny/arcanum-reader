import { useSyncExternalStore } from 'react';

// A minimal external store: enough for session and settings without another dependency.
export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const identity = <T>(s: T) => s;

/**
 * Subscribe a component to a store. Must be a real `use*` hook (not a method on the store) so the
 * React Compiler recognizes it as a hook and never moves the call inside a memoized branch.
 */
export function useStore<T, S = T>(
  store: Store<T>,
  selector: (s: T) => S = identity as unknown as (s: T) => S,
): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
