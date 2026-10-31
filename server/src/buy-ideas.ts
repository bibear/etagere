import { type BuyIdea, LIMITS, type Reason, normalizeIsbn } from '@etagere/shared';

import { fold } from './db/database';
import { OPEN_LIBRARY } from './open-library';

// "Ideas to buy" (docs/ARCHITECTURE.md § Recommendations): Open Library searches by my top
// authors and genres, each search cached 24 h, owned books left out. Everything received is
// outside data: checked before use.

export const BUY_IDEAS_MAX = 10;
export const BUY_IDEAS_TIMEOUT_MS = 5000;
export const BUY_IDEAS_TTL_MS = 24 * 60 * 60 * 1000;
const RESULTS_PER_SEARCH = 15;
const MAX_CACHE_ENTRIES = 200;

interface Candidate {
  title: string;
  authors: string[];
  isbn13: string | null;
  coverSourceUrl: string | null;
}

export interface Owned {
  isbns: Set<string>;
  /** Folded titles. */
  titles: Set<string>;
}

export type BuyIdeasResult =
  { toBuy: BuyIdea[] } | { toBuy: []; toBuyError: 'upstream_unavailable' };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const titleKey = (title: string): string => fold(title).replace(/\s+/g, ' ').trim();

export function searchUrlFor(reason: Reason): string {
  const params = new URLSearchParams({
    [reason.kind === 'author' ? 'author' : 'subject']: reason.ref,
    fields: 'title,author_name,isbn,cover_i',
    limit: String(RESULTS_PER_SEARCH),
  });
  return `${OPEN_LIBRARY}/search.json?${params.toString()}`;
}

/** The usable books of an Open Library `search.json` body. */
export function candidatesFrom(body: unknown): Candidate[] {
  if (!isObject(body) || !Array.isArray(body.docs)) return [];
  return body.docs.filter(isObject).flatMap((doc): Candidate[] => {
    const title = str(doc.title);
    if (title === null) return [];
    const authors = (Array.isArray(doc.author_name) ? doc.author_name : [])
      .map(str)
      .filter((name): name is string => name !== null)
      .slice(0, LIMITS.authors)
      .map((name) => name.slice(0, LIMITS.author));
    const isbns = Array.isArray(doc.isbn) ? doc.isbn : [];
    let isbn13: string | null = null;
    for (const raw of isbns) {
      const isbn = typeof raw === 'string' ? normalizeIsbn(raw) : null;
      if (isbn !== null) {
        isbn13 = isbn;
        break;
      }
    }
    const coverId = doc.cover_i;
    const coverSourceUrl =
      typeof coverId === 'number' && Number.isInteger(coverId) && coverId > 0
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : null;
    return [{ title: title.slice(0, LIMITS.title), authors, isbn13, coverSourceUrl }];
  });
}

export interface BuyIdeasDeps {
  fetch: typeof fetch;
  now: () => Date;
  timeoutMs?: number;
}

/** Searches Open Library and caches each successful search for 24 h (failures are not cached). */
export class BuyIdeasFinder {
  private readonly cache = new Map<string, { at: number; candidates: Candidate[] }>();

  constructor(private readonly deps: BuyIdeasDeps) {}

  /**
   * Up to 10 books not in the house, alternating between the searches (authors first).
   * `upstream_unavailable` only when every search failed.
   */
  async find(reasons: Reason[], owned: Owned): Promise<BuyIdeasResult> {
    if (reasons.length === 0) return { toBuy: [] };
    const results = await this.searchAll(reasons.map(searchUrlFor));
    if (results.every((result) => result === null)) {
      return { toBuy: [], toBuyError: 'upstream_unavailable' };
    }

    const seen = new Set(owned.titles);
    const ideas: BuyIdea[] = [];
    const queues = reasons.map((reason, index) => ({
      reason: { kind: reason.kind, ref: reason.ref },
      candidates: [...(results[index] ?? [])],
    }));
    while (ideas.length < BUY_IDEAS_MAX && queues.some((queue) => queue.candidates.length > 0)) {
      // One idea per search and per round: authors and genres alternate.
      for (const { reason, candidates } of queues) {
        let candidate: Candidate | undefined;
        while (ideas.length < BUY_IDEAS_MAX && (candidate = candidates.shift()) !== undefined) {
          const title = titleKey(candidate.title);
          if (seen.has(title)) continue;
          if (candidate.isbn13 !== null && owned.isbns.has(candidate.isbn13)) continue;
          seen.add(title);
          ideas.push({ ...candidate, reason });
          break;
        }
      }
    }
    return { toBuy: ideas };
  }

  private async searchAll(urls: string[]): Promise<(Candidate[] | null)[]> {
    const now = this.deps.now().getTime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs ?? BUY_IDEAS_TIMEOUT_MS);
    try {
      return await Promise.all(
        urls.map(async (url) => {
          const cached = this.cache.get(url);
          if (cached && now - cached.at < BUY_IDEAS_TTL_MS) return cached.candidates;
          const candidates = await this.search(url, controller.signal);
          if (candidates !== null) this.remember(url, now, candidates);
          return candidates;
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async search(url: string, signal: AbortSignal): Promise<Candidate[] | null> {
    const aborted = new Promise<null>((resolve) => {
      if (signal.aborted) resolve(null);
      signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    const request = (async () => {
      try {
        const response = await this.deps.fetch(url, {
          signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) return null;
        return candidatesFrom(await response.json());
      } catch {
        return null;
      }
    })();
    return Promise.race([request, aborted]);
  }

  private remember(url: string, at: number, candidates: Candidate[]): void {
    this.cache.delete(url);
    this.cache.set(url, { at, candidates });
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}

export { titleKey };
