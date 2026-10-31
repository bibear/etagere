// Initial schema (docs/ARCHITECTURE.md § Data model).
export const sql = /* sql */ `
CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  color       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  removed_at  TEXT
);

CREATE TABLE books (
  id          TEXT PRIMARY KEY,
  isbn13      TEXT UNIQUE,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  authors     TEXT NOT NULL DEFAULT '[]'
              CHECK (json_valid(authors) AND json_type(authors) = 'array'
                     AND json_array_length(authors) <= 20),
  genres      TEXT NOT NULL DEFAULT '[]'
              CHECK (json_valid(genres) AND json_type(genres) = 'array'),
  publisher   TEXT,
  year        INTEGER,
  pages       INTEGER,
  description TEXT,
  cover       TEXT,
  source      TEXT NOT NULL CHECK (source IN ('lookup', 'manual')),
  added_by    TEXT NOT NULL REFERENCES profiles (id),
  added_at    TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX books_added_at ON books (added_at);

CREATE TABLE readings (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL REFERENCES profiles (id),
  started_at  TEXT,
  finished_at TEXT,
  state       TEXT NOT NULL CHECK (state IN ('reading', 'finished', 'abandoned'))
);
-- The reading lock: at most one current reading per book.
CREATE UNIQUE INDEX readings_one_current_per_book ON readings (book_id) WHERE state = 'reading';
CREATE INDEX readings_profile ON readings (profile_id, state);

CREATE TABLE loans (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  borrower    TEXT NOT NULL CHECK (length(borrower) BETWEEN 1 AND 60),
  lent_by     TEXT NOT NULL REFERENCES profiles (id),
  lent_at     TEXT NOT NULL,
  returned_at TEXT
);
-- At most one open loan per book.
CREATE UNIQUE INDEX loans_one_open_per_book ON loans (book_id) WHERE returned_at IS NULL;

CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL REFERENCES profiles (id),
  text        TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX comments_book ON comments (book_id, created_at);
`;
