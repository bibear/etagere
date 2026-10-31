import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

/** An expected HTTP error: answered as `{ code, ...details }` with its status. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

/**
 * Installs the error format of the contract: `{ code }`, never internals.
 * `notFoundFallback` may answer an unknown route itself (the PWA's SPA fallback) by returning true.
 */
export function installErrorHandling(
  app: FastifyInstance,
  notFoundFallback?: (request: FastifyRequest, reply: FastifyReply) => boolean,
): void {
  app.setErrorHandler((error: FastifyError | HttpError | ZodError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ ...error.details, code: error.code });
    }
    if (error instanceof ZodError || ('validation' in error && error.validation)) {
      return reply.code(400).send({ code: 'invalid_input', fields: [] });
    }
    // Malformed JSON, too large body, unsupported media type: Fastify's own 4xx.
    const status = 'statusCode' in error ? error.statusCode : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      // Validation errors always carry `fields` (contract); nothing to point at here.
      const body =
        status === 413 ? { code: 'payload_too_large' } : { code: 'invalid_input', fields: [] };
      return reply.code(status).send(body);
    }
    request.log.error({ err: error }, 'unexpected error');
    return reply.code(500).send({ code: 'internal_error' });
  });

  app.setNotFoundHandler((request, reply) => {
    if (notFoundFallback?.(request, reply)) return reply;
    return reply.code(404).send({ code: 'not_found' });
  });
}
