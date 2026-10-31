import { en, fr, pickLocale, translate } from '../i18n';

const keysOf = (node: object, prefix = ''): string[] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keysOf(value as object, `${prefix}${key}.`),
  );

describe('dictionaries', () => {
  it('FR and EN have exactly the same keys', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(fr).sort());
  });

  it('every placeholder of a FR string exists in its EN counterpart', () => {
    const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    const flat = (node: object): Record<string, string> =>
      Object.fromEntries(
        keysOf(node).map((k) => [
          k,
          k.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], node) as string,
        ]),
      );
    const frFlat = flat(fr);
    const enFlat = flat(en);
    for (const key of Object.keys(frFlat)) {
      expect([key, placeholders(enFlat[key] as string)]).toEqual([
        key,
        placeholders(frFlat[key] as string),
      ]);
    }
  });

  it('no string is empty', () => {
    expect(keysOf(fr).length).toBeGreaterThan(0);
    for (const dictionary of [fr, en]) {
      const values = JSON.stringify(dictionary);
      expect(values).not.toContain('""');
    }
  });
});

describe('translate', () => {
  it('returns the string of the locale', () => {
    expect(translate('fr', 'tabs.library')).toBe('Biblio');
    expect(translate('en', 'tabs.library')).toBe('Library');
  });

  it('interpolates parameters', () => {
    expect(translate('en', 'availability.readingBy', { name: 'Jules' })).toBe('Jules is reading');
  });

  it('keeps unknown placeholders visible', () => {
    expect(translate('en', 'availability.readingBy')).toBe('{{name}} is reading');
  });

  it.each([
    ['fr', 0, '0 livre'],
    ['fr', 1, '1 livre'],
    ['fr', 2, '2 livres'],
    ['en', 0, '0 books'],
    ['en', 1, '1 book'],
    ['en', 2, '2 books'],
  ] as const)('pluralises in %s for %i', (locale, count, expected) => {
    expect(translate(locale, 'library.bookCount', { count })).toBe(expected);
  });

  it('returns the key itself when it is unknown', () => {
    // @ts-expect-error unknown key on purpose
    expect(translate('fr', 'nope.missing')).toBe('nope.missing');
  });
});

describe('pickLocale', () => {
  it.each([
    [['fr-FR'], 'fr'],
    [['fr_CA'], 'fr'],
    [['de-DE', 'fr-FR', 'en-US'], 'fr'],
    [['en-GB', 'fr-FR'], 'en'],
    [['de-DE'], 'en'],
    [[], 'en'],
  ])('%j → %s', (tags, expected) => {
    expect(pickLocale(tags)).toBe(expected);
  });
});
