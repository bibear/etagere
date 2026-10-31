import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { COVER_SOURCE_PREFIX } from '@etagere/shared';
import type { FastifyBaseLogger } from 'fastify';

/** Cover file names are `<bookId>.jpg` (book ids are UUIDs): nothing else is ever served. */
export const COVER_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export const COVER_TIMEOUT_MS = 5000;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** The image type of a file from its first bytes (JPEG, PNG, WebP, GIF), else null. */
export function imageTypeOf(bytes: Uint8Array): string | null {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export interface CoverStoreDeps {
  dataDir: string;
  fetch: typeof fetch;
  log: FastifyBaseLogger;
  timeoutMs?: number;
}

/** Local copies of the book covers, in `<dataDir>/covers`. */
export class CoverStore {
  constructor(private readonly deps: CoverStoreDeps) {}

  get directory(): string {
    return join(this.deps.dataDir, 'covers');
  }

  /** Absolute path of a cover file, or null for a name that is not a cover file. */
  pathOf(file: string): string | null {
    return COVER_FILE.test(file) ? join(this.directory, file) : null;
  }

  /**
   * Downloads the cover of a book (Open Library only) and returns its file name, or null when
   * there is none or it could not be downloaded: the app then draws a generated cover.
   */
  async download(bookId: string, sourceUrl: string | null): Promise<string | null> {
    if (sourceUrl === null || !sourceUrl.startsWith(COVER_SOURCE_PREFIX)) return null;
    const file = `${bookId}.jpg`;
    const path = this.pathOf(file);
    if (path === null) return null;
    try {
      const bytes = await this.fetchImage(sourceUrl);
      if (bytes === null) return null;
      await mkdir(this.directory, { recursive: true });
      const partial = `${path}.part`;
      await writeFile(partial, bytes);
      await rename(partial, path);
      return file;
    } catch (error) {
      this.deps.log.warn({ err: error }, 'cover download failed');
      return null;
    }
  }

  private async fetchImage(url: string): Promise<Uint8Array | null> {
    const signal = AbortSignal.timeout(this.deps.timeoutMs ?? COVER_TIMEOUT_MS);
    const response = await this.deps.fetch(url, { signal });
    if (!response.ok) return null; // `?default=false`: 404 when Open Library has no cover.
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_COVER_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) return null;
    return imageTypeOf(bytes) === null ? null : bytes;
  }

  /** Deletes a cover file; missing files are fine. */
  async remove(file: string | null): Promise<void> {
    const path = file === null ? null : this.pathOf(file);
    if (path !== null) await rm(path, { force: true });
  }
}
