/** Removes spaces and hyphens, upper-cases a trailing `x`. Does not validate. */
export const stripIsbn = (input: string): string => input.replace(/[\s-]/g, '').toUpperCase();

/** ISBN-13 check digit: weights 1, 3, 1, 3… on the first 12 digits, complement to 10. */
export const isbn13CheckDigit = (first12: string): string => {
  const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
};

/** A valid ISBN-10: 9 digits + digit or X, weighted sum 10..1 divisible by 11. Expects a stripped value. */
export const isValidIsbn10 = (value: string): boolean =>
  /^\d{9}[\dX]$/.test(value) &&
  [...value].reduce((total, char, i) => total + (char === 'X' ? 10 : Number(char)) * (10 - i), 0) %
    11 ===
    0;

/** A 13-digit EAN in the book range (978 or 979 prefix). Checksum not verified. */
export const isBookEan = (value: string): boolean => /^97[89]\d{10}$/.test(value);

/** A valid ISBN-13: book EAN prefix and correct check digit. Expects a stripped value. */
export const isValidIsbn13 = (value: string): boolean =>
  isBookEan(value) && isbn13CheckDigit(value.slice(0, 12)) === value[12];

/** ISBN-10 → ISBN-13: "978" + first 9 digits + new check digit. Expects a valid ISBN-10. */
export const isbn10To13 = (isbn10: string): string => {
  const first12 = `978${isbn10.slice(0, 9)}`;
  return first12 + isbn13CheckDigit(first12);
};

/**
 * Normalises any ISBN-10 or ISBN-13 (with or without spaces / hyphens) to an ISBN-13.
 * Returns null when the input is not a valid ISBN.
 */
export function normalizeIsbn(input: string): string | null {
  const cleaned = stripIsbn(input);
  if (isValidIsbn10(cleaned)) return isbn10To13(cleaned);
  return isValidIsbn13(cleaned) ? cleaned : null;
}

/** True when a scanned barcode payload is a valid book ISBN-13 (978/979 EAN with a good checksum). */
export const isIsbnBarcode = (payload: string): boolean => isValidIsbn13(payload.trim());
