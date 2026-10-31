import type { Locale } from '@etagere/shared';

import type { TFunction } from './I18nProvider';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Date of a comment as in the design: relative for the last week ("il y a 2 j"), then the day
 * and month ("12 sept."), with the year when it is not the current one.
 */
export function formatRelativeDate(
  iso: string,
  now: number,
  locale: Locale,
  t: TFunction,
  /** IANA zone for the absolute form; the device's zone by default. */
  timeZone?: string,
): string {
  const date = new Date(iso);
  const elapsed = now - date.getTime();
  if (Number.isNaN(elapsed)) return '';
  if (elapsed < MINUTE) return t('dates.justNow');
  if (elapsed < HOUR) return t('dates.minutesAgo', { count: Math.floor(elapsed / MINUTE) });
  if (elapsed < DAY) return t('dates.hoursAgo', { count: Math.floor(elapsed / HOUR) });
  if (elapsed < 7 * DAY) return t('dates.daysAgo', { count: Math.floor(elapsed / DAY) });
  const tag = locale === 'fr' ? 'fr-FR' : 'en-GB';
  const year = (value: Date) =>
    new Intl.DateTimeFormat(tag, { year: 'numeric', timeZone }).format(value);
  const sameYear = year(date) === year(new Date(now));
  return new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone,
  }).format(date);
}
