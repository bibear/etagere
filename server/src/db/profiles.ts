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
