// Shapes of the HTTP API contract (docs/ARCHITECTURE.md). Dates are ISO 8601 UTC strings.

export type Uuid = string;
export type IsoDate = string;

export interface Profile {
  id: Uuid;
  name: string;
  color: string;
  createdAt: IsoDate;
}

/** A profile as embedded in other resources. */
export interface ProfileRef {
  id: Uuid;
  name: string;
  color: string;
}

export type Availability =
  | { state: 'available' }
  | { state: 'reading'; by: ProfileRef }
  | { state: 'lent'; borrower: string; since: IsoDate };

export type AvailabilityState = Availability['state'];

export interface BookInput {
  isbn13?: string | null;
  title: string;
  authors: string[];
  genres?: string[];
  publisher?: string | null;
  year?: number | null;
  pages?: number | null;
  description?: string | null;
  /** https://covers.openlibrary.org only; downloaded by the server at creation. */
  coverSourceUrl?: string | null;
}

export type BookCandidate = BookInput & { isbn13: string; coverSourceUrl: string | null };

export type BookSource = 'lookup' | 'manual';

export interface BookSummary {
  id: Uuid;
  isbn13: string | null;
  title: string;
  authors: string[];
  /** Server-relative (`/api/covers/<id>.jpg`) or null (the app draws a generated cover). */
  coverUrl: string | null;
  addedAt: IsoDate;
  availability: Availability;
  readByMe: boolean;
}

export interface BookDetail extends BookSummary {
  genres: string[];
  publisher: string | null;
  year: number | null;
  pages: number | null;
  description: string | null;
  source: BookSource;
  addedBy: ProfileRef;
  readBy: ProfileRef[];
  commentCount: number;
}

export const BOOK_FILTERS = ['all', 'available', 'reading', 'lent', 'unread_by_me'] as const;
export type BookFilter = (typeof BOOK_FILTERS)[number];

export const BOOK_SORTS = ['added', 'title', 'author'] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export interface BookCounts {
  all: number;
  available: number;
  reading: number;
  lent: number;
  unreadByMe: number;
}

export interface BooksResponse {
  books: BookSummary[];
  counts: BookCounts;
}

export type ReadingState = 'reading' | 'finished' | 'abandoned';

export interface ReadingItem {
  book: BookSummary;
  startedAt: IsoDate | null;
  finishedAt: IsoDate | null;
  commentCount: number;
}

export interface MyReadingsResponse {
  current: ReadingItem | null;
  finished: ReadingItem[];
  stats: { finishedCount: number };
}

export interface Comment {
  id: Uuid;
  bookId: Uuid;
  author: ProfileRef;
  text: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface Reason {
  kind: 'author' | 'genre' | 'household';
  /** The shared author or genre, or the name of the member whose review counts (household). */
  ref: string;
  /** author / genre on the shelf: up to 2 titles I finished that share it ("because you read …"). */
  because?: string[];
}

export interface Reco {
  book: BookSummary;
  reasons: Reason[];
  quote: { author: { name: string; color: string }; text: string } | null;
}

export interface BuyIdea {
  title: string;
  authors: string[];
  isbn13: string | null;
  coverSourceUrl: string | null;
  reason: Reason;
}

export interface RecommendationsResponse {
  featured: Reco | null;
  onShelf: Reco[];
  toBuy: BuyIdea[];
  toBuyError?: 'upstream_unavailable';
}

export interface HealthResponse {
  status: 'ok';
  name: string;
  version: string;
  householdName: string;
}

export interface ServerInfo {
  version: string;
  bookCount: number;
  profileCount: number;
  urls: string[];
}

export type ServerEvent = {
  type: 'books.changed' | 'profiles.changed' | 'comments.changed';
  id?: Uuid;
};

export const ERROR_CODES = [
  'invalid_input',
  'invalid_isbn',
  'not_found',
  'already_in_library',
  'upstream_unavailable',
  'unknown_profile',
  'profile_mismatch',
  'outside_lan',
  'unavailable',
  'not_reader',
  'not_author',
  'internal_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode | (string & {});
  [detail: string]: unknown;
}

/** Header carrying the current profile id on every request. */
export const PROFILE_HEADER = 'x-etagere-profile';
