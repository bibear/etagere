import { type BookCandidate, LIMITS } from '@etagere/shared';

import { lookupGoogleBooks, plainText } from './google-books';
import { type LookupResult, type OpenLibraryDeps, lookupIsbn } from './open-library';

// The ISBN lookup (docs/ARCHITECTURE.md § Books): Open Library and Google Books queried in
// parallel, each within the same 5 s deadline, merged field by field.

/** The longest readable description (HTML stripped), capped at `LIMITS.description`. */
function longestDescription(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const value of values) {
    const text = plainText(value ?? null);
    if (text !== null && (best === null || text.length > best.length)) best = text;
  }
  return best?.slice(0, LIMITS.description) ?? null;
}

/**
 * Open Library values win when present; Google Books fills the missing ones. The description
 * is the longest of both; the cover comes from Open Library, else from Google Books.
 */
export function mergeCandidates(ol: BookCandidate, gb: BookCandidate): BookCandidate {
  const nonEmpty = (list: string[] | undefined) => (list && list.length > 0 ? list : null);
  return {
    isbn13: ol.isbn13,
    title: ol.title || gb.title,
    authors: nonEmpty(ol.authors) ?? gb.authors,
    genres: nonEmpty(ol.genres) ?? gb.genres ?? [],
    publisher: ol.publisher ?? gb.publisher ?? null,
    year: ol.year ?? gb.year ?? null,
    pages: ol.pages ?? gb.pages ?? null,
    description: longestDescription(ol.description, gb.description),
    coverSourceUrl: ol.coverSourceUrl ?? gb.coverSourceUrl,
  };
}

/**
 * Both sources at once. `not_found` only when both do not know the ISBN; `unavailable` when
 * neither found it and at least one failed (it might have known it).
 */
export async function lookupBook(isbn13: string, deps: OpenLibraryDeps): Promise<LookupResult> {
  const [ol, gb] = await Promise.all([lookupIsbn(isbn13, deps), lookupGoogleBooks(isbn13, deps)]);
  if (ol.kind === 'found' && gb.kind === 'found') {
    return { kind: 'found', candidate: mergeCandidates(ol.candidate, gb.candidate) };
  }
  const found = ol.kind === 'found' ? ol : gb.kind === 'found' ? gb : null;
  if (found) {
    const { candidate } = found;
    return {
      kind: 'found',
      candidate: { ...candidate, description: longestDescription(candidate.description) },
    };
  }
  if (ol.kind === 'not_found' && gb.kind === 'not_found') return { kind: 'not_found' };
  return { kind: 'unavailable' };
}
