// Repository of the `loans` table. Extended by the Loans API (#20).
// The partial unique index `loans_one_open_per_book` allows one open loan per book.

export interface LoanRow {
  id: string;
  book_id: string;
  borrower: string;
  lent_by: string;
  lent_at: string;
  returned_at: string | null;
}
