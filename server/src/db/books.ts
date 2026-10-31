import type { Database } from './database';

// Repository of the `books` table. Extended by the Books API (#8).
// `authors` and `genres` are JSON arrays: read them with `parseStringArray`.

export interface BookRow {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string;
  genres: string;
  publisher: string | null;
  year: number | null;
  pages: number | null;
  description: string | null;
  cover: string | null;
  source: 'lookup' | 'manual';
  added_by: string;
  added_at: string;
  updated_at: string;
}

export function countBooks(db: Database): number {
  const row = db.prepare('SELECT count(*) AS n FROM books').get();
  return Number(row?.n ?? 0);
}
