import { randomUUID } from 'node:crypto';

import type { BookDetail, BookSummary, ServerEvent } from '@etagere/shared';

import { TEST_NOW, type TestApp, buildTestApp } from './support/test-app';

describe('books API', () => {
  let t: TestApp;
  let me: string;
  let other: string;
  let clock: Date;
  let events: ServerEvent[];

  beforeEach(() => {
    clock = new Date(TEST_NOW);
    t = buildTestApp({ now: () => clock });
    me = t.seedProfile('Bruno', '#1F6B4A');
    other = t.seedProfile('Inès', '#2C4A6B');
    events = [];
    t.app.events.subscribe((event) => events.push(event));
  });
  afterEach(() => t.close());

  const as = (profile: string | undefined) =>
    profile === undefined ? {} : { 'x-etagere-profile': profile };

  const create = async (body: Record<string, unknown>, profile: string = me) => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: as(profile),
      payload: body,
    });
    return response;
  };

  const add = async (body: Record<string, unknown>): Promise<BookDetail> => {
    const response = await create(body);
    expect(response.statusCode).toBe(201);
    clock = new Date(clock.getTime() + 60_000);
    return response.json();
  };

  const list = async (query = '', profile: string | null = me) => {
    const response = await t.app.inject({
      method: 'GET',
      url: `/api/books${query}`,
      headers: as(profile ?? undefined),
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { books: BookSummary[]; counts: Record<string, number> };
  };

  const titles = (books: BookSummary[]) => books.map((book) => book.title);

  describe('POST /api/books', () => {
    it('creates a book and answers its detail', async () => {
      const response = await create({
        isbn13: '978-2-07-036822-8',
        title: ' Les Misérables ',
        authors: ['Victor Hugo'],
        genres: ['Roman'],
        publisher: 'Folio',
        year: 1862,
        pages: 1900,
        description: '',
      });

      expect(response.statusCode).toBe(201);
      const book = response.json() as BookDetail;
      expect(book).toEqual({
        id: expect.any(String),
        isbn13: '9782070368228',
        title: 'Les Misérables',
        authors: ['Victor Hugo'],
        coverUrl: null,
        addedAt: TEST_NOW.toISOString(),
        availability: { state: 'available' },
        readByMe: false,
        genres: ['Roman'],
        publisher: 'Folio',
        year: 1862,
        pages: 1900,
        description: null,
        source: 'lookup',
        addedBy: { id: me, name: 'Bruno', color: '#1F6B4A' },
        readBy: [],
        commentCount: 0,
      });
      expect(events).toEqual([{ type: 'books.changed', id: book.id }]);
    });

    it('marks a book without ISBN as a manual entry', async () => {
      const book = await add({ title: 'Carnet de famille', authors: [] });
      expect(book).toMatchObject({ isbn13: null, source: 'manual', genres: [], year: null });
    });

    it('refuses a duplicate ISBN with the existing book', async () => {
      const first = await add({ isbn13: '9782070368228', title: 'Les Misérables', authors: [] });
      const response = await create({ isbn13: '2-07-036822-X', title: 'Again', authors: [] });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        code: 'already_in_library',
        book: expect.objectContaining({ id: first.id, title: 'Les Misérables' }),
      });
    });

    it('needs a known profile and a valid body', async () => {
      const anonymous = await create({ title: 'Dune', authors: [] }, randomUUID());
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toEqual({ code: 'unknown_profile' });

      const invalid = await create({ title: '', authors: 'Herbert', isbn13: '123', foo: 1 });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().fields).toEqual(expect.arrayContaining(['title', 'authors', 'isbn13']));
      expect(events).toEqual([]);
    });
  });

  describe('GET /api/books', () => {
    beforeEach(async () => {
      await add({ isbn13: '9782070368228', title: 'Les Misérables', authors: ['Victor Hugo'] });
      await add({ isbn13: '9782266320481', title: 'Dune', authors: ['Frank Herbert'] });
      await add({ title: "L'Étranger", authors: ['Albert Camus'] });
      await add({ title: 'Éloge de l’ombre', authors: ['Jun’ichirō Tanizaki'] });
    });

    it('lists every book, newest first, with counts', async () => {
      const { books, counts } = await list();
      expect(titles(books)).toEqual(['Éloge de l’ombre', "L'Étranger", 'Dune', 'Les Misérables']);
      expect(counts).toEqual({ all: 4, available: 4, reading: 0, lent: 0, unreadByMe: 4 });
    });

    it('searches title, author and ISBN, ignoring case and accents', async () => {
      expect(titles((await list('?query=MISERABLES')).books)).toEqual(['Les Misérables']);
      expect(titles((await list('?query=etranger')).books)).toEqual(["L'Étranger"]);
      expect(titles((await list('?query=tanizaki')).books)).toEqual(['Éloge de l’ombre']);
      expect(titles((await list('?query=hugo')).books)).toEqual(['Les Misérables']);
      expect(titles((await list('?query=978-2-266')).books)).toEqual(['Dune']);
      expect(titles((await list('?query=%25')).books)).toEqual([]);
      expect((await list('?query=e')).counts.all).toBe(4);
    });

    it('also searches the back-cover text, keeping the sort', async () => {
      await add({
        title: 'Le Désert des Tartares',
        authors: ['Dino Buzzati'],
        description: 'Le lieutenant Drogo attend, dans une forteresse aux confins du désert…',
      });
      await add({
        title: 'Dune',
        authors: [],
        isbn13: null,
        description: 'Sur Arrakis, planète des sables et du désert, Paul Atréides…',
      });
      expect(titles((await list('?query=FORTERESSE')).books)).toEqual(['Le Désert des Tartares']);
      expect(titles((await list('?query=atreides')).books)).toEqual(['Dune']);
      expect(titles((await list('?query=desert&sort=title')).books)).toEqual([
        'Dune',
        'Le Désert des Tartares',
      ]);
    });

    it('sorts by title and by first author', async () => {
      expect(titles((await list('?sort=title')).books)).toEqual([
        'Dune',
        'Éloge de l’ombre',
        "L'Étranger",
        'Les Misérables',
      ]);
      expect(titles((await list('?sort=author')).books)).toEqual([
        "L'Étranger",
        'Dune',
        'Éloge de l’ombre',
        'Les Misérables',
      ]);
    });

    it('filters by availability and by what I have not read, counts staying global', async () => {
      const ids: Record<string, string> = Object.fromEntries(
        (await list()).books.map((book) => [book.title, book.id]),
      );
      const at = TEST_NOW.toISOString();
      t.db
        .prepare(
          `INSERT INTO readings (id, book_id, profile_id, started_at, state)
           VALUES ('r1', ?, ?, ?, 'reading')`,
        )
        .run(String(ids.Dune), other, at);
      t.db
        .prepare(
          `INSERT INTO loans (id, book_id, borrower, lent_by, lent_at) VALUES ('l1', ?, 'Paul', ?, ?)`,
        )
        .run(String(ids["L'Étranger"]), me, at);
      t.db
        .prepare(
          `INSERT INTO readings (id, book_id, profile_id, finished_at, state)
           VALUES ('r2', ?, ?, ?, 'finished')`,
        )
        .run(String(ids['Les Misérables']), me, at);

      const reading = await list('?filter=reading');
      expect(reading.books).toEqual([
        expect.objectContaining({
          title: 'Dune',
          availability: { state: 'reading', by: { id: other, name: 'Inès', color: '#2C4A6B' } },
        }),
      ]);
      const lent = await list('?filter=lent');
      expect(lent.books).toEqual([
        expect.objectContaining({
          title: "L'Étranger",
          availability: { state: 'lent', borrower: 'Paul', since: at },
        }),
      ]);
      expect(titles((await list('?filter=available&sort=title')).books)).toEqual([
        'Éloge de l’ombre',
        'Les Misérables',
      ]);
      const unread = await list('?filter=unread_by_me&sort=title');
      expect(titles(unread.books)).toEqual(['Dune', 'Éloge de l’ombre', "L'Étranger"]);
      expect(unread.counts).toEqual({ all: 4, available: 2, reading: 1, lent: 1, unreadByMe: 3 });

      // readByMe depends on who asks.
      const mine = (await list('?query=miserables')).books[0];
      const theirs = (await list('?query=miserables', other)).books[0];
      expect(mine?.readByMe).toBe(true);
      expect(theirs?.readByMe).toBe(false);
      expect((await list('', null)).counts.unreadByMe).toBe(4);
    });

    it('rejects an unknown filter or sort', async () => {
      const response = await t.app.inject({ method: 'GET', url: '/api/books?filter=mine' });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: 'invalid_input', fields: ['filter'] });
    });
  });

  describe('GET /api/books/:id', () => {
    it('answers the detail with readers and comment count', async () => {
      const book = await add({ title: 'Dune', authors: ['Frank Herbert'] });
      const at = TEST_NOW.toISOString();
      for (const [id, profile] of [
        ['r1', me],
        ['r2', other],
        ['r3', me],
      ]) {
        t.db
          .prepare(
            `INSERT INTO readings (id, book_id, profile_id, finished_at, state)
             VALUES (?, ?, ?, ?, 'finished')`,
          )
          .run(id ?? '', book.id, profile ?? '', at);
      }
      t.db
        .prepare(
          `INSERT INTO comments (id, book_id, profile_id, text, created_at, updated_at)
           VALUES ('c1', ?, ?, 'Génial', ?, ?)`,
        )
        .run(book.id, other, at, at);

      const response = await t.app.inject({
        method: 'GET',
        url: `/api/books/${book.id}`,
        headers: as(me),
      });

      expect(response.json()).toMatchObject({
        id: book.id,
        readByMe: true,
        readBy: [
          { id: me, name: 'Bruno', color: '#1F6B4A' },
          { id: other, name: 'Inès', color: '#2C4A6B' },
        ],
        commentCount: 1,
      });
    });

    it('answers 404 for an unknown book and 400 for a malformed id', async () => {
      const missing = await t.app.inject({ method: 'GET', url: `/api/books/${randomUUID()}` });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ code: 'not_found' });
      const malformed = await t.app.inject({ method: 'GET', url: '/api/books/42' });
      expect(malformed.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/books/:id', () => {
    it('updates the given fields only', async () => {
      const book = await add({ title: 'Dune', authors: ['Frank Herbert'], year: 1965 });
      events = [];
      const response = await t.app.inject({
        method: 'PATCH',
        url: `/api/books/${book.id}`,
        headers: as(other),
        payload: { title: 'Dune (édition illustrée)', pages: 700, year: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        title: 'Dune (édition illustrée)',
        authors: ['Frank Herbert'],
        pages: 700,
        year: null,
        addedBy: { id: me },
      });
      expect(events).toEqual([{ type: 'books.changed', id: book.id }]);
    });

    it('derives the source from the ISBN when the ISBN changes (D-31)', async () => {
      const book = await add({ title: 'Dune', authors: [] });
      const patch = async (payload: object) =>
        (
          await t.app.inject({
            method: 'PATCH',
            url: `/api/books/${book.id}`,
            headers: as(me),
            payload,
          })
        ).json();

      expect(await patch({ isbn13: '9782266320481' })).toMatchObject({ source: 'lookup' });
      expect(await patch({ title: 'Dune I' })).toMatchObject({ source: 'lookup' });
      expect(await patch({ isbn13: null })).toMatchObject({ isbn13: null, source: 'manual' });
    });

    it('refuses an ISBN already used by another book, an empty patch and unknown books', async () => {
      await add({ isbn13: '9782070368228', title: 'Les Misérables', authors: [] });
      const book = await add({ title: 'Dune', authors: [] });
      const patch = (id: string, payload: object) =>
        t.app.inject({ method: 'PATCH', url: `/api/books/${id}`, headers: as(me), payload });

      const duplicate = await patch(book.id, { isbn13: '9782070368228' });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().code).toBe('already_in_library');
      expect((await patch(book.id, {})).statusCode).toBe(400);
      expect((await patch(randomUUID(), { title: 'X' })).statusCode).toBe(404);
    });
  });

  describe('DELETE /api/books/:id', () => {
    it('deletes the book with its readings, loans and comments', async () => {
      const book = await add({ title: 'Dune', authors: [] });
      const at = TEST_NOW.toISOString();
      t.db
        .prepare(
          `INSERT INTO readings (id, book_id, profile_id, state) VALUES ('r', ?, ?, 'reading')`,
        )
        .run(book.id, me);
      t.db
        .prepare(
          `INSERT INTO loans (id, book_id, borrower, lent_by, lent_at) VALUES ('l', ?, 'P', ?, ?)`,
        )
        .run(book.id, me, at);
      t.db
        .prepare(
          `INSERT INTO comments (id, book_id, profile_id, text, created_at, updated_at)
           VALUES ('c', ?, ?, 'x', ?, ?)`,
        )
        .run(book.id, me, at, at);
      events = [];

      const response = await t.app.inject({
        method: 'DELETE',
        url: `/api/books/${book.id}`,
        headers: as(other),
      });

      expect(response.statusCode).toBe(204);
      expect((await list()).books).toEqual([]);
      for (const table of ['readings', 'loans', 'comments']) {
        expect(t.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
      }
      expect(events).toEqual([{ type: 'books.changed', id: book.id }]);
    });

    it('answers 404 for an unknown book and 401 without a profile', async () => {
      const book = await add({ title: 'Dune', authors: [] });
      const anonymous = await t.app.inject({ method: 'DELETE', url: `/api/books/${book.id}` });
      expect(anonymous.statusCode).toBe(401);
      const missing = await t.app.inject({
        method: 'DELETE',
        url: `/api/books/${randomUUID()}`,
        headers: as(me),
      });
      expect(missing.statusCode).toBe(404);
    });
  });
});
