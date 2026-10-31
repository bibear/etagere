import {
  type Locale,
  type TranslateParams,
  type TranslationKey,
  pickLocale,
  translate,
} from '@etagere/shared';
import { getLocales } from 'expo-localization';
import { type ReactNode, createContext, useCallback, useContext, useMemo } from 'react';

export type TFunction = (key: TranslationKey, params?: TranslateParams) => string;

interface I18n {
  locale: Locale;
  t: TFunction;
}

/** The device's preferred language, French or English (English otherwise). */
export function deviceLocale(): Locale {
  try {
    return pickLocale(getLocales().map((locale) => locale.languageTag));
  } catch {
    return 'en';
  }
}

const I18nContext = createContext<I18n>({
  locale: 'en',
  t: (key, params) => translate('en', key, params),
});

export function I18nProvider({ children, locale }: { children: ReactNode; locale?: Locale }) {
  const resolved = useMemo(() => locale ?? deviceLocale(), [locale]);
  const t = useCallback<TFunction>((key, params) => translate(resolved, key, params), [resolved]);
  const value = useMemo(() => ({ locale: resolved, t }), [resolved, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const { t, locale } = useI18n(); t('library.title')` */
export const useI18n = (): I18n => useContext(I18nContext);
