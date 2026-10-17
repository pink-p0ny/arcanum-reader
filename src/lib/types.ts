// Types mirrored from Grimmory's REST API (backend/src/main/java/org/booklore/app/dto).

export interface AccessTokenDto {
  accessToken: string;
  refreshToken: string;
  expires?: number;
  isDefaultPassword?: boolean | null;
}

export type ReadStatus =
  | 'UNREAD'
  | 'READING'
  | 'RE_READING'
  | 'READ'
  | 'PARTIALLY_READ'
  | 'PAUSED'
  | 'WONT_READ'
  | 'ABANDONED'
  | 'UNSET';

export interface AppBookSummary {
  id: number;
  /** UI only: other server records of the same title, set by collapseEditions. */
  editions?: { id: number; type: string }[];
  title: string;
  authors?: string[];
  thumbnailUrl?: string;
  readStatus?: ReadStatus;
  personalRating?: number;
  seriesName?: string;
  seriesNumber?: number;
  libraryId?: number;
  addedOn?: string;
  lastReadTime?: string;
  readProgress?: number;
  primaryFileId?: number;
  primaryFileType?: string;
  primaryFileName?: string;
  coverUpdatedOn?: string;
  isPhysical?: boolean;
  publisher?: string;
  categories?: string[];
  tags?: string[];
  language?: string;
  pageCount?: number;
  fileSizeKb?: number;
  goodreadsRating?: number;
  goodreadsReviewCount?: number;
  amazonRating?: number;
  amazonReviewCount?: number;
  hardcoverRating?: number;
  hardcoverReviewCount?: number;
}

export interface AppBookFile {
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
  isPrimary: boolean;
}

export interface EpubProgress {
  cfi?: string;
  href?: string;
  percentage?: number;
  updatedAt?: string;
}

export interface AppShelfSummary {
  id: number;
  name: string;
  icon?: string;
}

export interface AppBookDetail {
  id: number;
  title: string;
  authors?: string[];
  thumbnailUrl?: string;
  readStatus?: ReadStatus;
  personalRating?: number;
  seriesName?: string;
  seriesNumber?: number;
  libraryId?: number;
  addedOn?: string;
  lastReadTime?: string;
  subtitle?: string;
  description?: string;
  categories?: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  isbn13?: string;
  language?: string;
  goodreadsRating?: number;
  goodreadsReviewCount?: number;
  libraryName?: string;
  shelves?: AppShelfSummary[];
  readProgress?: number;
  primaryFileType?: string;
  fileTypes?: string[];
  files?: AppBookFile[];
  coverUpdatedOn?: string;
  isPhysical?: boolean;
  epubProgress?: EpubProgress;
}

export interface AppBookProgressResponse {
  readProgress?: number;
  readStatus?: ReadStatus;
  lastReadTime?: string;
  epubProgress?: EpubProgress;
}

export interface AppPageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AppLibrarySummary {
  id: number;
  name: string;
  icon?: string;
  bookCount: number;
}

export type AnnotationStyle = 'highlight' | 'underline' | 'strikethrough' | 'squiggly';

export interface Annotation {
  id: number;
  userId?: number;
  bookId: number;
  cfi: string;
  text: string;
  color?: string;
  style?: AnnotationStyle;
  note?: string;
  chapterTitle?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAnnotationRequest {
  bookId: number;
  cfi: string;
  text: string;
  color?: string;
  style?: AnnotationStyle;
  note?: string;
  chapterTitle?: string;
}

export interface UpdateAnnotationRequest {
  color?: string;
  style?: AnnotationStyle;
  note?: string;
}

export interface BookFileProgress {
  bookFileId: number;
  positionData?: string;
  positionHref?: string;
  progressPercent: number;
}

export interface UpdateProgressRequest {
  fileProgress?: BookFileProgress;
  epubProgress?: { cfi?: string; href?: string; percentage: number };
  dateFinished?: string;
}
