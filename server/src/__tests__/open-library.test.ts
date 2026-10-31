import { genresFrom, lookupIsbn } from '../open-library';
import { DUNE_ISBN, duneRoutes, fakeOpenLibrary } from './support/open-library';

describe('Open Library lookup', () => {
  it('maps the edition, its authors and its work to a candidate', async () => {
    const ol = fakeOpenLibrary(duneRoutes());

    expect(await lookupIsbn(DUNE_ISBN, { fetch: ol.fetch })).toEqual({
      kind: 'found',
      candidate: {
        isbn13: DUNE_ISBN,
        title: 'Dune',
        authors: ['Frank Herbert'],
        genres: ['Science fiction', 'Ecology', 'Fiction'],
        publisher: 'Pocket',
        year: 2021,
        pages: 928,
        description: 'Sur Arrakis, la planète des sables…',
        coverSourceUrl: `https://covers.openlibrary.org/b/isbn/${DUNE_ISBN}-L.jpg?default=false`,
      },
    });
    expect(ol.requests).toEqual([
      `https://openlibrary.org/isbn/${DUNE_ISBN}.json`,
      'https://openlibrary.org/works/OL893415W.json',
      'https://openlibrary.org/authors/OL79034A.json',
    ]);
  });

  it('takes the authors from the work when the edition has none, and tolerates missing extras', async () => {
    const ol = fakeOpenLibrary({
      [`https://openlibrary.org/isbn/${DUNE_ISBN}.json`]: {
        title: '  Dune  ',
        works: [{ key: '/works/OL1W' }],
        description: 'Edition text',
      },
      'https://openlibrary.org/works/OL1W.json': {
        authors: [{ author: { key: '/authors/OL1A' } }, { author: { key: '/authors/OL2A' } }],
      },
      'https://openlibrary.org/authors/OL1A.json': { name: 'Frank Herbert' },
      'https://openlibrary.org/authors/OL2A.json': new Error('reset'),
    });

    const result = await lookupIsbn(DUNE_ISBN, { fetch: ol.fetch });

    expect(result).toEqual({
      kind: 'found',
      candidate: expect.objectContaining({
        title: 'Dune',
        authors: ['Frank Herbert'],
        genres: [],
        publisher: null,
        year: null,
        pages: null,
        description: 'Edition text',
        coverSourceUrl: null,
      }),
    });
  });

  it('answers not_found on a 404 or an edition without title', async () => {
    expect(await lookupIsbn(DUNE_ISBN, { fetch: fakeOpenLibrary({}).fetch })).toEqual({
      kind: 'not_found',
    });
    const untitled = fakeOpenLibrary({ [`https://openlibrary.org/isbn/${DUNE_ISBN}.json`]: {} });
    expect(await lookupIsbn(DUNE_ISBN, { fetch: untitled.fetch })).toEqual({ kind: 'not_found' });
  });

  it.each([
    ['a network failure', new Error('ECONNREFUSED')],
    ['a server error', new Response('oops', { status: 503 })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a JSON array', new Response('[]', { status: 200 })],
  ])('answers unavailable on %s', async (_label, route) => {
    const ol = fakeOpenLibrary({ [`https://openlibrary.org/isbn/${DUNE_ISBN}.json`]: route });
    expect(await lookupIsbn(DUNE_ISBN, { fetch: ol.fetch })).toEqual({ kind: 'unavailable' });
  });

  it('gives up after the timeout and aborts the request', async () => {
    let aborted = false;
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });

    expect(await lookupIsbn(DUNE_ISBN, { fetch: hanging, timeoutMs: 20 })).toEqual({
      kind: 'unavailable',
    });
    expect(aborted).toBe(true);
  });

  it('keeps up to 5 distinct readable subjects as genres', () => {
    expect(
      genresFrom([
        'Roman',
        'roman',
        'Protected DAISY',
        'place:Paris',
        'x'.repeat(81),
        42,
        'A',
        'B',
        'C',
        'D',
        'E',
      ]),
    ).toEqual(['Roman', 'A', 'B', 'C', 'D']);
    expect(genresFrom(undefined)).toEqual([]);
  });
});
