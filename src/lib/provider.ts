import { folderProvider, isFolderBook } from './library-folder';
import { bookloreProvider } from './providers/booklore';
import { grimmoryProvider } from './providers/grimmory';
import { sessionStore } from './session';
import type { LibraryProvider } from './providers/types';

export type {
  AnnotationProvider,
  LibraryProvider,
  ProviderCapabilities,
  ProviderKind,
} from './providers/types';

/**
 * The library the app is signed in to. The kind is detected at sign-in (see `login` in session.ts) and
 * stored with the session; sessions from before detection existed default to Grimmory.
 */
export function getProvider(bookId?: number): LibraryProvider {
  if (bookId != null && isFolderBook(bookId)) return folderProvider;
  const kind = sessionStore.get().session?.kind ?? 'grimmory';
  return kind === 'booklore' ? bookloreProvider : grimmoryProvider;
}
