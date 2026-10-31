import { randomUUID } from 'node:crypto';

import { type Comment, commentInputSchema, uuidSchema } from '@etagere/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { findBookRow } from '../db/books';
import {
  deleteComment,
  findComment,
  insertComment,
  listComments,
  updateCommentText,
} from '../db/comments';
import { HttpError } from '../http/errors';
import { requireProfile } from '../http/profile';
import { parseInput } from '../http/validation';

const idParams = z.object({ id: uuidSchema });

// GET/POST /api/books/:id/comments, PATCH/DELETE /api/comments/:id (author only)
export async function commentRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;
  const { db } = deps;

  const existingBook = (request: FastifyRequest): string => {
    const { id } = parseInput(idParams, request.params);
    if (!findBookRow(db, id)) throw new HttpError(404, 'not_found');
    return id;
  };

  /** The comment, when the caller wrote it: `404 not_found` / `403 not_author` otherwise. */
  const ownComment = (request: FastifyRequest): Comment => {
    const me = requireProfile(request);
    const { id } = parseInput(idParams, request.params);
    const comment = findComment(db, id);
    if (!comment) throw new HttpError(404, 'not_found');
    if (comment.author.id !== me.id) throw new HttpError(403, 'not_author');
    return comment;
  };

  // The event carries the book id: the app refreshes that book's comments and counts.
  const notify = (bookId: string) => app.events.publish({ type: 'comments.changed', id: bookId });

  app.get('/books/:id/comments', async (request): Promise<{ comments: Comment[] }> => ({
    comments: listComments(db, existingBook(request)),
  }));

  app.post('/books/:id/comments', async (request, reply) => {
    const me = requireProfile(request);
    const bookId = existingBook(request);
    const { text } = parseInput(commentInputSchema, request.body);
    const id = randomUUID();
    insertComment(db, { id, bookId, profileId: me.id, text, at: deps.now().toISOString() });
    notify(bookId);
    return reply.code(201).send(findComment(db, id));
  });

  app.patch('/comments/:id', async (request): Promise<Comment> => {
    const comment = ownComment(request);
    const { text } = parseInput(commentInputSchema, request.body);
    updateCommentText(db, comment.id, text, deps.now().toISOString());
    notify(comment.bookId);
    return findComment(db, comment.id) as Comment;
  });

  app.delete('/comments/:id', async (request, reply) => {
    const comment = ownComment(request);
    deleteComment(db, comment.id);
    notify(comment.bookId);
    return reply.code(204).send();
  });
}
