import type { Reason, RecommendationsResponse } from '@etagere/shared';
import type { FastifyInstance } from 'fastify';

import { BuyIdeasFinder, titleKey } from '../buy-ideas';
import { householdComments, shelfBooks } from '../db/recommendations';
import { requireProfile } from '../http/profile';
import { recommendOnShelf, topValues } from '../recommendations';

const TOP = 3;

// GET /api/me/recommendations (docs/ARCHITECTURE.md § Recommendations)
export async function recommendationRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;
  const { db } = deps;
  const buyIdeas = new BuyIdeasFinder({ fetch: deps.fetch, now: deps.now });

  app.get('/me/recommendations', async (request): Promise<RecommendationsResponse> => {
    const me = requireProfile(request);
    const books = shelfBooks(db, me.id);
    const { featured, onShelf } = recommendOnShelf(books, householdComments(db), me.id);

    const finished = books.filter((book) => book.summary.readByMe);
    const searches: Reason[] = [
      ...topValues(finished, (book) => book.summary.authors, TOP).map((ref): Reason => ({
        kind: 'author',
        ref,
      })),
      ...topValues(finished, (book) => book.genres, TOP).map((ref): Reason => ({
        kind: 'genre',
        ref,
      })),
    ];
    const owned = {
      isbns: new Set(books.map((book) => book.summary.isbn13).filter((isbn) => isbn !== null)),
      titles: new Set(books.map((book) => titleKey(book.summary.title))),
    };
    return { featured, onShelf, ...(await buyIdeas.find(searches, owned)) };
  });
}
