import { randomUUID } from 'node:crypto';

import { type BookDetail, loanInputSchema, uuidSchema } from '@etagere/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { findBookRow, findDetail, findSummary } from '../db/books';
import { transaction } from '../db/database';
import { closeLoan, findOpenLoan, openLoan } from '../db/loans';
import { findCurrentReading } from '../db/readings';
import { HttpError } from '../http/errors';
import { requireProfile } from '../http/profile';
import { parseInput } from '../http/validation';

const idParams = z.object({ id: uuidSchema });

// Loans to people outside the household (docs/ARCHITECTURE.md § Loans):
// POST /api/books/:id/loan { borrower }, POST /api/books/:id/loan/return
export async function loanRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;
  const { db } = deps;

  const availabilityOf = (bookId: string, meId: string) =>
    findSummary(db, bookId, meId)?.availability ?? { state: 'available' as const };

  /** Runs a loan mutation on an existing book, then answers its detail and notifies. */
  const mutate = (
    request: FastifyRequest,
    change: (bookId: string, meId: string, at: string) => void,
  ): BookDetail => {
    const me = requireProfile(request);
    const { id } = parseInput(idParams, request.params);
    transaction(db, () => {
      if (!findBookRow(db, id)) throw new HttpError(404, 'not_found');
      change(id, me.id, deps.now().toISOString());
    });
    app.events.publish({ type: 'books.changed', id });
    return findDetail(db, id, me.id) as BookDetail;
  };

  app.post('/books/:id/loan', async (request) => {
    requireProfile(request); // 401 before 400
    const { borrower } = parseInput(loanInputSchema, request.body);
    return mutate(request, (bookId, meId, at) => {
      const unavailable = () =>
        new HttpError(409, 'unavailable', { availability: availabilityOf(bookId, meId) });
      // A book being read (by anyone, me included) stays home: put it down first.
      if (findCurrentReading(db, bookId)) throw unavailable();
      if (!openLoan(db, { id: randomUUID(), bookId, borrower, lentBy: meId, at })) {
        throw unavailable();
      }
    });
  });

  app.post('/books/:id/loan/return', async (request) =>
    mutate(request, (bookId, meId, at) => {
      const loan = findOpenLoan(db, bookId);
      if (!loan) {
        throw new HttpError(409, 'not_lent', { availability: availabilityOf(bookId, meId) });
      }
      closeLoan(db, loan.id, at);
    }),
  );
}
