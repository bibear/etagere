import {
  isBookEan,
  isIsbnBarcode,
  isValidIsbn10,
  isValidIsbn13,
  isbn10To13,
  normalizeIsbn,
  stripIsbn,
} from '../isbn';

describe('stripIsbn', () => {
  it('removes spaces and hyphens and upper-cases x', () => {
    expect(stripIsbn(' 0-8044-2957-x ')).toBe('080442957X');
  });
});

describe('isValidIsbn10', () => {
  it.each(['2070612759', '080442957X'])('accepts %s', (value) => {
    expect(isValidIsbn10(value)).toBe(true);
  });

  it.each([
    ['2070612758', 'wrong check digit'],
    ['207061275', '9 characters'],
    ['20706127590', '11 characters'],
    ['X070612756', 'X not in last position'],
    ['207061275a', 'letter'],
  ])('rejects %s (%s)', (value) => {
    expect(isValidIsbn10(value)).toBe(false);
  });
});

describe('isValidIsbn13 / isBookEan', () => {
  it.each(['9782070612758', '9799999999990'])('accepts %s', (value) => {
    expect(isValidIsbn13(value)).toBe(true);
  });

  it.each([
    ['9782070612759', 'wrong check digit'],
    ['978207061275', '12 digits'],
    ['97820706127580', '14 digits'],
    ['9770000000003', 'good checksum but 977 prefix'],
    ['978207061275X', 'X in an ISBN-13'],
  ])('rejects %s (%s)', (value) => {
    expect(isValidIsbn13(value)).toBe(false);
  });

  it.each([
    ['9780000000000', true],
    ['9790000000000', true],
    ['9770000000000', false],
    ['9800000000000', false],
    ['978000000000', false],
  ])('isBookEan(%s) is %s', (value, expected) => {
    expect(isBookEan(value)).toBe(expected);
  });
});

describe('isbn10To13', () => {
  it('prefixes 978 and recomputes the check digit', () => {
    expect(isbn10To13('2070612759')).toBe('9782070612758');
    expect(isbn10To13('080442957X')).toBe('9780804429573');
  });
});

describe('normalizeIsbn', () => {
  it.each([
    ['9782070612758', '9782070612758'],
    ['978-2-07-061275-8', '9782070612758'],
    ['978 2 07 061275 8', '9782070612758'],
    ['2070612759', '9782070612758'],
    ['2-07-061275-9', '9782070612758'],
    ['080442957x', '9780804429573'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeIsbn(input)).toBe(expected);
  });

  it.each(['', '12345', '2070612758', '9782070612759', '978.2.07.061275.8', '69782070612758'])(
    'rejects %j',
    (input) => {
      expect(normalizeIsbn(input)).toBeNull();
    },
  );

  it('is idempotent', () => {
    const once = normalizeIsbn('2070612759') as string;
    expect(normalizeIsbn(once)).toBe(once);
  });
});

describe('isIsbnBarcode', () => {
  it.each([
    ['9782070612758', true],
    ['9782070612759', false],
    ['3017620422003', false], // a grocery EAN-13
    ['2070612759', false], // ISBN-10 is never printed as a barcode
  ])('%s → %s', (payload, expected) => {
    expect(isIsbnBarcode(payload)).toBe(expected);
  });
});
