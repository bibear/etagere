import type { ReadingState } from '@etagere/shared';

// Repository of the `readings` table. Extended by the Readings API (#10).
// The partial unique index `readings_one_current_per_book` is the reading lock: inserting a
// second row with state 'reading' for a book throws a SQLITE_CONSTRAINT error.

export interface ReadingRow {
  id: string;
  book_id: string;
  profile_id: string;
  started_at: string | null;
  finished_at: string | null;
  state: ReadingState;
}
