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
| D-23 | 2026-10-31 | App structure: routes in `app/app/` (expo-router, tabs in `(tabs)/`), components in `app/src/components/`, one `AppProviders` (safe area, theme, i18n, session, TanStack Query); the session (profile + server address) is stored as one JSON entry in AsyncStorage (`etagere.session`) and exposes an `ApiClient` bound to both (`useApi()`) | One obvious place per concern for parallel work; tests render through `renderWithProviders` + `fakeFetch`. |
| D-24 | 2026-10-31 | Default server address: PWA → its own origin; web in development → same host, port 4848; native → `http://etagere.local:4848` | Matches the discovery order of the architecture without any configuration in development. |
| D-25 | 2026-10-31 | App identifiers `org.etagere.app` (iOS bundle id, Android package), URL scheme `etagere` | Neutral, project-owned names; can change before the first store submission. |
| D-26 | 2026-10-31 | Dev dependencies added: `eslint-plugin-react-hooks` (lint), `pino` (server log capture in tests, already Fastify's logger), `tsx` (dev server); app: `expo-crypto` (UUID v4 for the profile id), `@expo-google-fonts/*`, `react-native-svg`, `@tanstack/react-query`, AsyncStorage | Well-known, maintained; versions aligned with Expo SDK 58. |
| D-27 | 2026-10-31 | Profiles: a device only writes its own profile (`403 profile_mismatch` otherwise); removing a member puts down their current reading; re-writing a removed profile restores it | Keeps the trust model simple while preventing a stale device from locking books forever. |
| D-28 | 2026-10-31 | Realtime events go through an in-process `EventBus` decorated as `app.events`; routes publish after the mutation is committed | One place for the WebSocket route to subscribe; routes stay testable without sockets. |
| D-29 | 2026-10-31 | App stack routes `/onboarding`, `/server`, `/book/[id]`, `/profile`; the tabs layout redirects to `/onboarding` while the device has no profile; query keys grouped by prefix in `app/src/api/queryKeys.ts` | One gate, one place for keys that realtime events and mutations invalidate. |
| D-30 | 2026-10-31 | Server settings save an address only after its `/api/health` answers, and switching server clears every cached query | A typo must not strand the app; data from one household must not show on another. |
| D-31 | 2026-10-31 | Books list: search in SQL (`fold` + `instr`, no LIKE wildcards to escape), filter / sort / counts in memory over the matching books; French collation for title and author sorts; `source` derived from the presence of an ISBN | A household shelf is a few thousand books at most; keeps `BookInput` unchanged. |
