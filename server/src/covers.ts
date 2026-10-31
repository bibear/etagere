import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyBaseLogger } from 'fastify';

/** Cover file names are `<bookId>.jpg` (book ids are UUIDs): nothing else is ever served. */
export const COVER_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export interface CoverStoreDeps {
  dataDir: string;
  fetch: typeof fetch;
  log: FastifyBaseLogger;
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
   * Downloads the cover of a book and returns its file name, or null when there is none or it
   * could not be downloaded (the app then draws a generated cover).
   */
  async download(_bookId: string, sourceUrl: string | null): Promise<string | null> {
    if (sourceUrl === null) return null;
    return null; // Downloading arrives with the ISBN lookup (#9).
  }

  /** Deletes a cover file; missing files are fine. */
  async remove(file: string | null): Promise<void> {
    const path = file === null ? null : this.pathOf(file);
    if (path !== null) await rm(path, { force: true });
  }
}
