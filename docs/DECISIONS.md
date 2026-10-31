# Decisions

Short log of product and technical decisions. Newest last.

| # | Date | Decision | Why |
|---|---|---|---|
| D-01 | 2026-10-31 | AGPL-3.0 license | Self-hosted server: forks that host it for others must stay open. |
| D-02 | 2026-10-31 | One copy per ISBN, plus loans to people outside the household | Matches a household shelf; a loan locks the book like a reading does. |
| D-03 | 2026-10-31 | Home Wi-Fi only, no accounts; server refuses non-private IPs | Design principle "everything stays at home"; remote access would need auth and exposed HTTPS. |
| D-04 | 2026-10-31 | Everyone on the LAN can do everything | Household trust model, simplest onboarding. |
| D-05 | 2026-10-31 | App in French and English, repository in English | Reach open source contributors; household users get their language. |
| D-06 | 2026-10-31 | v1 adds to the design: manual entry, edit/delete book, profile management, dark mode, ideas to buy | Chosen by the maintainer. Not in v1: CSV import/export, multiple copies. |
| D-07 | 2026-10-31 | Recommendations: books on the shelf + ideas to buy from Open Library | Ideas to buy are the only other outbound call, cached 24 h. |
| D-08 | 2026-10-31 | Distribution: Docker image + `npx etagere-server`; Android APK on GitHub Releases; iOS via PWA; no store submission yet | No developer store accounts yet. Everything for later submission is prepared. |
| D-09 | 2026-10-31 | No hosted CI: `npm run check` + versioned pre-push hook | No GitHub Actions available. |
| D-10 | 2026-10-31 | Push straight to `main`, one commit per logical change, closing its issue | Personal project, fast feedback loop. |
| D-11 | 2026-10-31 | `node:sqlite` (built into Node 24) instead of a native SQLite module | No native compilation for `npx` and Docker. |
| D-12 | 2026-10-31 | Native apps talk plain HTTP to the LAN server: Android `usesCleartextTraffic`, iOS `NSAllowsLocalNetworking` + local network usage description | LAN-only server has no certificate. |
| D-13 | 2026-10-31 | PWA scanning: live camera only in a secure context (`localhost`); over plain-HTTP LAN the PWA falls back to "take a photo of the barcode" (`<input type=file capture>`) decoded with `@zxing/browser` | Browsers block `getUserMedia` on non-HTTPS origins. |
| D-14 | 2026-10-31 | Inputs validated by zod schemas in `@etagere/shared` (shared by server and app forms): unknown keys rejected, text trimmed, blank optional text stored as null, any `#RRGGBB` profile color accepted, ISBN normalised to ISBN-13 at the boundary | One source of truth for limits; strictness catches client bugs early. |
| D-15 | 2026-10-31 | i18n with a tiny in-house `translate()` in `@etagere/shared` (typed dot-path keys, `{{param}}` interpolation, `_one`/`_other` plurals) instead of i18next | Two languages, a few hundred strings: no dependency needed, keys checked by TypeScript and a parity test. |
| D-16 | 2026-10-31 | Generated cover color = FNV-1a hash of the normalised title (case, accents, spaces ignored) modulo the 10-color design palette; values pinned by a test | Same color on every device and across releases. |
| D-17 | 2026-10-31 | Migrations are numbered TypeScript modules exporting their SQL (`server/src/db/migrations/00N_name.ts`, listed in `migrations/index.ts`), each applied in its own transaction | Same SQL-file semantics, but bundled with the code: nothing to copy at build time for `npx` and Docker. |
| D-18 | 2026-10-31 | Accent and case insensitive search through an SQL function `fold(text)` registered on the connection | SQLite has no `unaccent`; keeps search in SQL. |
| D-19 | 2026-10-31 | Server structure: `buildApp(deps)` factory with injected `db`, `fetch`, `now`, `dataDir`, `lanUrls`, logger; deps reachable in routes as `app.deps`; one Fastify plugin per route group in `server/src/routes/`, mounted under `/api`; route inputs parsed with `parseInput(zodSchema, …)`, expected errors thrown as `HttpError` | Testable through `fastify.inject` with fakes; parallel work touches separate files. |
| D-20 | 2026-10-31 | `400 invalid_input` carries `fields` (the invalid input paths); unknown `/api` routes answer `404 { code: "not_found" }`; request logs hold method, URL and status only | Forms can highlight fields; logs carry no device address or content. |
| D-21 | 2026-10-31 | Household name from `ETAGERE_HOUSEHOLD_NAME` (default "Étagère") until the settings ticket stores it | Health needs a value from day one. |
| D-22 | 2026-10-31 | Jest runs with `--experimental-vm-modules` (`node … jest.js`, cross-platform) | Fastify's `inject` loads an ESM-only dependency (`cookie`). |
