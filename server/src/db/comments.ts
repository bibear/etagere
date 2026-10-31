// Repository of the `comments` table. Extended by the Comments API (#11).

export interface CommentRow {
  id: string;
  book_id: string;
  profile_id: string;
  text: string;
  created_at: string;
  updated_at: string;
}
