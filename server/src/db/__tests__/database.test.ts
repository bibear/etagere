import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Database, fold, openDatabase, parseStringArray, transaction } from '../database';
import { migrations } from '../migrations';
import { countBooks } from '../books';
import { countActiveProfiles, findActiveProfile } from '../profiles';

const T = '2026-10-31T10:00:00.000Z';
const now = () => new Date(T);

const insertProfile = (db: Database, id: string, removedAt: string | null = null) =>
  db
    .prepare('INSERT INTO profiles VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, `name-${id}`, '#1F6B4A', T, T, removedAt);

const insertBook = (db: Database, id: string, isbn13: string | null = null) =>
  db
    .prepare(
      `INSERT INTO books (id, isbn13, title, authors, source, added_by, added_at, updated_at)
       VALUES (?, ?, ?, '["A"]', 'manual', 'p1', ?, ?)`,
    )
    .run(id, isbn13, `Title ${id}`, T, T);

const insertReading = (db: Database, id: string, bookId: string, state: string) =>
  db.prepare(`INSERT INTO readings VALUES (?, ?, 'p1', ?, NULL, ?)`).run(id, bookId, T, state);

describe('openDatabase (in memory)', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:', { now });
    insertProfile(db, 'p1');
  });

  afterEach(() => db.close());

  it('records every migration', () => {
    const rows = db.prepare('SELECT version, name, applied_at FROM schema_migrations').all();
    expect(rows).toEqual(
      migrations.map((m) => ({ version: m.version, name: m.name, applied_at: T })),
    );
  });

  it('creates the five tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(['books', 'comments', 'loans', 'profiles', 'readings']),
    );
  });

  it('allows a single current reading per book (the lock)', () => {
    insertBook(db, 'b1');
    insertReading(db, 'r1', 'b1', 'reading');
    expect(() => insertReading(db, 'r2', 'b1', 'reading')).toThrow(/UNIQUE/);
  });

  it('allows any number of finished or abandoned readings next to the current one', () => {
    insertBook(db, 'b1');
    insertReading(db, 'r1', 'b1', 'reading');
    insertReading(db, 'r2', 'b1', 'finished');
    insertReading(db, 'r3', 'b1', 'abandoned');
    insertReading(db, 'r4', 'b1', 'finished');
    expect(db.prepare('SELECT count(*) AS n FROM readings').get()?.n).toBe(4);
  });

  it('allows a single open loan per book, and a new one once returned', () => {
    insertBook(db, 'b1');
    const lend = db.prepare(`INSERT INTO loans VALUES (?, 'b1', 'Marie', 'p1', ?, ?)`);
    lend.run('l1', T, null);
    expect(() => lend.run('l2', T, null)).toThrow(/UNIQUE/);
    db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?').run(T, 'l1');
    expect(() => lend.run('l3', T, null)).not.toThrow();
  });

  it('rejects a duplicate ISBN but accepts several books without ISBN', () => {
    insertBook(db, 'b1', '9782070612758');
    expect(() => insertBook(db, 'b2', '9782070612758')).toThrow(/UNIQUE/);
    insertBook(db, 'b3');
    insertBook(db, 'b4');
    expect(countBooks(db)).toBe(3);
  });

  it('deletes readings, loans and comments with their book', () => {
    insertBook(db, 'b1');
    insertReading(db, 'r1', 'b1', 'reading');
    db.prepare(`INSERT INTO loans VALUES ('l1', 'b1', 'Marie', 'p1', ?, ?)`).run(T, T);
    db.prepare(`INSERT INTO comments VALUES ('c1', 'b1', 'p1', 'Great', ?, ?)`).run(T, T);
    db.prepare('DELETE FROM books WHERE id = ?').run('b1');
    for (const table of ['readings', 'loans', 'comments']) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
    }
  });

  it('enforces foreign keys', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO books (id, title, source, added_by, added_at, updated_at)
           VALUES ('b1', 'T', 'manual', 'ghost', ?, ?)`,
        )
        .run(T, T),
    ).toThrow(/FOREIGN KEY/);
  });

  it.each([
    [
      'empty title',
      `INSERT INTO books (id, title, source, added_by, added_at, updated_at) VALUES ('b', '', 'manual', 'p1', '${T}', '${T}')`,
    ],
    [
      'bad source',
      `INSERT INTO books (id, title, source, added_by, added_at, updated_at) VALUES ('b', 'T', 'web', 'p1', '${T}', '${T}')`,
    ],
    [
      'authors not an array',
      `INSERT INTO books (id, title, authors, source, added_by, added_at, updated_at) VALUES ('b', 'T', '"A"', 'manual', 'p1', '${T}', '${T}')`,
    ],
    ['bad reading state', `INSERT INTO readings VALUES ('r', 'x', 'p1', NULL, NULL, 'paused')`],
    [
      'name too long',
      `INSERT INTO profiles VALUES ('p2', '${'a'.repeat(41)}', '#000000', '${T}', '${T}', NULL)`,
    ],
    ['empty comment', `INSERT INTO comments VALUES ('c', 'x', 'p1', '', '${T}', '${T}')`],
  ])('rejects %s', (_label, sql) => {
    expect(() => db.exec(sql)).toThrow(/constraint/i);
  });

  it('provides a fold() SQL function for case and accent insensitive search', () => {
    db.prepare(
      `INSERT INTO books (id, title, source, added_by, added_at, updated_at)
       VALUES ('b1', 'L’Étranger', 'manual', 'p1', ?, ?)`,
    ).run(T, T);
    const row = db
      .prepare("SELECT id FROM books WHERE fold(title) LIKE '%' || fold(?) || '%'")
      .get('ETRANG');
    expect(row?.id).toBe('b1');
  });

  it('counts and finds active profiles only', () => {
    insertProfile(db, 'p2', T);
    expect(countActiveProfiles(db)).toBe(1);
    expect(findActiveProfile(db, 'p1')?.name).toBe('name-p1');
    expect(findActiveProfile(db, 'p2')).toBeUndefined();
  });
});

describe('transaction', () => {
  it('rolls back when the callback throws', () => {
    const db = openDatabase(':memory:', { now });
    expect(() =>
      transaction(db, () => {
        insertProfile(db, 'p1');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(countActiveProfiles(db)).toBe(0);
    db.close();
  });
});

describe('migrations on a database file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'etagere-db-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates the data directory and keeps data across restarts without re-applying', () => {
    const file = join(dir, 'nested', 'etagere.sqlite');
    const first = openDatabase(file, { now });
    insertProfile(first, 'p1');
    first.close();

    const second = openDatabase(file, { now: () => new Date('2030-01-01T00:00:00Z') });
    expect(countActiveProfiles(second)).toBe(1);
    const applied = second.prepare('SELECT applied_at FROM schema_migrations').all();
    expect(applied).toEqual([{ applied_at: T }]);
    second.close();
  });

  it('applies only the new migrations at restart', () => {
    const file = join(dir, 'etagere.sqlite');
    openDatabase(file, { now }).close();
    const extra = [...migrations, { version: 2, name: 'extra', sql: 'CREATE TABLE extra (x)' }];
    const db = openDatabase(file, { now, migrations: extra });
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    db.close();
  });

  it('leaves the database untouched when a migration fails', () => {
    const file = join(dir, 'etagere.sqlite');
    const broken = [...migrations, { version: 2, name: 'broken', sql: 'CREATE TABLE t (x); NOPE' }];
    expect(() => openDatabase(file, { now, migrations: broken })).toThrow();
    const db = openDatabase(file, { now });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name = 't'").all();
    expect(tables).toEqual([]);
    db.close();
  });
});

describe('helpers', () => {
  it('fold lower-cases and strips accents', () => {
    expect(fold('Éléphant Ça')).toBe('elephant ca');
  });

  it.each([
    ['["a","b"]', ['a', 'b']],
    ['[1,"b"]', ['b']],
    ['{}', []],
    [null, []],
  ])('parseStringArray(%j)', (input, expected) => {
    expect(parseStringArray(input)).toEqual(expected);
  });
});
