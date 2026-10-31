import type { BookSummary, Reason, Reco } from '@etagere/shared';

import { fold } from './db/database';

// On-shelf recommendations (docs/ARCHITECTURE.md § Recommendations), pure: the route feeds it
// the household's books and comments, it scores and orders them for one member.

export interface ShelfBook {
  summary: BookSummary;
  genres: string[];
}

export interface HouseholdComment {
  bookId: string;
  profileId: string;
  author: { name: string; color: string };
  text: string;
  createdAt: string;
}

export interface ShelfRecommendations {
  featured: Reco | null;
  onShelf: Reco[];
}

export const MAX_ON_SHELF = 20;
const AUTHOR_POINTS = 3;
const GENRE_POINTS = 1;
const MAX_GENRE_POINTS = 3;
const COMMENT_POINTS = 0.5;
const MAX_COMMENT_POINTS = 2;
/** Titles of my finished books given as "because you read …", per reason. */
const MAX_BECAUSE = 2;

const key = (value: string): string => fold(value.trim());

/** For each folded author / genre, the titles of my finished books that carry it, latest first. */
function tasteOf(finished: ShelfBook[], pick: (book: ShelfBook) => string[]) {
  const taste = new Map<string, string[]>();
  for (const book of finished) {
    for (const value of new Set(pick(book).map(key))) {
      const titles = taste.get(value) ?? [];
      titles.push(book.summary.title);
      taste.set(value, titles);
    }
  }
  return taste;
}

/** The most frequent values (authors or genres) across books, ties by first seen; original case. */
export function topValues(books: ShelfBook[], pick: (book: ShelfBook) => string[], n: number) {
  const counts = new Map<string, { value: string; count: number; order: number }>();
  for (const book of books) {
    for (const value of pick(book)) {
      const k = key(value);
      const entry = counts.get(k);
      if (entry) entry.count += 1;
      else counts.set(k, { value: value.trim(), count: 1, order: counts.size });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, n)
    .map((entry) => entry.value);
}

/**
 * Books in the house I have not read (nor am reading), scored: shared author +3, shared genres +1
 * each (max 3) with books I finished, household comments +0.5 each (max 2). Available books come
 * first, then by score, then the most recently added. The featured pick is the best available
 * book (a quoted one wins a tie); it is not repeated in `onShelf`.
 */
export function recommendOnShelf(
  books: ShelfBook[],
  /** Newest first on equal dates. */
  comments: HouseholdComment[],
  meId: string,
): ShelfRecommendations {
  const finished = books.filter((book) => book.summary.readByMe);
  const byAuthor = tasteOf(finished, (book) => book.summary.authors);
  const byGenre = tasteOf(finished, (book) => book.genres);

  // Comments of the other members, newest first (stable sort: ties keep the given order).
  const othersComments = new Map<string, HouseholdComment[]>();
  for (const comment of [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (comment.profileId === meId) continue;
    const list = othersComments.get(comment.bookId) ?? [];
    list.push(comment);
    othersComments.set(comment.bookId, list);
  }

  const scored = books
    .filter(({ summary }) => {
      if (summary.readByMe) return false;
      return !(summary.availability.state === 'reading' && summary.availability.by.id === meId);
    })
    .map((book) => {
      const reasons: Reason[] = [];
      let score = 0;
      const because = (titles: string[] | undefined) =>
        titles ? { because: titles.slice(0, MAX_BECAUSE) } : {};

      const authors = book.summary.authors.filter((author) => byAuthor.has(key(author)));
      if (authors.length > 0) score += AUTHOR_POINTS;
      for (const author of authors) {
        reasons.push({ kind: 'author', ref: author, ...because(byAuthor.get(key(author))) });
      }

      const genres = [...new Map(book.genres.map((genre) => [key(genre), genre])).values()].filter(
        (genre) => byGenre.has(key(genre)),
      );
      score += Math.min(genres.length * GENRE_POINTS, MAX_GENRE_POINTS);
      for (const genre of genres.slice(0, MAX_GENRE_POINTS)) {
        reasons.push({ kind: 'genre', ref: genre, ...because(byGenre.get(key(genre))) });
      }

      const household = othersComments.get(book.summary.id) ?? [];
      score += Math.min(household.length * COMMENT_POINTS, MAX_COMMENT_POINTS);
      const latest = household[0];
      if (latest) reasons.push({ kind: 'household', ref: latest.author.name });

      const reco: Reco = {
        book: book.summary,
        reasons,
        quote: latest ? { author: latest.author, text: latest.text } : null,
      };
      return { reco, score, available: book.summary.availability.state === 'available' };
    })
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        b.score - a.score ||
        Number(b.reco.quote !== null) - Number(a.reco.quote !== null) ||
        b.reco.book.addedAt.localeCompare(a.reco.book.addedAt) ||
        a.reco.book.title.localeCompare(b.reco.book.title, 'fr'),
    );

  const featuredIndex = scored.findIndex((item) => item.available);
  const featured = scored[featuredIndex]?.reco ?? null;
  const onShelf = scored
    .filter((_, index) => index !== featuredIndex)
    .slice(0, MAX_ON_SHELF)
    .map((item) => item.reco);
  return { featured, onShelf };
}
