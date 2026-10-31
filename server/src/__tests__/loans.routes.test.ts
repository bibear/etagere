import type { BookDetail, ServerEvent } from '@etagere/shared';

import { TEST_NOW, type TestApp, buildTestApp } from './support/test-app';

describe('loans API', () => {
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

  const addBook = async (title: string): Promise<string> => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { 'x-etagere-profile': me },
      payload: { title, authors: ['Victor Hugo'] },
    });
    return response.json().id;
  };

  const lend = (bookId: string, payload: unknown, profile: string | null = me) =>
    t.app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/loan`,
      headers: profile === null ? {} : { 'x-etagere-profile': profile },
      payload: payload as object,
    });

  const giveBack = (bookId: string, profile: string = me) =>
    t.app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/loan/return`,
      headers: { 'x-etagere-profile': profile },
    });

  const reading = (bookId: string, verb: string, profile: string = me) =>
    t.app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/reading/${verb}`,
      headers: { 'x-etagere-profile': profile },
    });

  it('lends a book: it shows as lent to the borrower for the whole household', async () => {
    const book = await addBook('Les Misérables');
    events = [];

    const lent = await lend(book, { borrower: '  Paul  ' });

    expect(lent.statusCode).toBe(200);
    const lentState = { state: 'lent', borrower: 'Paul', since: TEST_NOW.toISOString() };
    expect((lent.json() as BookDetail).availability).toEqual(lentState);
    expect(events).toEqual([{ type: 'books.changed', id: book }]);

    const seen = await t.app.inject({
      method: 'GET',
      url: `/api/books/${book}`,
      headers: { 'x-etagere-profile': ines },
    });
    expect(seen.json().availability).toEqual(lentState);
    const list = await t.app.inject({ method: 'GET', url: '/api/books?filter=lent' });
    expect(list.json().books.map((b: { id: string }) => b.id)).toEqual([book]);
    expect(list.json().counts).toMatchObject({ lent: 1, available: 0 });
  });

  it('a lent book cannot be lent again nor started', async () => {
    const book = await addBook('Dune');
    await lend(book, { borrower: 'Paul' });

    const again = await lend(book, { borrower: 'Marie' }, ines);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({
      code: 'unavailable',
      availability: { state: 'lent', borrower: 'Paul', since: TEST_NOW.toISOString() },
    });
    expect((await reading(book, 'start', ines)).statusCode).toBe(409);
  });

  it('a book being read cannot be lent, even by its reader', async () => {
    const book = await addBook('Dune');
    await reading(book, 'start', ines);
    const inesRef = { id: ines, name: 'Inès', color: '#2C4A6B' };

    for (const profile of [me, ines]) {
      const refused = await lend(book, { borrower: 'Paul' }, profile);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({
        code: 'unavailable',
        availability: { state: 'reading', by: inesRef },
      });
    }
    expect(t.db.prepare('SELECT count(*) AS n FROM loans').get()).toEqual({ n: 0 });
  });

  it('return makes the book available again, by any member, and keeps the history', async () => {
    const book = await addBook('Dune');
    await lend(book, { borrower: 'Paul' });
    clock = new Date(TEST_NOW.getTime() + 7 * 86_400_000);
    events = [];

    const returned = await giveBack(book, ines);

    expect(returned.statusCode).toBe(200);
    expect(returned.json().availability).toEqual({ state: 'available' });
    expect(events).toEqual([{ type: 'books.changed', id: book }]);
    expect(t.db.prepare('SELECT borrower, lent_by, returned_at FROM loans').all()).toEqual([
      { borrower: 'Paul', lent_by: me, returned_at: clock.toISOString() },
    ]);
    // Lent again after its return.
    expect((await lend(book, { borrower: 'Marie' })).statusCode).toBe(200);
  });

  it('returning a book that is not lent answers 409 not_lent', async () => {
    const book = await addBook('Dune');
    events = [];
    const response = await giveBack(book);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'not_lent', availability: { state: 'available' } });
    expect(events).toEqual([]);
  });

  it('two simultaneous loans: exactly one wins', async () => {
    const book = await addBook('Dune');
    const responses = await Promise.all(
      ['Paul', 'Marie', 'Jean'].map((borrower) => lend(book, { borrower })),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);
    expect(t.db.prepare('SELECT count(*) AS n FROM loans').get()).toEqual({ n: 1 });
  });

  it.each([
    [{}, ['borrower']],
    [{ borrower: '   ' }, ['borrower']],
    [{ borrower: 'x'.repeat(61) }, ['borrower']],
    [{ borrower: 'Paul', extra: 1 }, ['']],
  ])('rejects the invalid body %j', async (payload, fields) => {
    const book = await addBook('Dune');
    const response = await lend(book, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'invalid_input', fields });
  });

  it('needs a known profile', async () => {
    const book = await addBook('Dune');
    const response = await lend(book, { borrower: 'Paul' }, null);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: 'unknown_profile' });
    const back = await t.app.inject({ method: 'POST', url: `/api/books/${book}/loan/return` });
    expect(back.statusCode).toBe(401);
  });

  it('answers 404 for an unknown book', async () => {
    const id = '0b3f6a9e-4c1d-4e8a-9f2b-7d5c3a1e9b04';
    expect((await lend(id, { borrower: 'Paul' })).statusCode).toBe(404);
    expect((await giveBack(id)).statusCode).toBe(404);
  });

  it('deleting a lent book deletes its loans', async () => {
    const book = await addBook('Dune');
    await lend(book, { borrower: 'Paul' });
    await t.app.inject({
      method: 'DELETE',
      url: `/api/books/${book}`,
      headers: { 'x-etagere-profile': me },
    });
    expect(t.db.prepare('SELECT count(*) AS n FROM loans').get()).toEqual({ n: 0 });
  });
});
