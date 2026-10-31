import type { Profile, ProfileRef } from '@etagere/shared';

import type { Database } from './database';

// Repository of the `profiles` table. Extended by the Profiles API (#7).

export interface ProfileRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
}

export const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name,
  color: row.color,
  createdAt: row.created_at,
});

export const toProfileRef = (row: Pick<ProfileRow, 'id' | 'name' | 'color'>): ProfileRef => ({
  id: row.id,
  name: row.name,
  color: row.color,
});

/** A profile that exists and is not removed, or undefined. */
export function findActiveProfile(db: Database, id: string): ProfileRow | undefined {
  return db.prepare('SELECT * FROM profiles WHERE id = ? AND removed_at IS NULL').get(id) as
    ProfileRow | undefined;
}

export function countActiveProfiles(db: Database): number {
  const row = db.prepare('SELECT count(*) AS n FROM profiles WHERE removed_at IS NULL').get();
  return Number(row?.n ?? 0);
}

/** Active profiles, oldest first (the household order). */
export function listActiveProfiles(db: Database): ProfileRow[] {
  return db
    .prepare('SELECT * FROM profiles WHERE removed_at IS NULL ORDER BY created_at, name')
    .all() as unknown as ProfileRow[];
}

/** Any profile, removed or not. */
export function findProfile(db: Database, id: string): ProfileRow | undefined {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
}

/**
 * Creates the profile, or updates its name and color. A removed profile written again is
 * restored (same device coming back).
 */
export function upsertProfile(
  db: Database,
  input: { id: string; name: string; color: string },
  at: string,
): ProfileRow {
  db.prepare(
    `INSERT INTO profiles (id, name, color, created_at, updated_at, removed_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, color = excluded.color,
       updated_at = excluded.updated_at, removed_at = NULL`,
  ).run(input.id, input.name, input.color, at, at);
  return findProfile(db, input.id) as ProfileRow;
}

/** Soft delete: the history keeps the name and color. */
export function removeProfile(db: Database, id: string, at: string): void {
  db.prepare('UPDATE profiles SET removed_at = ?, updated_at = ? WHERE id = ?').run(at, at, id);
}
