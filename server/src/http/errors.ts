import type { FastifyError, FastifyInstance } from 'fastify';
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

/** Installs the error format of the contract: `{ code }`, never internals. */
export function installErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | HttpError | ZodError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ ...error.details, code: error.code });
    }
    if (error instanceof ZodError || ('validation' in error && error.validation)) {
      return reply.code(400).send({ code: 'invalid_input' });
    }
    // Malformed JSON, too large body, unsupported media type: Fastify's own 4xx.
    const status = 'statusCode' in error ? error.statusCode : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply
        .code(status)
        .send({ code: status === 413 ? 'payload_too_large' : 'invalid_input' });
    }
    request.log.error({ err: error }, 'unexpected error');
    return reply.code(500).send({ code: 'internal_error' });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ code: 'not_found' }));
}
