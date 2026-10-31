import {
  coverFromImageLinks,
  genresFromCategories,
  lookupGoogleBooks,
  plainText,
} from '../google-books';
import {
  DUNE_ISBN,
  GOOGLE_COVER,
  fakeOpenLibrary,
  googleBooksUrl,
  googleNothing,
  googleVolume,
} from './support/open-library';

describe('Google Books lookup', () => {
  it('maps the volume to a candidate, without HTML and with an https cover', async () => {
    const gb = fakeOpenLibrary({ [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN) });

    expect(await lookupGoogleBooks(DUNE_ISBN, { fetch: gb.fetch })).toEqual({
      kind: 'found',
      candidate: {
        isbn13: DUNE_ISBN,
        title: 'Dune',
        authors: ['Frank Herbert'],
        genres: ['Fiction', 'Science Fiction'],
        publisher: 'Pocket',
        year: 2021,
        pages: 928,
        description: 'Sur Arrakis, la planète des sables.\n\nPaul Atréides…',
        coverSourceUrl: GOOGLE_COVER,
      },
    });
    expect(gb.requests).toEqual([
      'https://www.googleapis.com/books/v1/volumes?q=isbn:9782266320481',
    ]);
  });

  it('picks the volume that carries the ISBN among several results', async () => {
    const body = googleVolume(DUNE_ISBN);
    const other = { volumeInfo: { title: 'Le Messie de Dune', industryIdentifiers: [] } };
    const gb = fakeOpenLibrary({
      [googleBooksUrl(DUNE_ISBN)]: { ...body, totalItems: 2, items: [other, ...body.items] },
    });
    const result = await lookupGoogleBooks(DUNE_ISBN, { fetch: gb.fetch });
    expect(result).toMatchObject({ kind: 'found', candidate: { title: 'Dune' } });
  });

  it('answers not_found when there is no item, or no title', async () => {
    const empty = fakeOpenLibrary({ [googleBooksUrl(DUNE_ISBN)]: googleNothing });
    expect(await lookupGoogleBooks(DUNE_ISBN, { fetch: empty.fetch })).toEqual({
      kind: 'not_found',
    });
    const untitled = fakeOpenLibrary({
      [googleBooksUrl(DUNE_ISBN)]: googleVolume(DUNE_ISBN, { title: '  ' }),
    });
    expect(await lookupGoogleBooks(DUNE_ISBN, { fetch: untitled.fetch })).toEqual({
      kind: 'not_found',
    });
  });

  it.each([
    ['a network failure', new Error('ECONNREFUSED')],
    ['a quota error', new Response('{"error":{"code":429}}', { status: 429 })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
  ])('answers unavailable on %s', async (_label, route) => {
    const gb = fakeOpenLibrary({ [googleBooksUrl(DUNE_ISBN)]: route });
    expect(await lookupGoogleBooks(DUNE_ISBN, { fetch: gb.fetch })).toEqual({
      kind: 'unavailable',
    });
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
    expect(await lookupGoogleBooks(DUNE_ISBN, { fetch: hanging, timeoutMs: 20 })).toEqual({
      kind: 'unavailable',
    });
    expect(aborted).toBe(true);
  });
});

describe('plainText', () => {
  it('turns HTML into readable text', () => {
    expect(
      plainText(
        '<p>Un <i>roman</i> culte&nbsp;!</p><p>L&#39;épice &amp; le désert<br/>— Herbert</p><script>x()</script>',
      ),
    ).toBe("Un roman culte !\n\nL'épice & le désert\n— Herbert");
    expect(plainText('Déjà  du   texte\r\nsimple')).toBe('Déjà du texte\nsimple');
    expect(plainText('<p> </p>')).toBeNull();
    expect(plainText(null)).toBeNull();
  });
});

describe('coverFromImageLinks', () => {
  it('takes the largest image, over https, zoom=1 and without the page curl', () => {
    expect(
      coverFromImageLinks({
        thumbnail: 'http://books.google.com/books/content?id=X&zoom=1&edge=curl',
        large: 'http://books.google.com/books/content?id=X&zoom=4&edge=curl',
      }),
    ).toBe('https://books.google.com/books/content?id=X&zoom=1');
    expect(
      coverFromImageLinks({ thumbnail: 'https://books.googleusercontent.com/content?id=Y' }),
    ).toBe('https://books.googleusercontent.com/content?id=Y&zoom=1');
  });

  it('refuses images from other hosts and anything that is not a link', () => {
    expect(coverFromImageLinks({ thumbnail: 'https://evil.example/cover.jpg' })).toBeNull();
    expect(coverFromImageLinks({ thumbnail: 'not a url' })).toBeNull();
    expect(coverFromImageLinks('http://books.google.com/x')).toBeNull();
    expect(coverFromImageLinks(undefined)).toBeNull();
  });
});

describe('genresFromCategories', () => {
  it('splits the category paths and drops "General"', () => {
    expect(
      genresFromCategories(['Fiction / Science Fiction / General', 'fiction', 'Juvenile Fiction']),
    ).toEqual(['Fiction', 'Science Fiction', 'Juvenile Fiction']);
    expect(genresFromCategories(null)).toEqual([]);
  });
});
