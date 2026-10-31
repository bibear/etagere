import type { BookCandidate, BookDetail } from '@etagere/shared';

import {
  bookInputFromForm,
  bookPatchFromForm,
  emptyBookForm,
  fieldsFromPaths,
  formFromBook,
  mergeCandidate,
  splitList,
} from '../books/bookForm';

const form = (overrides: Partial<ReturnType<typeof emptyBookForm>> = {}) => ({
  ...emptyBookForm(),
  ...overrides,
});

describe('bookInputFromForm', () => {
  it('builds a BookInput: lists split, blanks to null, numbers parsed', () => {
    const result = bookInputFromForm(
      form({
        title: '  Le Nom du vent ',
        authors: 'Patrick Rothfuss, ',
        genres: 'Fantasy; Aventure',
        year: '2009',
        pages: ' 662 ',
        publisher: '  ',
      }),
    );
    expect(result).toEqual({
      ok: true,
      input: {
        isbn13: null,
        title: 'Le Nom du vent',
        authors: ['Patrick Rothfuss'],
        genres: ['Fantasy', 'Aventure'],
        publisher: null,
        year: 2009,
        pages: 662,
        description: null,
        coverSourceUrl: null,
      },
    });
  });

  it('normalises an ISBN-10 to ISBN-13', () => {
    const result = bookInputFromForm(form({ title: 'X', isbn: '2-266-11156-6' }));
    expect(result.ok && result.input.isbn13).toBe('9782266111560');
  });

  it('requires a title', () => {
    expect(bookInputFromForm(form({ title: '   ' }))).toEqual({
      ok: false,
      errors: { title: 'required' },
    });
  });

  it('flags an invalid ISBN, year and page count', () => {
    const result = bookInputFromForm(
      form({ title: 'X', isbn: '9782266111561', year: '20x9', pages: '-3' }),
    );
    expect(result).toEqual({
      ok: false,
      errors: { isbn: 'invalid', year: 'invalid', pages: 'invalid' },
    });
  });

  it('applies the shared limits (more than 300 characters of title)', () => {
    const result = bookInputFromForm(form({ title: 'a'.repeat(301) }));
    expect(result).toEqual({ ok: false, errors: { title: 'invalid' } });
  });
});

describe('form helpers', () => {
  it('splits lists on commas, semicolons and new lines', () => {
    expect(splitList('A, B;C\n\n , D')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('maps API paths to form fields', () => {
    expect(fieldsFromPaths(['isbn13', 'authors.2', 'unknown'])).toEqual({
      isbn: 'invalid',
      authors: 'invalid',
    });
  });

  it('prefills from a book', () => {
    const book = {
      isbn13: null,
      title: 'Dune',
      authors: ['Frank Herbert'],
      genres: ['SF', 'Classique'],
      publisher: null,
      year: 1965,
      pages: null,
      description: 'Arrakis',
    } as unknown as BookDetail;
    expect(formFromBook(book)).toEqual({
      isbn: '',
      title: 'Dune',
      authors: 'Frank Herbert',
      genres: 'SF, Classique',
      publisher: '',
      year: '1965',
      pages: '',
      description: 'Arrakis',
      coverSourceUrl: null,
    });
  });

  it('merges a lookup candidate, keeping typed values the candidate lacks', () => {
    const candidate: BookCandidate = {
      isbn13: '9782352940159',
      title: 'Le Nom du vent',
      authors: ['Patrick Rothfuss'],
      genres: [],
      publisher: 'Bragelonne',
      year: null,
      coverSourceUrl: 'https://covers.openlibrary.org/b/isbn/9782352940159-L.jpg',
    };
    expect(
      mergeCandidate(form({ isbn: '978-2-35294-015-9', genres: 'Fantasy' }), candidate),
    ).toEqual(
      form({
        isbn: '9782352940159',
        title: 'Le Nom du vent',
        authors: 'Patrick Rothfuss',
        genres: 'Fantasy',
        publisher: 'Bragelonne',
        coverSourceUrl: 'https://covers.openlibrary.org/b/isbn/9782352940159-L.jpg',
      }),
    );
  });

  describe('edit', () => {
    const book = {
      id: 'b1',
      isbn13: '9782070360536',
      title: 'Vol de nuit',
      authors: ['Saint-Exupéry, Antoine de'],
      genres: ['Fiction, science fiction, general', 'Aviation'],
      publisher: null,
      year: 1931,
      pages: null,
      description: null,
    } as unknown as BookDetail;

    it('sends only the changed fields, never re-splitting untouched lists', () => {
      const values = { ...formFromBook(book), title: 'Vol de nuit (Folio)' };
      const result = bookInputFromForm(values, book);
      if (!result.ok) throw new Error('form should be valid');

      expect(result.input.genres).toEqual(['Fiction, science fiction, general', 'Aviation']);
      expect(result.input.authors).toEqual(['Saint-Exupéry, Antoine de']);
      expect(bookPatchFromForm(book, values, result.input)).toEqual({
        title: 'Vol de nuit (Folio)',
      });
    });

    it('splits a list the member edited, and sends cleared fields as null', () => {
      const values = { ...formFromBook(book), genres: 'Aviation; Classique', year: '' };
      const result = bookInputFromForm(values, book);
      if (!result.ok) throw new Error('form should be valid');

      expect(bookPatchFromForm(book, values, result.input)).toEqual({
        genres: ['Aviation', 'Classique'],
        year: null,
      });
    });

    it('sends nothing when nothing changed, and never the cover', () => {
      const values = {
        ...formFromBook(book),
        coverSourceUrl: 'https://covers.openlibrary.org/b/isbn/9782070360536-L.jpg',
      };
      const result = bookInputFromForm(values, book);
      if (!result.ok) throw new Error('form should be valid');
      expect(bookPatchFromForm(book, values, result.input)).toEqual({});
    });
  });
});
