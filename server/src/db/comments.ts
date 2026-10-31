import type { Comment } from '@etagere/shared';

import type { Database } from './database';

// Repository of the `comments` table.

export interface CommentRow {
  id: string;
  book_id: string;
  profile_id: string;
  text: string;
  created_at: string;
  updated_at: string;
}

interface CommentWithAuthor extends CommentRow {
  author_name: string;
  author_color: string;
}

const SELECT = `
  SELECT c.*, p.name AS author_name, p.color AS author_color
  FROM comments c JOIN profiles p ON p.id = c.profile_id`;

const toComment = (row: CommentWithAuthor): Comment => ({
  id: row.id,
  bookId: row.book_id,
  author: { id: row.profile_id, name: row.author_name, color: row.author_color },
  text: row.text,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Comments of a book, newest first (removed members keep their name). */
export function listComments(db: Database, bookId: string): Comment[] {
  const rows = db
    .prepare(`${SELECT} WHERE c.book_id = ? ORDER BY c.created_at DESC, c.rowid DESC`)
    .all(bookId) as unknown as CommentWithAuthor[];
  return rows.map(toComment);
}

export function findComment(db: Database, id: string): Comment | null {
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as CommentWithAuthor | undefined;
  return row ? toComment(row) : null;
}

export function insertComment(
  db: Database,
  comment: { id: string; bookId: string; profileId: string; text: string; at: string },
): void {
  db.prepare(
    `INSERT INTO comments (id, book_id, profile_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(comment.id, comment.bookId, comment.profileId, comment.text, comment.at, comment.at);
}

export function updateCommentText(db: Database, id: string, text: string, at: string): void {
  db.prepare('UPDATE comments SET text = ?, updated_at = ? WHERE id = ?').run(text, at, id);
}

export function deleteComment(db: Database, id: string): void {
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
}
