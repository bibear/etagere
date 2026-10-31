import type { fr } from './fr';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Shape every dictionary must have: the keys of the French reference, string values. */
export type Dictionary = Widen<typeof fr>;

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`;
type StripPlural<K extends string> = K extends `${infer Base}_${'one' | 'other'}` ? Base : K;

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, StripPlural<K>> : Paths<T[K], Join<P, K>>;
}[keyof T & string];

/** Every translatable key, as a dot path (`library.title`); plural keys without their suffix. */
export type TranslationKey = Paths<typeof fr>;

export type Locale = 'fr' | 'en';

export type TranslateParams = Record<string, string | number>;
