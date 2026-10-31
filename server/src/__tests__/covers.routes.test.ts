import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BookDetail } from '@etagere/shared';

import { type TestApp, buildTestApp } from './support/test-app';
import { DUNE_ISBN, JPEG, duneRoutes, fakeOpenLibrary } from './support/open-library';

const COVER = `https://covers.openlibrary.org/b/isbn/${DUNE_ISBN}-L.jpg?default=false`;
const OTHER_COVER = 'https://covers.openlibrary.org/b/id/42-L.jpg';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('local covers', () => {
  let t: TestApp;
  let dataDir: string;
  let me: string;

  const setup = (routes = duneRoutes()) => {
    dataDir = mkdtempSync(join(tmpdir(), 'etagere-covers-'));
    t = buildTestApp({ dataDir, fetch: fakeOpenLibrary(routes).fetch });
    me = t.seedProfile();
  };

  afterEach(async () => {
    await t.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const createBook = async (coverSourceUrl: string | null): Promise<BookDetail> => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { 'x-etagere-profile': me },
      payload: { isbn13: DUNE_ISBN, title: 'Dune', authors: ['Frank Herbert'], coverSourceUrl },
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  };

  const coverFile = (book: BookDetail) => join(dataDir, 'covers', `${book.id}.jpg`);

  it('downloads the cover at creation and serves the local copy', async () => {
    setup();
    const book = await createBook(COVER);

    expect(book.coverUrl).toBe(`/api/covers/${book.id}.jpg`);
    expect(readFileSync(coverFile(book))).toEqual(Buffer.from(JPEG));

    const served = await t.app.inject({ method: 'GET', url: book.coverUrl ?? '' });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.rawPayload).toEqual(Buffer.from(JPEG));

    const again = await t.app.inject({
      method: 'GET',
      url: book.coverUrl ?? '',
      headers: { 'if-none-match': String(served.headers.etag) },
    });
    expect(again.statusCode).toBe(304);
  });

  it('creates the book without a cover when the download fails or is not an image', async () => {
    setup({
      ...duneRoutes(),
      [COVER]: new Response('<html>no</html>', { status: 200 }),
    });
    const book = await createBook(COVER);
    expect(book.coverUrl).toBeNull();
    expect(existsSync(coverFile(book))).toBe(false);
  });

  it('creates the book without a cover when Open Library has none (404)', async () => {
    setup({});
    expect((await createBook(COVER)).coverUrl).toBeNull();
  });

  it('replaces the cover on PATCH with a new URL and removes it with null', async () => {
    setup({ ...duneRoutes(), [OTHER_COVER]: new Response(PNG, { status: 200 }) });
    const book = await createBook(COVER);
    const patch = (coverSourceUrl: string | null) =>
      t.app.inject({
        method: 'PATCH',
        url: `/api/books/${book.id}`,
        headers: { 'x-etagere-profile': me },
        payload: { coverSourceUrl },
      });

    const replaced = await patch(OTHER_COVER);
    expect(replaced.json().coverUrl).toBe(`/api/covers/${book.id}.jpg`);
    const served = await t.app.inject({ method: 'GET', url: `/api/covers/${book.id}.jpg` });
    expect(served.headers['content-type']).toBe('image/png');

    const removed = await patch(null);
    expect(removed.json().coverUrl).toBeNull();
    expect(existsSync(coverFile(book))).toBe(false);
  });

  it('deletes the cover file with the book', async () => {
    setup();
    const book = await createBook(COVER);
    await t.app.inject({
      method: 'DELETE',
      url: `/api/books/${book.id}`,
      headers: { 'x-etagere-profile': me },
    });
    expect(existsSync(coverFile(book))).toBe(false);
  });

  it('answers 404 for unknown or malformed cover names', async () => {
    setup();
    for (const url of [
      '/api/covers/0b8e1c1e-4a40-4d6e-9d55-1c7c1f0e2a11.jpg',
      '/api/covers/..%2Fetagere.sqlite',
      '/api/covers/notes.txt',
    ]) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ code: 'not_found' });
    }
  });
});
