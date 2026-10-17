import type { Position } from '../sync';
import type {
  Annotation,
  AppBookDetail,
  AppBookSummary,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
} from '../types';

export type ProviderKind = 'grimmory' | 'booklore' | 'folder';

/** What a backend can do. Screens hide controls for anything a provider lacks. */
export interface ProviderCapabilities {
  /** Reading position round-trips to the server. */
  progress: boolean;
  /** Highlights and notes round-trip to the server. */
  annotations: boolean;
  /** Read status (reading, finished…) can be set on the server. */
  status: boolean;
}

export interface AnnotationProvider {
  list(bookId: number): Promise<Annotation[]>;
  create(input: CreateAnnotationRequest): Promise<Annotation>;
  update(id: number, patch: UpdateAnnotationRequest): Promise<Annotation>;
  remove(id: number): Promise<void>;
}

/**
 * A source of books. Everything the app knows about a library goes through one of these, so adding a
 * backend means implementing this and nothing else: the SQLite cache, the reader, the home shelves and
 * Surprise Me never see the difference.
 *
 * Ids are provider-scoped numbers for now; the cache stores one provider at a time.
 */
export interface LibraryProvider {
  readonly kind: ProviderKind;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;

  /** One page of the catalog, in a stable order. */
  listBooks(page: number, size: number): Promise<{ items: AppBookSummary[]; hasNext: boolean }>;
  bookDetail(bookId: number): Promise<AppBookDetail>;

  /**
   * Image source for a cover. Synchronous because it is called in render; implementations read whatever
   * credentials they need from their own store. Returns null when nothing can be shown.
   */
  coverSource(
    book: Pick<AppBookSummary, 'id' | 'coverUpdatedOn'>,
  ): { uri: string; headers?: Record<string, string> } | null;

  /** Where to fetch the book file from, with any auth headers. */
  downloadSource(
    bookId: number,
    bookType?: string,
  ): Promise<{ url: string; headers?: Record<string, string> }>;

  updateProgress(bookId: number, fileId: number | null, pos: Position): Promise<void>;
  updateStatus?(bookId: number, status: string): Promise<void>;
  annotations?: AnnotationProvider;
}
