import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BookDetail, ServerEvent } from '@etagere/shared';

import { type TestApp, buildTestApp } from './support/test-app';
import {
  DUNE_ISBN,
  type FakeRoute,
  GOOGLE_COVER,
  JPEG,
  duneRoutes,
  fakeOpenLibrary,
  googleBooksUrl,
  googleNothing,
  googleVolume,
} from './support/open-library';

const EDITION = `https://openlibrary.org/isbn/${DUNE_ISBN}.json`;

describe('POST /api/books/:id/enrich', () => {
  let t: TestApp;
  let dataDir: string;
  let me: string;
  let events: ServerEvent[];
  let requests: string[];

  const setup = (routes: Record<string, FakeRoute>) => {
    dataDir = mkdtempSync(join(tmpdir(), 'etagere-enrich-'));
    const fake = fakeOpenLibrary(routes);
    requests = fake.requests;
    t = buildTestApp({ dataDir, fetch: fake.fetch });
    me = t.seedProfile();
    events = [];
    t.app.events.subscribe((event) => events.push(event));
  };

  afterEach(async () => {
    await t.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const addBook = async (body: Record<string, unknown>): Promise<BookDetail> => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { 'x-etagere-profile': me },
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    events.length = 0;
    requests.length = 0;
    return response.json();
  };

  const enrich = (id: string, profile: string | null = me) =>
    t.app.inject({
      method: 'POST',
      url: `/api/books/${id}/enrich`,
      headers: profile ? { 'x-etagere-profile': profile } : {},
    });

  it('fills the missing fields and downloads a cover', async () => {
    setup({
      [EDITION]: { title: 'Dune' },
      [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN),
      [GOOGLE_COVER]: new Response(JPEG, { status: 200 }),
    });
    const book = await addBook({ isbn13: DUNE_ISBN, title: 'Dune', authors: ['Frank Herbert'] });

    const response = await enrich(book.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: book.id,
      title: 'Dune',
      coverUrl: `/api/covers/${book.id}.jpg`,
      description: 'Sur Arrakis, la planète des sables.\n\nPaul Atréides…',
      publisher: 'Pocket',
      year: 2021,
      pages: 928,
      genres: ['Fiction', 'Science Fiction'],
    });
    expect(readFileSync(join(dataDir, 'covers', `${book.id}.jpg`))).toEqual(Buffer.from(JPEG));
    expect(events).toEqual([{ type: 'books.changed', id: book.id }]);
  });

  it('never overwrites what the household entered', async () => {
    setup({
      ...duneRoutes(),
      [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN),
      'https://covers.openlibrary.org/b/id/1-L.jpg': new Response(JPEG, { status: 200 }),
    });
    const typed = {
      isbn13: DUNE_ISBN,
      title: 'Dune, édition du foyer',
      authors: ['F. H.'],
      genres: ['Culte'],
      publisher: 'Mon éditeur',
      year: 1999,
      pages: 12,
      description: 'Notre résumé.',
      coverSourceUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
    };
    const book = await addBook(typed);

    const response = await enrich(book.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(book);
    // The cover the household chose was not downloaded again.
    expect(requests).not.toContain(
      `https://covers.openlibrary.org/b/isbn/${DUNE_ISBN}-L.jpg?default=false`,
    );
    expect(events).toEqual([]);
  });

  it('fills only the empty fields of a partly typed book', async () => {
    setup({ ...duneRoutes(), [googleBooksUrl(DUNE_ISBN)]: googleNothing });
    const book = await addBook({
      isbn13: DUNE_ISBN,
      title: 'Dune',
      authors: [],
      publisher: 'Mon éditeur',
      description: 'Notre résumé.',
    });

    const updated = (await enrich(book.id)).json() as BookDetail;

    expect(updated).toMatchObject({
      authors: [],
      publisher: 'Mon éditeur',
      description: 'Notre résumé.',
      year: 2021,
      pages: 928,
      genres: ['Science fiction', 'Ecology', 'Fiction'],
      coverUrl: `/api/covers/${book.id}.jpg`,
    });
  });

  it('answers the book unchanged when no source knows the ISBN', async () => {
    setup({ [googleBooksUrl(DUNE_ISBN)]: googleNothing });
    const book = await addBook({ isbn13: DUNE_ISBN, title: 'Dune', authors: [] });
    const response = await enrich(book.id);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(book);
    expect(events).toEqual([]);
  });

  it('answers 409 no_isbn for a book without ISBN, without any request', async () => {
    setup({});
    const book = await addBook({ title: 'Carnet de famille', authors: [] });
    const response = await enrich(book.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'no_isbn' });
    expect(requests).toEqual([]);
  });

  it('answers 502 upstream_unavailable when the lookup fails', async () => {
    setup({ [EDITION]: new Error('offline'), [googleBooksUrl(DUNE_ISBN)]: new Error('offline') });
    const book = await addBook({ isbn13: DUNE_ISBN, title: 'Dune', authors: [] });
    const response = await enrich(book.id);
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ code: 'upstream_unavailable' });
    expect(events).toEqual([]);
  });

  it('needs a known profile and an existing book', async () => {
    setup({});
    const book = await addBook({ isbn13: DUNE_ISBN, title: 'Dune', authors: [] });
    expect((await enrich(book.id, null)).statusCode).toBe(401);
    const missing = await enrich('11111111-1111-4111-8111-111111111111');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ code: 'not_found' });
  });
});
