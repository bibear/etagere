import { en } from './en';
import { fr } from './fr';
import type { Dictionary, Locale, TranslateParams, TranslationKey } from './types';

export type { Dictionary, Locale, TranslateParams, TranslationKey } from './types';
export { en, fr };

export const LOCALES: Record<Locale, Dictionary> = { fr, en };

/** Picks the first supported language among the device's preferred ones; English otherwise. */
export function pickLocale(languageTags: readonly string[]): Locale {
  for (const tag of languageTags) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === 'fr' || language === 'en') return language;
  }
  return 'en';
}

// French treats 0 and 1 as singular; English only 1.
const pluralSuffix = (locale: Locale, count: number): 'one' | 'other' =>
  (locale === 'fr' ? Math.abs(count) < 2 : count === 1) ? 'one' : 'other';

const lookup = (dictionary: Dictionary, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : null,
      dictionary,
    );

/**
 * Translates a key. Plural keys take the form `key_one` / `key_other` in the dictionary and are
 * resolved from `params.count`. Unknown keys return the key itself (visible, never a crash).
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params: TranslateParams = {},
): string {
  const dictionary = LOCALES[locale];
  let template = lookup(dictionary, key);
  if (typeof template !== 'string' && typeof params.count === 'number') {
    template = lookup(dictionary, `${key}_${pluralSuffix(locale, params.count)}`);
  }
  if (typeof template !== 'string') return key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
