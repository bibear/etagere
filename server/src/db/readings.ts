import type { ReadingState } from '@etagere/shared';

import type { Database } from './database';

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

/** Puts down (state `abandoned`) every current reading of a profile; returns the freed book ids. */
export function putDownReadingsOf(db: Database, profileId: string): string[] {
  const rows = db
    .prepare("SELECT book_id FROM readings WHERE profile_id = ? AND state = 'reading'")
    .all(profileId) as unknown as { book_id: string }[];
  db.prepare(
    "UPDATE readings SET state = 'abandoned' WHERE profile_id = ? AND state = 'reading'",
  ).run(profileId);
  return rows.map((row) => row.book_id);
}
