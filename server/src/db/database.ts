import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { type Migration, migrations as allMigrations } from './migrations';

export type Database = DatabaseSync;

export const DATABASE_FILE = 'etagere.sqlite';

/** Lower-cases and strips accents: `fold('Éléphant')` → `'elephant'`. Also an SQL function. */
export const fold = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Opens (and creates when needed) the database, then applies pending migrations.
 * Pass `':memory:'` for tests. Registers the SQL function `fold(text)` for case and
 * accent insensitive search: `WHERE fold(title) LIKE '%' || fold(?) || '%'`.
 */
export function openDatabase(
  location: string,
  options: { now?: () => Date; migrations?: readonly Migration[] } = {},
): Database {
  if (location !== ':memory:') mkdirSync(dirname(location), { recursive: true });
  const db = new DatabaseSync(location);
  db.exec('PRAGMA foreign_keys = ON');
  if (location !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.function('fold', { deterministic: true }, (value) =>
    typeof value === 'string' ? fold(value) : value,
  );
  try {
    runMigrations(db, options.migrations ?? allMigrations, options.now ?? (() => new Date()));
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

/** Runs `fn` in a transaction: committed when it returns, rolled back when it throws. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Applies, in order and each in its own transaction, the migrations not yet recorded. */
export function runMigrations(
  db: Database,
  migrations: readonly Migration[],
  now: () => Date,
): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => Number(row.version)),
  );
  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((migration) => !applied.has(migration.version));
  for (const migration of pending) {
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        now().toISOString(),
      );
    });
  }
  return pending.map((migration) => migration.version);
}

/** Parses a JSON array column (authors, genres). */
export const parseStringArray = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
};

/**
 * True for a SQLite UNIQUE constraint violation (duck-typed: `node:sqlite` errors may come from
 * another realm under Jest, where `instanceof Error` is false).
 */
export const isUniqueViolation = (error: unknown): boolean => {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /UNIQUE constraint failed/i.test(message);
};
