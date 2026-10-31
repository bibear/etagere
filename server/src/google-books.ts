import { type BookCandidate, LIMITS, isCoverSourceUrl } from '@etagere/shared';

import {
  type Json,
  LOOKUP_TIMEOUT_MS,
  type LookupResult,
  type OpenLibraryDeps,
  Unavailable,
  genresFrom,
  isObject,
  pagesOf,
  str,
  yearOf,
} from './open-library';

// Google Books client, second source of the ISBN lookup (docs/ARCHITECTURE.md § Books).
// One public request without API key: `volumes?q=isbn:<isbn13>`. Only the ISBN leaves the house.
// Everything received is checked before use: it is outside data.

export const GOOGLE_BOOKS = 'https://www.googleapis.com/books/v1/volumes';

export const googleBooksUrlFor = (isbn13: string): string => `${GOOGLE_BOOKS}?q=isbn:${isbn13}`;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#')) {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });

/**
 * Plain text of an HTML fragment (Google Books descriptions carry `<p>`, `<br>`, `<b>`…):
 * paragraphs and line breaks become new lines, other tags go, entities are decoded, spaces
 * collapsed. Null when nothing readable is left.
 */
export function plainText(html: string | null): string | null {
  if (html === null) return null;
  const text = decodeEntities(
    html
      .replace(/\r\n?/g, '\n')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text === '' ? null : text;
}

const IMAGE_SIZES = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail'];

/**
 * The largest image of `imageLinks`, made fit to download: https, `zoom=1`, no `edge=curl`
 * (the page-curl effect). Null when there is none or it is not on a Google Books image host.
 */
export function coverFromImageLinks(imageLinks: unknown): string | null {
  if (!isObject(imageLinks)) return null;
  for (const size of IMAGE_SIZES) {
    const link = str(imageLinks[size]);
    if (link === null) continue;
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    if (url.protocol === 'http:') url.protocol = 'https:';
    url.searchParams.delete('edge');
    url.searchParams.set('zoom', '1');
    const cover = url.toString();
    if (isCoverSourceUrl(cover) && cover.length <= 500) return cover;
  }
  return null;
}

/** Google Books categories ("Fiction / Science Fiction / General") as up to 5 genres. */
export function genresFromCategories(categories: unknown): string[] {
  if (!Array.isArray(categories)) return [];
  const parts = categories
    .filter((category): category is string => typeof category === 'string')
    .flatMap((category) => category.split('/'))
    .map((part) => part.trim())
    .filter((part) => part !== '' && !/^general$/i.test(part));
  return genresFrom(parts);
}

const identifiersOf = (volumeInfo: Json): string[] =>
  Array.isArray(volumeInfo.industryIdentifiers)
    ? volumeInfo.industryIdentifiers
        .filter(isObject)
        .map((id) => str(id.identifier))
        .filter((id): id is string => id !== null)
    : [];

/** The volume of the ISBN among the results (the first one when none names it). */
function pickVolume(items: unknown, isbn13: string): Json | null {
  if (!Array.isArray(items)) return null;
  const infos = items
    .filter(isObject)
    .map((item) => item.volumeInfo)
    .filter(isObject);
  const isbn10 = isbn13.startsWith('978') ? isbn13.slice(3, 12) : null;
  return (
    infos.find((info) =>
      identifiersOf(info).some(
        (id) => id === isbn13 || (isbn10 !== null && id.slice(0, 9) === isbn10 && id.length === 10),
      ),
    ) ??
    infos[0] ??
    null
  );
}

export async function lookupGoogleBooks(
  isbn13: string,
  deps: OpenLibraryDeps,
): Promise<LookupResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Unavailable('timeout'));
    }, deps.timeoutMs ?? LOOKUP_TIMEOUT_MS);
  });

  const request = async (): Promise<Json | null> => {
    let response: Response;
    try {
      response = await deps.fetch(googleBooksUrlFor(isbn13), {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
    } catch {
      throw new Unavailable('network');
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Unavailable(`status ${response.status}`);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Unavailable('not json');
    }
    if (!isObject(body)) throw new Unavailable('not an object');
    return body;
  };

  try {
    const body = await Promise.race([request(), deadline]);
    const info = body === null ? null : pickVolume(body.items, isbn13);
    const title = info ? str(info.title) : null;
    if (info === null || title === null) return { kind: 'not_found' };

    const authors = Array.isArray(info.authors)
      ? info.authors
          .map(str)
          .filter((name): name is string => name !== null)
          .slice(0, LIMITS.authors)
          .map((name) => name.slice(0, LIMITS.author))
      : [];
    const description = plainText(str(info.description));

    return {
      kind: 'found',
      candidate: {
        isbn13,
        title: title.slice(0, LIMITS.title),
        authors,
        genres: genresFromCategories(info.categories),
        publisher: str(info.publisher)?.slice(0, LIMITS.publisher) ?? null,
        year: yearOf(info.publishedDate),
        pages: pagesOf(info.pageCount),
        description: description?.slice(0, LIMITS.description) ?? null,
        coverSourceUrl: coverFromImageLinks(info.imageLinks),
      } satisfies BookCandidate,
    };
  } catch (error) {
    if (error instanceof Unavailable) return { kind: 'unavailable' };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
