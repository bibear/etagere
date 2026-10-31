import type { z } from 'zod';

import { HttpError } from './errors';

/**
 * Parses a request part with a zod schema from `@etagere/shared`.
 * Throws `400 { code: "invalid_input", fields }` (`fields`: the invalid paths, for forms).
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
  throw new HttpError(400, 'invalid_input', { fields });
}
