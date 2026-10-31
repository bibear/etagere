import { selectSummaries } from './books';
import { type Database, parseStringArray } from './database';
import type { HouseholdComment, ShelfBook } from '../recommendations';

// Read-only queries feeding the recommendations (no table of their own).

/** Every book of the house as seen by `meId`, with its genres. */
export function shelfBooks(db: Database, meId: string): ShelfBook[] {
  const genres = new Map(
    (
      db.prepare('SELECT id, genres FROM books').all() as unknown as {
        id: string;
        genres: string;
      }[]
    ).map((row) => [row.id, parseStringArray(row.genres)]),
  );
  return selectSummaries(db, meId).map((summary) => ({
    summary,
    genres: genres.get(summary.id) ?? [],
  }));
}

/** Every comment with its author (removed members keep their name), newest first. */
export function householdComments(db: Database): HouseholdComment[] {
  const rows = db
    .prepare(
      `SELECT c.book_id, c.profile_id, c.text, c.created_at, p.name, p.color
       FROM comments c JOIN profiles p ON p.id = c.profile_id
       ORDER BY c.created_at DESC, c.rowid DESC`,
    )
    .all() as unknown as {
    book_id: string;
    profile_id: string;
    text: string;
    created_at: string;
    name: string;
    color: string;
  }[];
  return rows.map((row) => ({
    bookId: row.book_id,
    profileId: row.profile_id,
    author: { name: row.name, color: row.color },
    text: row.text,
    createdAt: row.created_at,
  }));
}
