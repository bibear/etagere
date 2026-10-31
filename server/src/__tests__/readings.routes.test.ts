import { randomUUID } from 'node:crypto';

import type { BookDetail, MyReadingsResponse, ServerEvent } from '@etagere/shared';

import { takeReadingLock } from '../db/readings';
import { TEST_NOW, type TestApp, buildTestApp } from './support/test-app';

describe('readings API (the reading lock)', () => {
  let t: TestApp;
  let me: string;
  let ines: string;
  let clock: Date;
  let events: ServerEvent[];

  beforeEach(() => {
    clock = new Date(TEST_NOW);
    t = buildTestApp({ now: () => clock });
    me = t.seedProfile('Bruno', '#1F6B4A');
    ines = t.seedProfile('Inès', '#2C4A6B');
    events = [];
    t.app.events.subscribe((event) => events.push(event));
  });
  afterEach(() => t.close());

  const tick = () => {
    clock = new Date(clock.getTime() + 86_400_000);
    return clock.toISOString();
  };

  const addBook = async (title: string): Promise<string> => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { 'x-etagere-profile': me },
      payload: { title, authors: ['Victor Hugo'] },
    });
    return response.json().id;
  };

  const action = (bookId: string, verb: string, profile: string = me) =>
    t.app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/reading/${verb}`,
      headers: { 'x-etagere-profile': profile },
    });

  const myReadings = async (profile: string = me): Promise<MyReadingsResponse> => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/me/readings',
      headers: { 'x-etagere-profile': profile },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  };

  it('start locks the book for the household', async () => {
    const book = await addBook('Les Misérables');
    events = [];

    const started = await action(book, 'start');

    expect(started.statusCode).toBe(200);
    expect((started.json() as BookDetail).availability).toEqual({
      state: 'reading',
      by: { id: me, name: 'Bruno', color: '#1F6B4A' },
    });
    expect(events).toEqual([{ type: 'books.changed', id: book }]);

    const refused = await action(book, 'start', ines);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      code: 'unavailable',
      availability: { state: 'reading', by: { id: me, name: 'Bruno', color: '#1F6B4A' } },
    });
  });

  it('start is idempotent for the current reader', async () => {
    const book = await addBook('Dune');
    await action(book, 'start');
    const again = await action(book, 'start');
    expect(again.statusCode).toBe(200);
    expect(t.db.prepare('SELECT count(*) AS n FROM readings').get()).toEqual({ n: 1 });
  });

  it('two simultaneous starts: exactly one wins', async () => {
    const book = await addBook('Dune');
    const readers = [me, ines, t.seedProfile('Léo'), t.seedProfile('Zoé'), t.seedProfile('Max')];

    const responses = await Promise.all(readers.map((reader) => action(book, 'start', reader)));

    const statuses = responses.map((response) => response.statusCode).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    expect(
      t.db.prepare("SELECT count(*) AS n FROM readings WHERE state = 'reading'").get(),
    ).toEqual({ n: 1 });
  });

  it('the database index holds the lock even when the check is bypassed', async () => {
    const book = await addBook('Dune');
    const at = TEST_NOW.toISOString();
    expect(takeReadingLock(t.db, { id: randomUUID(), bookId: book, profileId: me, at })).toBe(true);
    expect(takeReadingLock(t.db, { id: randomUUID(), bookId: book, profileId: ines, at })).toBe(
      false,
    );
  });

  it('a lent book cannot be started', async () => {
    const book = await addBook('Dune');
    t.db
      .prepare(
        `INSERT INTO loans (id, book_id, borrower, lent_by, lent_at) VALUES ('l', ?, 'Paul', ?, ?)`,
      )
      .run(book, me, TEST_NOW.toISOString());
    const refused = await action(book, 'start');
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      code: 'unavailable',
      availability: { state: 'lent', borrower: 'Paul', since: TEST_NOW.toISOString() },
    });
  });

  it('starting another book puts the previous one back on the shelf', async () => {
    const first = await addBook('Les Misérables');
    const second = await addBook('Dune');
    await action(first, 'start');
    events = [];

    await action(second, 'start');

    const detail = await t.app.inject({ method: 'GET', url: `/api/books/${first}` });
    expect(detail.json().availability).toEqual({ state: 'available' });
    expect(events).toEqual([
      { type: 'books.changed', id: first },
      { type: 'books.changed', id: second },
    ]);
    expect((await myReadings()).current?.book.id).toBe(second);
  });

  it('finish frees the book and records it as read', async () => {
    const book = await addBook('Les Misérables');
    const startedAt = clock.toISOString();
    await action(book, 'start');
    const finishedAt = tick();

    const finished = await action(book, 'finish');

    expect(finished.statusCode).toBe(200);
    expect(finished.json()).toMatchObject({
      availability: { state: 'available' },
      readByMe: true,
      readBy: [{ id: me, name: 'Bruno', color: '#1F6B4A' }],
    });
    const readings = await myReadings();
    expect(readings.current).toBeNull();
    expect(readings.finished).toEqual([
      {
        book: expect.objectContaining({ id: book, readByMe: true }),
        startedAt,
        finishedAt,
        commentCount: 0,
      },
    ]);
    expect(readings.stats).toEqual({ finishedCount: 1 });
  });

  it('putdown frees the book without recording it as read', async () => {
    const book = await addBook('Les Misérables');
    await action(book, 'start');

    const putDown = await action(book, 'putdown');

    expect(putDown.statusCode).toBe(200);
    expect(putDown.json()).toMatchObject({ availability: { state: 'available' }, readByMe: false });
    expect(t.db.prepare('SELECT state FROM readings').get()).toEqual({ state: 'abandoned' });
    expect((await action(book, 'start', ines)).statusCode).toBe(200);
  });

  it('only the current reader can finish or put down', async () => {
    const book = await addBook('Dune');
    const nobody = await action(book, 'finish');
    expect(nobody.statusCode).toBe(409);
    expect(nobody.json()).toEqual({ code: 'not_reader', availability: { state: 'available' } });

    await action(book, 'start', ines);
    for (const verb of ['finish', 'putdown']) {
      const refused = await action(book, verb);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({
        code: 'not_reader',
        availability: { state: 'reading', by: { id: ines } },
      });
    }
  });

  it('already-read records a finished reading once, without touching the lock', async () => {
    const book = await addBook('Dune');
    await action(book, 'start', ines);

    const first = await action(book, 'already-read');
    const second = await action(book, 'already-read');

    expect(first.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      readByMe: true,
      availability: { state: 'reading', by: { id: ines } },
    });
    const readings = await myReadings();
    expect(readings.finished).toEqual([
      expect.objectContaining({ startedAt: null, finishedAt: TEST_NOW.toISOString() }),
    ]);
    expect(readings.stats.finishedCount).toBe(1);
  });

  it('already-read while reading it finishes the current reading', async () => {
    const book = await addBook('Dune');
    await action(book, 'start');
    const response = await action(book, 'already-read');
    expect(response.json()).toMatchObject({ availability: { state: 'available' }, readByMe: true });
  });

  it('my readings: newest finished first, one entry per book, with comment counts', async () => {
    const a = await addBook('A');
    const b = await addBook('B');
    await action(a, 'already-read');
    tick();
    await action(b, 'already-read');
    tick();
    await action(a, 'start');
    const at = tick();
    await action(a, 'finish');
    t.db
      .prepare(
        `INSERT INTO comments (id, book_id, profile_id, text, created_at, updated_at)
         VALUES ('c', ?, ?, 'Bien', ?, ?)`,
      )
      .run(b, ines, at, at);

    const readings = await myReadings();

    expect(readings.finished.map((item) => [item.book.title, item.commentCount])).toEqual([
      ['A', 0],
      ['B', 1],
    ]);
    expect(readings.finished[0]?.finishedAt).toBe(at);
    expect(readings.stats.finishedCount).toBe(2);
    expect((await myReadings(ines)).finished).toEqual([]);
  });

  it('needs a known profile and an existing book', async () => {
    const book = await addBook('Dune');
    const anonymous = await t.app.inject({
      method: 'POST',
      url: `/api/books/${book}/reading/start`,
    });
    expect(anonymous.statusCode).toBe(401);
    expect((await action(randomUUID(), 'start')).statusCode).toBe(404);
    const readings = await t.app.inject({ method: 'GET', url: '/api/me/readings' });
    expect(readings.statusCode).toBe(401);
  });
});
