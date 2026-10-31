import { type Database, isUniqueViolation } from './database';

// Repository of the `loans` table.
// The partial unique index `loans_one_open_per_book` allows one open loan per book.

export interface LoanRow {
  id: string;
  book_id: string;
  borrower: string;
  lent_by: string;
  lent_at: string;
  returned_at: string | null;
}

/** The open loan of a book, if any. */
export function findOpenLoan(db: Database, bookId: string): LoanRow | undefined {
  return db.prepare('SELECT * FROM loans WHERE book_id = ? AND returned_at IS NULL').get(bookId) as
    LoanRow | undefined;
}

/**
 * Opens a loan. Returns false when the book already has an open loan; the partial unique index
 * decides, even under a race.
 */
export function openLoan(
  db: Database,
  loan: { id: string; bookId: string; borrower: string; lentBy: string; at: string },
): boolean {
  try {
    db.prepare(
      `INSERT INTO loans (id, book_id, borrower, lent_by, lent_at, returned_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(loan.id, loan.bookId, loan.borrower, loan.lentBy, loan.at);
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export function closeLoan(db: Database, id: string, at: string): void {
  db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?').run(at, id);
}
