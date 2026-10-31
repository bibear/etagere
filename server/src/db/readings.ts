import type { ReadingState } from '@etagere/shared';

import { type Database, isUniqueViolation } from './database';

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

/** The current reading of a book (the lock holder), if any. */
export function findCurrentReading(db: Database, bookId: string): ReadingRow | undefined {
  return db
    .prepare("SELECT * FROM readings WHERE book_id = ? AND state = 'reading'")
    .get(bookId) as ReadingRow | undefined;
}

export function hasOpenLoan(db: Database, bookId: string): boolean {
  return (
    db.prepare('SELECT 1 FROM loans WHERE book_id = ? AND returned_at IS NULL').get(bookId) !==
    undefined
  );
}

/**
 * Takes the reading lock: inserts the current reading of `profileId`. Returns false when another
 * reading already holds the book; the partial unique index decides, even under a race.
 */
export function takeReadingLock(
  db: Database,
  reading: { id: string; bookId: string; profileId: string; at: string },
): boolean {
  try {
    db.prepare(
      `INSERT INTO readings (id, book_id, profile_id, started_at, finished_at, state)
       VALUES (?, ?, ?, ?, NULL, 'reading')`,
    ).run(reading.id, reading.bookId, reading.profileId, reading.at);
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export function setReadingState(
  db: Database,
  id: string,
  state: ReadingState,
  finishedAt: string | null,
): void {
  db.prepare('UPDATE readings SET state = ?, finished_at = ? WHERE id = ?').run(
    state,
    finishedAt,
    id,
  );
}

export function hasFinished(db: Database, bookId: string, profileId: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM readings WHERE book_id = ? AND profile_id = ? AND state = 'finished'")
      .get(bookId, profileId) !== undefined
  );
}

export function insertFinishedReading(
  db: Database,
  reading: { id: string; bookId: string; profileId: string; at: string },
): void {
  db.prepare(
    `INSERT INTO readings (id, book_id, profile_id, started_at, finished_at, state)
     VALUES (?, ?, ?, NULL, ?, 'finished')`,
  ).run(reading.id, reading.bookId, reading.profileId, reading.at);
}

export interface MyReadingRow {
  book_id: string;
  started_at: string | null;
  finished_at: string | null;
  comment_count: number;
}

/** The current reading of a profile, the most recently started first. */
export function myCurrentReading(db: Database, profileId: string): MyReadingRow | undefined {
  return db
    .prepare(
      `SELECT r.book_id, r.started_at, r.finished_at,
         (SELECT count(*) FROM comments c WHERE c.book_id = r.book_id) AS comment_count
       FROM readings r WHERE r.profile_id = ? AND r.state = 'reading'
       ORDER BY r.started_at DESC LIMIT 1`,
    )
    .get(profileId) as MyReadingRow | undefined;
}

/** Books a profile finished, once each (latest finish), most recent first. */
export function myFinishedReadings(db: Database, profileId: string): MyReadingRow[] {
  return db
    .prepare(
      `SELECT r.book_id, r.started_at, r.finished_at,
         (SELECT count(*) FROM comments c WHERE c.book_id = r.book_id) AS comment_count
       FROM readings r
       WHERE r.profile_id = :me AND r.state = 'finished'
         AND r.id = (SELECT r2.id FROM readings r2
                     WHERE r2.book_id = r.book_id AND r2.profile_id = :me AND r2.state = 'finished'
                     ORDER BY r2.finished_at DESC, r2.id LIMIT 1)
       ORDER BY r.finished_at DESC`,
    )
    .all({ me: profileId }) as unknown as MyReadingRow[];
}
