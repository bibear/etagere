import type { RecommendationsResponse } from '@etagere/shared';

import { BUY_IDEAS_TTL_MS } from '../buy-ideas';
import { type FakeRoute, fakeOpenLibrary } from './support/open-library';
import { TEST_NOW, type TestApp, buildTestApp } from './support/test-app';

const searchUrl = (kind: 'author' | 'subject', ref: string) =>
  `https://openlibrary.org/search.json?${new URLSearchParams({
    [kind]: ref,
    fields: 'title,author_name,isbn,cover_i',
    limit: '15',
  }).toString()}`;

const docs = (...items: object[]) => ({ numFound: items.length, docs: items });

describe('recommendations API', () => {
  let t: TestApp;
  let me: string;
  let camille: string;
  let clock: Date;
  let routes: Record<string, FakeRoute>;
  let ol: ReturnType<typeof fakeOpenLibrary>;
  let added = 0;

  beforeEach(() => {
    clock = new Date(TEST_NOW);
    routes = {};
    ol = fakeOpenLibrary(routes);
    t = buildTestApp({ now: () => clock, fetch: ol.fetch });
    me = t.seedProfile('Bruno', '#1F6B4A');
    camille = t.seedProfile('Camille', '#B5523B');
    added = 0;
  });
  afterEach(() => t.close());

  const addBook = async (
    title: string,
    authors: string[],
    genres: string[] = [],
    isbn13?: string,
  ): Promise<string> => {
    // Distinct added dates: the newest comes first on a tie.
    clock = new Date(TEST_NOW.getTime() + ++added * 60_000);
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { 'x-etagere-profile': me },
      payload: { title, authors, genres, ...(isbn13 ? { isbn13 } : {}) },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id;
  };

  const post = (url: string, profile: string, payload?: object) =>
    t.app.inject({ method: 'POST', url, headers: { 'x-etagere-profile': profile }, payload });

  const finish = (book: string, profile = me) =>
    post(`/api/books/${book}/reading/already-read`, profile);

  const recommendations = async (profile = me): Promise<RecommendationsResponse> => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/me/recommendations',
      headers: { 'x-etagere-profile': profile },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  };

  const titles = (recos: { book: { title: string } }[]) => recos.map((reco) => reco.book.title);

  it('needs a known profile', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/me/recommendations' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: 'unknown_profile' });
  });

  it('an empty house: nothing to recommend, no outbound call', async () => {
    expect(await recommendations()).toEqual({ featured: null, onShelf: [], toBuy: [] });
    expect(ol.requests).toEqual([]);
  });

  it('scores the shelf by shared authors, genres and household reviews', async () => {
    const dune = await addBook('Dune', ['Frank Herbert'], ['Science fiction', 'Ecology']);
    const fondation = await addBook('Fondation', ['Isaac Asimov'], ['Science fiction']);
    await finish(dune);
    await finish(fondation);
    const enfants = await addBook('Les Enfants de Dune', ['Frank Herbert'], ['Science fiction']);
    const hyperion = await addBook('Hypérion', ['Dan Simmons'], ['science fiction', 'Ecology']);
    const peste = await addBook('La Peste', ['Albert Camus'], ['Philosophy']);
    await post(`/api/books/${peste}/comments`, camille, { text: 'Bouleversant.' });
    await post(`/api/books/${peste}/comments`, camille, { text: 'Je le relis.' });
    // My own review does not count as the household's.
    await post(`/api/books/${hyperion}/comments`, me, { text: 'Hâte !' });
    await addBook('Sans rapport', ['Personne'], ['Cooking']);

    const { featured, onShelf } = await recommendations();

    // Les Enfants de Dune: author +3, genre +1 = 4 — featured.
    expect(featured).toEqual({
      book: expect.objectContaining({ id: enfants, title: 'Les Enfants de Dune' }),
      reasons: [
        { kind: 'author', ref: 'Frank Herbert', because: ['Dune'] },
        { kind: 'genre', ref: 'Science fiction', because: ['Dune', 'Fondation'] },
      ],
      quote: null,
    });
    // Hypérion: 2 genres = 2 (case and accents ignored); La Peste: 2 reviews = 1; then the rest.
    expect(titles(onShelf)).toEqual(['Hypérion', 'La Peste', 'Sans rapport']);
    expect(onShelf[0]?.reasons.map((reason) => reason.ref)).toEqual(['science fiction', 'Ecology']);
    expect(onShelf[1]).toMatchObject({
      reasons: [{ kind: 'household', ref: 'Camille' }],
      quote: { author: { name: 'Camille', color: '#B5523B' }, text: 'Je le relis.' },
    });
    expect(onShelf[2]?.reasons).toEqual([]);
  });

  it('caps genre and review points', async () => {
    const genres = ['A', 'B', 'C', 'D', 'E'];
    await finish(await addBook('Lu', ['X'], genres));
    await addBook('Cinq genres', ['Y'], genres);
    const reviewed = await addBook('Très commenté', ['Z']);
    for (let i = 0; i < 10; i += 1) {
      await post(`/api/books/${reviewed}/comments`, camille, { text: `Avis ${i}` });
    }
    const { featured, onShelf } = await recommendations();
    // 5 shared genres → 3 points (only 3 reasons); 10 reviews → 2 points.
    expect(featured?.book.title).toBe('Cinq genres');
    expect(featured?.reasons).toHaveLength(3);
    expect(titles(onShelf)).toEqual(['Très commenté']);
  });

  it('leaves out books I read or am reading, and puts available books first', async () => {
    const dune = await addBook('Dune', ['Frank Herbert']);
    await finish(dune);
    const mine = await addBook('Dune Messiah', ['Frank Herbert']);
    await post(`/api/books/${mine}/reading/start`, me);
    const lent = await addBook('Les Enfants de Dune', ['Frank Herbert']);
    await post(`/api/books/${lent}/loan`, me, { borrower: 'Paul' });
    const busy = await addBook("L'Empereur-Dieu de Dune", ['Frank Herbert']);
    await post(`/api/books/${busy}/reading/start`, camille);
    await addBook('Autre chose', ['Quelqu’un']);

    const { featured, onShelf } = await recommendations();

    expect(featured?.book.title).toBe('Autre chose');
    expect(titles(onShelf)).toEqual(["L'Empereur-Dieu de Dune", 'Les Enfants de Dune']);
  });

  it('no featured pick when nothing is available', async () => {
    const book = await addBook('Dune', ['Frank Herbert']);
    await post(`/api/books/${book}/loan`, me, { borrower: 'Paul' });
    const { featured, onShelf } = await recommendations();
    expect(featured).toBeNull();
    expect(titles(onShelf)).toEqual(['Dune']);
  });

  describe('ideas to buy', () => {
    const herbert = searchUrl('author', 'Frank Herbert');
    const sf = searchUrl('subject', 'Science fiction');

    beforeEach(async () => {
      await finish(await addBook('Dune', ['Frank Herbert'], ['Science fiction'], '9782266320481'));
    });

    it('searches Open Library by my top authors and genres, alternating, without owned books', async () => {
      routes[herbert] = docs(
        { title: 'Dune', author_name: ['Frank Herbert'], isbn: ['9782266320481'] },
        {
          title: 'Dune Messiah',
          author_name: ['Frank Herbert'],
          isbn: ['0-441-17269-5', 'junk'],
          cover_i: 42,
        },
        { title: 'Children of Dune', author_name: ['Frank Herbert'] },
      );
      routes[sf] = docs(
        { title: 'DUNE ', author_name: ['F. Herbert'], isbn: ['1234'] },
        { title: 'Hyperion', author_name: ['Dan Simmons'], isbn: ['9780553283686'] },
        { notATitle: true },
      );

      const { toBuy, toBuyError } = await recommendations();

      expect(toBuyError).toBeUndefined();
      expect(toBuy).toEqual([
        {
          title: 'Dune Messiah',
          authors: ['Frank Herbert'],
          isbn13: '9780441172696',
          coverSourceUrl: 'https://covers.openlibrary.org/b/id/42-L.jpg',
          reason: { kind: 'author', ref: 'Frank Herbert' },
        },
        {
          title: 'Hyperion',
          authors: ['Dan Simmons'],
          isbn13: '9780553283686',
          coverSourceUrl: null,
          reason: { kind: 'genre', ref: 'Science fiction' },
        },
        {
          title: 'Children of Dune',
          authors: ['Frank Herbert'],
          isbn13: null,
          coverSourceUrl: null,
          reason: { kind: 'author', ref: 'Frank Herbert' },
        },
      ]);
      expect(ol.requests.sort()).toEqual([herbert, sf].sort());
    });

    it('keeps at most 10 ideas', async () => {
      routes[herbert] = docs(
        ...Array.from({ length: 15 }, (_, i) => ({ title: `Livre ${i}`, author_name: ['FH'] })),
      );
      routes[sf] = docs();
      expect((await recommendations()).toBuy).toHaveLength(10);
    });

    it('caches each search for 24 hours', async () => {
      routes[herbert] = docs({ title: 'Dune Messiah' });
      routes[sf] = docs();
      await recommendations();
      expect(ol.requests).toHaveLength(2);

      clock = new Date(clock.getTime() + BUY_IDEAS_TTL_MS - 1000);
      routes[herbert] = docs({ title: 'Something else' });
      expect((await recommendations()).toBuy.map((idea) => idea.title)).toEqual(['Dune Messiah']);
      expect(ol.requests).toHaveLength(2);

      clock = new Date(clock.getTime() + 2000);
      expect((await recommendations()).toBuy.map((idea) => idea.title)).toEqual(['Something else']);
      expect(ol.requests).toHaveLength(4);
    });

    it('a book added since is left out even from a cached search', async () => {
      routes[herbert] = docs({ title: 'Dune Messiah' }, { title: 'Children of Dune' });
      routes[sf] = docs();
      await recommendations();
      await addBook('Dune Messiah', ['Frank Herbert']);
      expect((await recommendations()).toBuy.map((idea) => idea.title)).toEqual([
        'Children of Dune',
      ]);
    });

    it('upstream down: the shelf still answers, toBuy is empty with an error', async () => {
      routes[herbert] = new Error('ECONNREFUSED');
      routes[sf] = new Response('oops', { status: 503 });
      await addBook('Hypérion', ['Dan Simmons'], ['Science fiction']);

      const response = await recommendations();

      expect(response.toBuy).toEqual([]);
      expect(response.toBuyError).toBe('upstream_unavailable');
      expect(response.featured?.book.title).toBe('Hypérion');
    });

    it('a failed search is not cached; the others still give ideas', async () => {
      routes[herbert] = new Response('not json', { status: 200 });
      routes[sf] = docs({ title: 'Hyperion' });
      const first = await recommendations();
      expect(first.toBuyError).toBeUndefined();
      expect(first.toBuy.map((idea) => idea.title)).toEqual(['Hyperion']);

      routes[herbert] = docs({ title: 'Dune Messiah' });
      const second = await recommendations();
      expect(second.toBuy.map((idea) => idea.title)).toEqual(['Dune Messiah', 'Hyperion']);
      expect(ol.requests.filter((url) => url === sf)).toHaveLength(1);
    });

    it('gives up after the timeout', async () => {
      await t.close();
      const hanging: typeof fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      t = buildTestApp({ now: () => clock, fetch: hanging });
      me = t.seedProfile();
      const at = clock.toISOString();
      t.db
        .prepare(
          `INSERT INTO books (id, title, authors, genres, source, added_by, added_at, updated_at)
           VALUES ('b1', 'Dune', '["Frank Herbert"]', '[]', 'manual', ?, ?, ?)`,
        )
        .run(me, at, at);
      t.db
        .prepare(
          `INSERT INTO readings (id, book_id, profile_id, finished_at, state)
           VALUES ('r1', 'b1', ?, ?, 'finished')`,
        )
        .run(me, at);
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
      try {
        const pending = recommendations();
        await jest.advanceTimersByTimeAsync(5000);
        const response = await pending;
        expect(response).toMatchObject({ toBuy: [], toBuyError: 'upstream_unavailable' });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
