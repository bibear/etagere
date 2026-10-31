import { translate } from '@etagere/shared';

import { formatRelativeDate } from '../i18n/dates';
import type { TFunction } from '../i18n/I18nProvider';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const tFor =
  (locale: 'fr' | 'en'): TFunction =>
  (key, params) =>
    translate(locale, key, params);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('formatRelativeDate', () => {
  it.each([
    [ago(20_000), "à l'instant", 'just now'],
    [ago(5 * 60_000), 'il y a 5 min', '5 min ago'],
    [ago(3 * 3_600_000), 'il y a 3 h', '3 h ago'],
    [ago(2 * 86_400_000), 'il y a 2 j', '2 d ago'],
    ['2026-09-12T08:00:00.000Z', '12 sept.', '12 Sept'],
    ['2025-08-03T08:00:00.000Z', '3 août 2025', '3 Aug 2025'],
  ])('formats %s', (iso, fr, en) => {
    expect(formatRelativeDate(iso, NOW, 'fr', tFor('fr'), 'UTC')).toBe(fr);
    expect(formatRelativeDate(iso, NOW, 'en', tFor('en'), 'UTC')).toBe(en);
  });
});
