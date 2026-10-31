import {
  type BookCandidate,
  type BookDetail,
  type BookInput,
  bookInputSchema,
} from '@etagere/shared';

/** The add / edit form as typed: every field is text until submitted. */
export interface BookFormValues {
  isbn: string;
  title: string;
  authors: string;
  genres: string;
  publisher: string;
  year: string;
  pages: string;
  description: string;
  /** Kept from an ISBN lookup so the server downloads the cover; not editable. */
  coverSourceUrl: string | null;
}

export type BookFormField = Exclude<keyof BookFormValues, 'coverSourceUrl'>;

export type FieldError = 'required' | 'invalid';
export type FieldErrors = Partial<Record<BookFormField, FieldError>>;

export const emptyBookForm = (isbn = ''): BookFormValues => ({
  isbn,
  title: '',
  authors: '',
  genres: '',
  publisher: '',
  year: '',
  pages: '',
  description: '',
  coverSourceUrl: null,
});

const joinList = (items: readonly string[] | undefined) => (items ?? []).join(', ');
const text = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

/** Form values of an existing book (edit). */
export const formFromBook = (book: BookDetail): BookFormValues => ({
  isbn: text(book.isbn13),
  title: book.title,
  authors: joinList(book.authors),
  genres: joinList(book.genres),
  publisher: text(book.publisher),
  year: text(book.year),
  pages: text(book.pages),
  description: text(book.description),
  coverSourceUrl: null,
});

/**
 * Merges an Open Library candidate into the form: the candidate wins for every field it knows,
 * fields it leaves empty keep what was typed.
 */
export function mergeCandidate(values: BookFormValues, candidate: BookCandidate): BookFormValues {
  const pick = (current: string, incoming: string) => (incoming.trim() !== '' ? incoming : current);
  return {
    isbn: candidate.isbn13,
    title: pick(values.title, candidate.title),
    authors: pick(values.authors, joinList(candidate.authors)),
    genres: pick(values.genres, joinList(candidate.genres)),
    publisher: pick(values.publisher, text(candidate.publisher)),
    year: pick(values.year, text(candidate.year)),
    pages: pick(values.pages, text(candidate.pages)),
    description: pick(values.description, text(candidate.description)),
    coverSourceUrl: candidate.coverSourceUrl ?? values.coverSourceUrl,
  };
}

/** "A, B ,, C" → ["A", "B", "C"]. Commas, semicolons and new lines separate items. */
export const splitList = (value: string): string[] =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item) => item !== '');

const FIELD_OF_PATH: Record<string, BookFormField> = {
  isbn13: 'isbn',
  title: 'title',
  authors: 'authors',
  genres: 'genres',
  publisher: 'publisher',
  year: 'year',
  pages: 'pages',
  description: 'description',
};

/** Maps API / schema input paths (`isbn13`, `authors.2`…) to form fields. */
export function fieldsFromPaths(paths: readonly string[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const path of paths) {
    const field = FIELD_OF_PATH[path.split('.')[0] ?? ''];
    if (field) errors[field] = 'invalid';
  }
  return errors;
}

const parseInteger = (value: string): number | null | 'invalid' => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return /^\d{1,6}$/.test(trimmed) ? Number(trimmed) : 'invalid';
};

export type BookFormResult = { ok: true; input: BookInput } | { ok: false; errors: FieldErrors };

/**
 * Validates the form with the shared schema (same limits as the server) and builds the
 * `BookInput` to send. Empty optional fields become null; the ISBN is normalised to ISBN-13.
 */
export function bookInputFromForm(values: BookFormValues): BookFormResult {
  const errors: FieldErrors = {};
  const year = parseInteger(values.year);
  const pages = parseInteger(values.pages);
  if (year === 'invalid') errors.year = 'invalid';
  if (pages === 'invalid') errors.pages = 'invalid';

  const candidate = {
    isbn13: values.isbn.trim() === '' ? null : values.isbn,
    title: values.title,
    authors: splitList(values.authors),
    genres: splitList(values.genres),
    publisher: values.publisher,
    year: year === 'invalid' ? null : year,
    pages: pages === 'invalid' ? null : pages,
    description: values.description,
    coverSourceUrl: values.coverSourceUrl,
  };
  const parsed = bookInputSchema.safeParse(candidate);
  if (!parsed.success) {
    Object.assign(
      errors,
      fieldsFromPaths(parsed.error.issues.map((issue) => issue.path.map(String).join('.'))),
    );
  }
  if (values.title.trim() === '') errors.title = 'required';
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: parsed.data };
}

/** The PATCH body of an edit: the whole form, without the cover (unchanged on edit). */
export function bookPatchFromInput(input: BookInput): Partial<BookInput> {
  const { coverSourceUrl: _cover, ...patch } = input;
  return patch;
}
