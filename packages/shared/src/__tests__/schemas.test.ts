import {
  LIMITS,
  bookInputSchema,
  bookPatchSchema,
  booksQuerySchema,
  commentInputSchema,
  loanInputSchema,
  profileInputSchema,
  uuidSchema,
} from '../schemas';

const book = { title: 'Dune', authors: ['Frank Herbert'] };

describe('profileInputSchema', () => {
  it('trims the name', () => {
    expect(profileInputSchema.parse({ name: '  Bruno ', color: '#1F6B4A' })).toEqual({
      name: 'Bruno',
      color: '#1F6B4A',
    });
  });

  it.each([
    ['empty name', { name: '   ', color: '#1F6B4A' }],
    ['name too long', { name: 'a'.repeat(LIMITS.profileName + 1), color: '#1F6B4A' }],
    ['bad color', { name: 'Bruno', color: 'green' }],
    ['unknown key', { name: 'Bruno', color: '#1F6B4A', admin: true }],
  ])('rejects %s', (_label, input) => {
    expect(profileInputSchema.safeParse(input).success).toBe(false);
  });

  it('accepts a name of exactly the maximum length', () => {
    const name = 'a'.repeat(LIMITS.profileName);
    expect(profileInputSchema.parse({ name, color: '#1F6B4A' }).name).toBe(name);
  });
});

describe('bookInputSchema', () => {
  it('accepts a minimal manual book', () => {
    expect(bookInputSchema.parse(book)).toEqual(book);
  });

  it('normalises the ISBN to ISBN-13', () => {
    expect(bookInputSchema.parse({ ...book, isbn13: '2-07-061275-9' }).isbn13).toBe(
      '9782070612758',
    );
  });

  it('turns blank optional text into null', () => {
    expect(bookInputSchema.parse({ ...book, publisher: '  ' }).publisher).toBeNull();
  });

  it.each([
    ['empty title', { ...book, title: '' }],
    ['title too long', { ...book, title: 'a'.repeat(LIMITS.title + 1) }],
    ['too many authors', { ...book, authors: Array(LIMITS.authors + 1).fill('A') }],
    ['invalid isbn', { ...book, isbn13: '9782070612759' }],
    ['non-integer year', { ...book, year: 1965.5 }],
    ['zero pages', { ...book, pages: 0 }],
    ['cover from another host', { ...book, coverSourceUrl: 'https://evil.example/x.jpg' }],
    ['unknown key', { ...book, id: 'x' }],
  ])('rejects %s', (_label, input) => {
    expect(bookInputSchema.safeParse(input).success).toBe(false);
  });

  it('accepts exactly the maximum lengths', () => {
    const input = {
      title: 'a'.repeat(LIMITS.title),
      authors: Array(LIMITS.authors).fill('A'),
      coverSourceUrl: 'https://covers.openlibrary.org/b/isbn/9782070612758-L.jpg',
    };
    expect(bookInputSchema.safeParse(input).success).toBe(true);
  });
});

describe('bookPatchSchema', () => {
  it('accepts a single field', () => {
    expect(bookPatchSchema.parse({ year: 1965 })).toEqual({ year: 1965 });
  });

  it('rejects an empty patch', () => {
    expect(bookPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('booksQuerySchema', () => {
  it('applies defaults', () => {
    expect(booksQuerySchema.parse({})).toEqual({ query: '', filter: 'all', sort: 'added' });
  });

  it('rejects an unknown filter', () => {
    expect(booksQuerySchema.safeParse({ filter: 'mine' }).success).toBe(false);
  });
});

describe('loan and comment inputs', () => {
  it.each([
    [LIMITS.borrower, true],
    [LIMITS.borrower + 1, false],
    [0, false],
  ])('borrower of length %i valid: %s', (length, valid) => {
    expect(loanInputSchema.safeParse({ borrower: 'b'.repeat(length) }).success).toBe(valid);
  });

  it.each([
    [LIMITS.comment, true],
    [LIMITS.comment + 1, false],
    [0, false],
  ])('comment of length %i valid: %s', (length, valid) => {
    expect(commentInputSchema.safeParse({ text: 'c'.repeat(length) }).success).toBe(valid);
  });
});

describe('uuidSchema', () => {
  it('accepts a v4 uuid and rejects garbage', () => {
    expect(uuidSchema.safeParse('3b241101-e2bb-4255-8caf-4136c566a962').success).toBe(true);
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
