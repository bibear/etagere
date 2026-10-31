import type {
  Availability,
  BookDetail,
  BookInputParsed,
  BookPatchParsed,
  BookSource,
  BookSummary,
  ProfileRef,
} from '@etagere/shared';

import { type Database, parseStringArray } from './database';

// Repository of the `books` table.
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
  source: BookSource;
  added_by: string;
  added_at: string;
  updated_at: string;
}

/** A book row joined with its availability and whether the viewer finished it. */
interface SummaryRow extends BookRow {
  reader_id: string | null;
  reader_name: string | null;
  reader_color: string | null;
  borrower: string | null;
  lent_at: string | null;
  read_by_me: number;
}

export function countBooks(db: Database): number {
  const row = db.prepare('SELECT count(*) AS n FROM books').get();
  return Number(row?.n ?? 0);
}

export const coverUrlOf = (cover: string | null): string | null =>
  cover === null ? null : `/api/covers/${cover}`;

const SUMMARY_SELECT = `
  SELECT b.*,
    r.profile_id AS reader_id, rp.name AS reader_name, rp.color AS reader_color,
    l.borrower AS borrower, l.lent_at AS lent_at,
    EXISTS (SELECT 1 FROM readings f
            WHERE f.book_id = b.id AND f.profile_id = :me AND f.state = 'finished') AS read_by_me
  FROM books b
  LEFT JOIN readings r ON r.book_id = b.id AND r.state = 'reading'
  LEFT JOIN profiles rp ON rp.id = r.profile_id
  LEFT JOIN loans l ON l.book_id = b.id AND l.returned_at IS NULL`;

const availabilityOf = (row: SummaryRow): Availability => {
  if (row.reader_id !== null) {
    return {
      state: 'reading',
      by: { id: row.reader_id, name: row.reader_name ?? '', color: row.reader_color ?? '' },
    };
  }
  if (row.borrower !== null) {
    return { state: 'lent', borrower: row.borrower, since: row.lent_at ?? '' };
  }
  return { state: 'available' };
};

const toSummary = (row: SummaryRow): BookSummary => ({
  id: row.id,
  isbn13: row.isbn13,
  title: row.title,
  authors: parseStringArray(row.authors),
  coverUrl: coverUrlOf(row.cover),
  addedAt: row.added_at,
  availability: availabilityOf(row),
  readByMe: row.read_by_me === 1,
});

/**
 * Book summaries seen by the profile `meId` (null: nobody, `readByMe` false).
 * `where` is an SQL condition on the alias `b`, with named parameters.
 */
export function selectSummaries(
  db: Database,
  meId: string | null,
  where = '1 = 1',
  params: Record<string, string | number | null> = {},
): BookSummary[] {
  const rows = db
    .prepare(`${SUMMARY_SELECT} WHERE ${where}`)
    .all({ ...params, me: meId }) as unknown as SummaryRow[];
  return rows.map(toSummary);
}

export function findSummary(db: Database, id: string, meId: string | null): BookSummary | null {
  return selectSummaries(db, meId, 'b.id = :id', { id })[0] ?? null;
}

/**
 * Books whose title, authors or ISBN contain `query` (case and accent insensitive, D-18).
 * An empty query matches everything.
 */
export function searchSummaries(db: Database, query: string, meId: string | null): BookSummary[] {
  if (query === '') return selectSummaries(db, meId);
  const isbn = query.replace(/[\s-]/g, '');
  return selectSummaries(
    db,
    meId,
    `(instr(fold(b.title), fold(:q)) > 0 OR instr(fold(b.authors), fold(:q)) > 0
      OR (:isbn <> '' AND instr(coalesce(b.isbn13, ''), :isbn) > 0))`,
    { q: query, isbn: /^\d+$/.test(isbn) ? isbn : '' },
  );
}

export function findBookRow(db: Database, id: string): BookRow | undefined {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined;
}

export function findBookIdByIsbn(db: Database, isbn13: string): string | undefined {
  const row = db.prepare('SELECT id FROM books WHERE isbn13 = ?').get(isbn13);
  return row ? String(row.id) : undefined;
}

const profileRefs = (rows: unknown[]): ProfileRef[] =>
  (rows as { id: string; name: string; color: string }[]).map(({ id, name, color }) => ({
    id,
    name,
    color,
  }));

/** The full book as seen by `meId`, or null when it does not exist. */
export function findDetail(db: Database, id: string, meId: string | null): BookDetail | null {
  const summary = findSummary(db, id, meId);
  const row = findBookRow(db, id);
  if (!summary || !row) return null;
  const addedBy = profileRefs(
    db.prepare('SELECT id, name, color FROM profiles WHERE id = ?').all(row.added_by),
  )[0] ?? { id: row.added_by, name: '', color: '' };
  const readBy = profileRefs(
    db
      .prepare(
        `SELECT p.id, p.name, p.color FROM profiles p
         WHERE p.id IN (SELECT profile_id FROM readings WHERE book_id = ? AND state = 'finished')
         ORDER BY p.created_at, p.name`,
      )
      .all(id),
  );
  const comments = db.prepare('SELECT count(*) AS n FROM comments WHERE book_id = ?').get(id);
  return {
    ...summary,
    genres: parseStringArray(row.genres),
    publisher: row.publisher,
    year: row.year,
    pages: row.pages,
    description: row.description,
    source: row.source,
    addedBy,
    readBy,
    commentCount: Number(comments?.n ?? 0),
  };
}

export interface NewBook {
  id: string;
  input: BookInputParsed;
  source: BookSource;
  cover: string | null;
  addedBy: string;
  at: string;
}

export function insertBook(db: Database, book: NewBook): void {
  const { input } = book;
  db.prepare(
    `INSERT INTO books (id, isbn13, title, authors, genres, publisher, year, pages, description,
       cover, source, added_by, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    book.id,
    input.isbn13 ?? null,
    input.title,
    JSON.stringify(input.authors),
    JSON.stringify(input.genres ?? []),
    input.publisher ?? null,
    input.year ?? null,
    input.pages ?? null,
    input.description ?? null,
    book.cover,
    book.source,
    book.addedBy,
    book.at,
    book.at,
  );
}

const PATCH_COLUMNS = {
  isbn13: (value: unknown) => value ?? null,
  title: (value: unknown) => value,
  authors: (value: unknown) => JSON.stringify(value),
  genres: (value: unknown) => JSON.stringify(value ?? []),
  publisher: (value: unknown) => value ?? null,
  year: (value: unknown) => value ?? null,
  pages: (value: unknown) => value ?? null,
  description: (value: unknown) => value ?? null,
} as const;

type SqlValue = string | number | null;

/** Applies the present fields of a PATCH; `cover` is set when given (undefined: unchanged). */
export function updateBook(
  db: Database,
  id: string,
  patch: BookPatchParsed,
  at: string,
  cover?: string | null,
): void {
  const sets: string[] = ['updated_at = ?'];
  const values: SqlValue[] = [at];
  for (const [column, encode] of Object.entries(PATCH_COLUMNS)) {
    if (column in patch) {
      sets.push(`${column} = ?`);
      values.push(encode(patch[column as keyof typeof PATCH_COLUMNS]) as SqlValue);
    }
  }
  if (cover !== undefined) {
    sets.push('cover = ?');
    values.push(cover);
  }
  db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
}

/** Deletes the book; readings, loans and comments go with it (ON DELETE CASCADE). */
export function deleteBook(db: Database, id: string): void {
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
}

/** True for a SQLite UNIQUE constraint violation (e.g. a duplicate ISBN inserted concurrently). */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
