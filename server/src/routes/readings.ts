import { randomUUID } from 'node:crypto';

import {
  type BookDetail,
  type MyReadingsResponse,
  type ReadingItem,
  uuidSchema,
} from '@etagere/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { findBookRow, findDetail, findSummary } from '../db/books';
import { transaction } from '../db/database';
import {
  type MyReadingRow,
  findCurrentReading,
  hasFinished,
  hasOpenLoan,
  insertFinishedReading,
  myCurrentReading,
  myFinishedReadings,
  putDownReadingsOf,
  setReadingState,
  takeReadingLock,
} from '../db/readings';
import { HttpError } from '../http/errors';
import { requireProfile } from '../http/profile';
import { parseInput } from '../http/validation';

const idParams = z.object({ id: uuidSchema });

// The reading lock (docs/ARCHITECTURE.md § Readings):
// POST /api/books/:id/reading/{start,finish,putdown,already-read}, GET /api/me/readings
export async function readingRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;
  const { db } = deps;

  const availabilityOf = (bookId: string, meId: string) =>
    findSummary(db, bookId, meId)?.availability ?? { state: 'available' as const };

  /** Runs a reading mutation on an existing book, then answers its detail and notifies. */
  const mutate = (
    request: FastifyRequest,
    change: (bookId: string, meId: string, at: string) => string[] | void,
  ): BookDetail => {
    const me = requireProfile(request);
    const { id } = parseInput(idParams, request.params);
    const freed = transaction(db, () => {
      if (!findBookRow(db, id)) throw new HttpError(404, 'not_found');
      return change(id, me.id, deps.now().toISOString()) ?? [];
    });
    for (const bookId of [...freed, id]) app.events.publish({ type: 'books.changed', id: bookId });
    return findDetail(db, id, me.id) as BookDetail;
  };

  /** The current reading of the book, when it is mine; else `409 not_reader`. */
  const myReadingOf = (bookId: string, meId: string) => {
    const current = findCurrentReading(db, bookId);
    if (current?.profile_id !== meId) {
      throw new HttpError(409, 'not_reader', { availability: availabilityOf(bookId, meId) });
    }
    return current;
  };

  app.post('/books/:id/reading/start', async (request) =>
    mutate(request, (bookId, meId, at) => {
      const current = findCurrentReading(db, bookId);
      if (current?.profile_id === meId) return; // already mine: idempotent
      const unavailable = () =>
        new HttpError(409, 'unavailable', { availability: availabilityOf(bookId, meId) });
      if (current || hasOpenLoan(db, bookId)) throw unavailable();
      // One book at a time per member: the previous one goes back on the shelf.
      const freed = putDownReadingsOf(db, meId);
      if (!takeReadingLock(db, { id: randomUUID(), bookId, profileId: meId, at })) {
        throw unavailable();
      }
      return freed;
    }),
  );

  app.post('/books/:id/reading/finish', async (request) =>
    mutate(request, (bookId, meId, at) => {
      setReadingState(db, myReadingOf(bookId, meId).id, 'finished', at);
    }),
  );

  app.post('/books/:id/reading/putdown', async (request) =>
    mutate(request, (bookId, meId) => {
      setReadingState(db, myReadingOf(bookId, meId).id, 'abandoned', null);
    }),
  );

  app.post('/books/:id/reading/already-read', async (request) =>
    mutate(request, (bookId, meId, at) => {
      if (hasFinished(db, bookId, meId)) return;
      const current = findCurrentReading(db, bookId);
      if (current?.profile_id === meId) setReadingState(db, current.id, 'finished', at);
      else insertFinishedReading(db, { id: randomUUID(), bookId, profileId: meId, at });
    }),
  );

  app.get('/me/readings', async (request): Promise<MyReadingsResponse> => {
    const me = requireProfile(request);
    const toItem = (row: MyReadingRow): ReadingItem | null => {
      const book = findSummary(db, row.book_id, me.id);
      return book
        ? {
            book,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            commentCount: Number(row.comment_count),
          }
        : null;
    };
    const currentRow = myCurrentReading(db, me.id);
    const finished = myFinishedReadings(db, me.id)
      .map(toItem)
      .filter((item): item is ReadingItem => item !== null);
    return {
      current: currentRow ? toItem(currentRow) : null,
      finished,
      stats: { finishedCount: finished.length },
    };
  });
}
