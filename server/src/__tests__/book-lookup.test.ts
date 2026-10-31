import { LIMITS } from '@etagere/shared';

import { lookupBook } from '../book-lookup';
import {
  DUNE_ISBN,
  GOOGLE_COVER,
  duneRoutes,
  fakeOpenLibrary,
  googleBooksUrl,
  googleNothing,
  googleVolume,
} from './support/open-library';

const EDITION = `https://openlibrary.org/isbn/${DUNE_ISBN}.json`;
const OL_COVER = `https://covers.openlibrary.org/b/isbn/${DUNE_ISBN}-L.jpg?default=false`;

/** An Open Library edition with only a title and a publisher: no work, author, cover. */
const bareEdition = { [EDITION]: { title: 'Dune (OL)', publishers: ['Laffont'] } };

describe('ISBN lookup over Open Library and Google Books', () => {
  it('queries both sources in parallel', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ol = fakeOpenLibrary({ ...duneRoutes(), [googleBooksUrl(DUNE_ISBN)]: googleNothing });
    const fetch: typeof globalThis.fetch = async (input, init) => {
      order.push(String(input));
      if (order.length === 2) release();
      await gate; // both requests must start before either answers
      return ol.fetch(input, init);
    };
    expect((await lookupBook(DUNE_ISBN, { fetch })).kind).toBe('found');
    expect(order.slice(0, 2).sort()).toEqual([EDITION, googleBooksUrl(DUNE_ISBN)].sort());
  });

  it('keeps the Open Library values when present', async () => {
    const both = fakeOpenLibrary({
      ...duneRoutes(),
      [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN, {
        title: 'Dune (GB)',
        authors: ['F. Herbert'],
        publisher: 'Robert Laffont',
        publishedDate: '1970',
        pageCount: 10,
        categories: ['Fiction'],
        description: 'Court.',
      }),
    });

    const result = await lookupBook(DUNE_ISBN, { fetch: both.fetch });

    expect(result).toEqual({
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
        coverSourceUrl: OL_COVER,
      },
    });
  });

  it('fills what Open Library lacks from Google Books', async () => {
    const both = fakeOpenLibrary({
      ...bareEdition,
      [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN),
    });

    const result = await lookupBook(DUNE_ISBN, { fetch: both.fetch });

    expect(result).toEqual({
      kind: 'found',
      candidate: {
        isbn13: DUNE_ISBN,
        title: 'Dune (OL)',
        authors: ['Frank Herbert'],
        genres: ['Fiction', 'Science Fiction'],
        publisher: 'Laffont',
        year: 2021,
        pages: 928,
        description: 'Sur Arrakis, la planète des sables.\n\nPaul Atréides…',
        coverSourceUrl: GOOGLE_COVER,
      },
    });
  });

  it('keeps the longest description, without HTML and capped', async () => {
    const long = `<p>${'Une très longue quatrième de couverture. '.repeat(400)}</p>`;
    const both = fakeOpenLibrary({
      ...duneRoutes(),
      [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN, { description: long }),
    });

    const result = await lookupBook(DUNE_ISBN, { fetch: both.fetch });

    if (result.kind !== 'found') throw new Error(result.kind);
    expect(result.candidate.description).toHaveLength(LIMITS.description);
    expect(result.candidate.description).toMatch(/^Une très longue quatrième/);
    expect(result.candidate.description).not.toContain('<');
  });

  it('uses Google Books alone when Open Library does not know the ISBN', async () => {
    const gb = fakeOpenLibrary({ [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN) });
    expect(await lookupBook(DUNE_ISBN, { fetch: gb.fetch })).toMatchObject({
      kind: 'found',
      candidate: { title: 'Dune', coverSourceUrl: GOOGLE_COVER },
    });
  });

  it('answers found when one source fails and the other knows the book', async () => {
    const olDown = fakeOpenLibrary({
      [EDITION]: new Error('offline'),
      [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN),
    });
    expect((await lookupBook(DUNE_ISBN, { fetch: olDown.fetch })).kind).toBe('found');

    const gbDown = fakeOpenLibrary({
      ...duneRoutes(),
      [googleBooksUrl(DUNE_ISBN)]: new Response('quota', { status: 429 }),
    });
    expect(await lookupBook(DUNE_ISBN, { fetch: gbDown.fetch })).toMatchObject({
      kind: 'found',
      candidate: { title: 'Dune', coverSourceUrl: OL_COVER },
    });
  });

  it('answers not_found only when both do not know the ISBN', async () => {
    const neither = fakeOpenLibrary({ [googleBooksUrl(DUNE_ISBN)]: googleNothing });
    expect(await lookupBook(DUNE_ISBN, { fetch: neither.fetch })).toEqual({ kind: 'not_found' });

    const oneDown = fakeOpenLibrary({ [googleBooksUrl(DUNE_ISBN)]: new Error('offline') });
    expect(await lookupBook(DUNE_ISBN, { fetch: oneDown.fetch })).toEqual({
      kind: 'unavailable',
    });
  });

  it('answers unavailable when both fail', async () => {
    const down = fakeOpenLibrary({
      [EDITION]: new Error('offline'),
      [googleBooksUrl(DUNE_ISBN)]: new Error('offline'),
    });
    expect(await lookupBook(DUNE_ISBN, { fetch: down.fetch })).toEqual({ kind: 'unavailable' });
  });
});
