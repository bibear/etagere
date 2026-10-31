import { type TestApp, buildTestApp } from './support/test-app';
import {
  DUNE_ISBN,
  GOOGLE_COVER,
  duneRoutes,
  fakeOpenLibrary,
  googleBooksUrl,
  googleNothing,
  googleVolume,
} from './support/open-library';

describe('GET /api/lookup/:isbn', () => {
  let t: TestApp;

  afterEach(() => t.close());

  const lookup = (isbn: string) => t.app.inject({ method: 'GET', url: `/api/lookup/${isbn}` });

  it('answers the candidate, accepting an ISBN-10 or a hyphenated ISBN-13', async () => {
    const ol = fakeOpenLibrary(duneRoutes());
    t = buildTestApp({ fetch: ol.fetch });

    const response = await lookup('978-2-266-32048-1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      isbn13: DUNE_ISBN,
      title: 'Dune',
      authors: ['Frank Herbert'],
      genres: ['Science fiction', 'Ecology', 'Fiction'],
    });
    // ISBN-10 of a Folio edition, normalised before the call.
    await lookup('207036822X');
    expect(ol.requests).toContain('https://openlibrary.org/isbn/9782070368228.json');
  });

  it('answers 400 invalid_isbn without calling Open Library', async () => {
    const ol = fakeOpenLibrary(duneRoutes());
    t = buildTestApp({ fetch: ol.fetch });
    const response = await lookup('9782266320482');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'invalid_isbn' });
    expect(ol.requests).toEqual([]);
  });

  it('answers 409 already_in_library with the book, without calling Open Library', async () => {
    const ol = fakeOpenLibrary(duneRoutes());
    t = buildTestApp({ fetch: ol.fetch });
    const me = t.seedProfile();
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { 'x-etagere-profile': me },
      payload: { isbn13: DUNE_ISBN, title: 'Dune', authors: [] },
    });

    const response = await lookup(DUNE_ISBN);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'already_in_library',
      book: expect.objectContaining({ id: created.json().id }),
    });
    expect(ol.requests).toEqual([]);
  });

  it('answers 404 not_found when neither Open Library nor Google Books knows the ISBN', async () => {
    t = buildTestApp({
      fetch: fakeOpenLibrary({ [googleBooksUrl(DUNE_ISBN)]: googleNothing }).fetch,
    });
    const response = await lookup(DUNE_ISBN);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'not_found' });
  });

  it('answers the Google Books candidate when Open Library fails', async () => {
    t = buildTestApp({
      fetch: fakeOpenLibrary({
        [`https://openlibrary.org/isbn/${DUNE_ISBN}.json`]: new Error('offline'),
        [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN),
      }).fetch,
    });
    const response = await lookup(DUNE_ISBN);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: 'Dune',
      description: 'Sur Arrakis, la planète des sables.\n\nPaul Atréides…',
      coverSourceUrl: GOOGLE_COVER,
    });
  });

  it('answers the Open Library candidate when Google Books fails', async () => {
    t = buildTestApp({
      fetch: fakeOpenLibrary({
        ...duneRoutes(),
        [googleBooksUrl(DUNE_ISBN)]: new Response('quota', { status: 429 }),
      }).fetch,
    });
    const response = await lookup(DUNE_ISBN);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ title: 'Dune', publisher: 'Pocket' });
  });

  it('answers 502 upstream_unavailable when both sources fail', async () => {
    t = buildTestApp({
      fetch: fakeOpenLibrary({
        [`https://openlibrary.org/isbn/${DUNE_ISBN}.json`]: new Error('offline'),
        [googleBooksUrl(DUNE_ISBN)]: new Error('offline'),
      }).fetch,
    });
    const response = await lookup(DUNE_ISBN);
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ code: 'upstream_unavailable' });
  });
});
