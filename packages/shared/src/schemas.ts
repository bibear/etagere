import { z } from 'zod';

import { normalizeIsbn } from './isbn';
import { BOOK_FILTERS, BOOK_SORTS } from './types';

// Validation of every request input of the API contract (docs/ARCHITECTURE.md).
// The server answers `400 { code: "invalid_input" }` when one of these fails.

export const LIMITS = {
  profileName: 40,
  title: 300,
  authors: 20,
  author: 200,
  genres: 20,
  genre: 80,
  publisher: 200,
  description: 10_000,
  borrower: 60,
  comment: 2000,
} as const;

export const uuidSchema = z.uuid();

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Trimmed text with a length range. */
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Trimmed text, empty string becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const profileInputSchema = z.strictObject({
  name: text(1, LIMITS.profileName),
  color: hexColorSchema,
});
export type ProfileInputParsed = z.infer<typeof profileInputSchema>;

/** Any ISBN-10/13 form, normalised to ISBN-13; invalid values fail. */
export const isbnSchema = z.string().transform((value, ctx) => {
  const isbn = normalizeIsbn(value);
  if (isbn === null) {
    ctx.addIssue({ code: 'custom', message: 'invalid_isbn' });
    return z.NEVER;
  }
  return isbn;
});

export const COVER_SOURCE_PREFIX = 'https://covers.openlibrary.org/';

export const coverSourceUrlSchema = z
  .string()
  .max(500)
  .refine((value) => value.startsWith(COVER_SOURCE_PREFIX), 'cover_source_not_allowed');

const bookFields = {
  isbn13: isbnSchema.nullable().optional(),
  title: text(1, LIMITS.title),
  authors: z.array(text(1, LIMITS.author)).max(LIMITS.authors),
  genres: z.array(text(1, LIMITS.genre)).max(LIMITS.genres).optional(),
  publisher: optionalText(LIMITS.publisher),
  year: z.number().int().min(0).max(9999).nullable().optional(),
  pages: z.number().int().min(1).max(100_000).nullable().optional(),
  description: optionalText(LIMITS.description),
  coverSourceUrl: coverSourceUrlSchema.nullable().optional(),
};

export const bookInputSchema = z.strictObject(bookFields);
export type BookInputParsed = z.infer<typeof bookInputSchema>;

/** PATCH body: every field optional, at least one present. */
export const bookPatchSchema = z
  .strictObject(bookFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'empty_patch');
export type BookPatchParsed = z.infer<typeof bookPatchSchema>;

export const booksQuerySchema = z.object({
  query: z.string().trim().max(200).optional().default(''),
  filter: z.enum(BOOK_FILTERS).optional().default('all'),
  sort: z.enum(BOOK_SORTS).optional().default('added'),
});
export type BooksQueryParsed = z.infer<typeof booksQuerySchema>;

export const loanInputSchema = z.strictObject({
  borrower: text(1, LIMITS.borrower),
});

export const commentInputSchema = z.strictObject({
  text: text(1, LIMITS.comment),
});
