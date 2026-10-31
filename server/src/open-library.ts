import { type BookCandidate, LIMITS } from '@etagere/shared';

// Open Library client for the ISBN lookup (docs/ARCHITECTURE.md § Books).
// Edition `/isbn/{isbn}.json`, then its authors and its work (subjects → genres), all within
// one deadline. Everything received is checked before use: it is outside data.

export const OPEN_LIBRARY = 'https://openlibrary.org';
export const LOOKUP_TIMEOUT_MS = 5000;
const MAX_GENRES = 5;

export const coverSourceUrlFor = (isbn13: string): string =>
  `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`;

export type LookupResult =
  { kind: 'found'; candidate: BookCandidate } | { kind: 'not_found' } | { kind: 'unavailable' };

export interface OpenLibraryDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
}

class Unavailable extends Error {}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const textOf = (value: unknown): string | null =>
  str(value) ?? (isObject(value) ? str(value.value) : null);

const keysOf = (value: unknown, pick: (item: Json) => unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter(isObject)
        .map(pick)
        .filter((key): key is string => typeof key === 'string' && /^\/[a-z]+\/OL\w+$/.test(key))
    : [];

// Subjects that describe the copy or the catalogue, not the book.
const NOT_GENRES =
  /^(accessible book|protected daisy|in library|lending library|large type books|open library staff picks|overdrive|internet archive wishlist|long now manual for civilization)$/i;

/** Up to 5 distinct, readable subjects (no `nyt:…`-style tags) as genres. */
export function genresFrom(subjects: unknown): string[] {
  if (!Array.isArray(subjects)) return [];
  const genres: string[] = [];
  const seen = new Set<string>();
  for (const subject of subjects) {
    const value = str(subject);
    if (value === null || value.includes(':') || value.length > LIMITS.genre) continue;
    if (NOT_GENRES.test(value) || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    genres.push(value);
    if (genres.length === MAX_GENRES) break;
  }
  return genres;
}

const yearOf = (publishDate: unknown): number | null => {
  const match = typeof publishDate === 'string' ? /\b(\d{4})\b/.exec(publishDate) : null;
  return match ? Number(match[1]) : null;
};

const pagesOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100_000
    ? value
    : null;

export async function lookupIsbn(isbn13: string, deps: OpenLibraryDeps): Promise<LookupResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Unavailable('timeout'));
    }, deps.timeoutMs ?? LOOKUP_TIMEOUT_MS);
  });

  /** JSON body, null on 404; throws Unavailable on anything else. */
  const getJson = async (path: string): Promise<Json | null> => {
    const request = (async () => {
      let response: Response;
      try {
        response = await deps.fetch(`${OPEN_LIBRARY}${path}`, {
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
    })();
    return Promise.race([request, deadline]);
  };

  /** Secondary records (authors, work) are best effort: a failure leaves them out. */
  const optional = (path: string) => getJson(path).catch(() => null);

  try {
    const edition = await getJson(`/isbn/${isbn13}.json`);
    if (edition === null) return { kind: 'not_found' };
    const title = str(edition.title);
    if (title === null) return { kind: 'not_found' };

    const workKey = keysOf(edition.works, (item) => item.key)[0];
    const work = workKey ? await optional(`${workKey}.json`) : null;
    let authorKeys = keysOf(edition.authors, (item) => item.key);
    if (authorKeys.length === 0 && work) {
      authorKeys = keysOf(work.authors, (item) => (isObject(item.author) ? item.author.key : null));
    }
    const authorRecords = await Promise.all(
      authorKeys.slice(0, LIMITS.authors).map((key) => optional(`${key}.json`)),
    );
    const authors = authorRecords
      .map((record) => (record ? str(record.name) : null))
      .filter((name): name is string => name !== null)
      .map((name) => name.slice(0, LIMITS.author));

    const covers = Array.isArray(edition.covers) ? edition.covers : [];
    const hasCover = covers.some((id) => typeof id === 'number' && id > 0);
    const publisher = Array.isArray(edition.publishers) ? str(edition.publishers[0]) : null;
    const description = textOf(edition.description) ?? (work ? textOf(work.description) : null);

    return {
      kind: 'found',
      candidate: {
        isbn13,
        title: title.slice(0, LIMITS.title),
        authors,
        genres: genresFrom(work?.subjects ?? edition.subjects),
        publisher: publisher?.slice(0, LIMITS.publisher) ?? null,
        year: yearOf(edition.publish_date),
        pages: pagesOf(edition.number_of_pages),
        description: description?.slice(0, LIMITS.description) ?? null,
        coverSourceUrl: hasCover ? coverSourceUrlFor(isbn13) : null,
      },
    };
  } catch (error) {
    if (error instanceof Unavailable) return { kind: 'unavailable' };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
