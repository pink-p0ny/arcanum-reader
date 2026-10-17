import { grimmoryProvider } from './providers/grimmory';
import type { LibraryProvider } from './providers/types';

export type {
  AnnotationProvider,
  LibraryProvider,
  ProviderCapabilities,
  ProviderKind,
} from './providers/types';

/**
 * The library the app is signed in to. Grimmory is the only backend today; when a second one lands this
 * becomes a lookup on the stored account's kind, and the cache gains a provider column.
 */
export function getProvider(): LibraryProvider {
  return grimmoryProvider;
}
