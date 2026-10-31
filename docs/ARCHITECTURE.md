# Étagère — architecture and API contract

Étagère is a household book library. A small server runs on a computer at home; every phone of
the household connects to it over the home Wi-Fi. No accounts, no passwords, no cloud. The only
outbound traffic is the ISBN lookup and the "ideas to buy" suggestions (Open Library).

This document is the contract every contributor (human or agent) codes against. Change it in the
same commit as the code when a decision moves.

## Repository layout (npm workspaces)

```
packages/shared   @etagere/shared  — types, validation (zod), ISBN utils, i18n dictionaries, design tokens
server            etagere-server   — Fastify 5 API + WebSocket + SQLite + serves the PWA (published to npm, bin `etagere-server`)
app               @etagere/app     — Expo (React Native + react-native-web), expo-router. Builds to iOS, Android and the PWA
docs/             architecture, decisions, release guide
docker/           Dockerfile + docker-compose.yml
```

- Node >= 24 (uses the built-in `node:sqlite`, no native build step — keeps `npx` and Docker simple).
- TypeScript strict everywhere. ESLint + Prettier. Jest for tests (server: `ts-jest` + `fastify.inject`
  with an in-memory database; app: `jest-expo` + React Native Testing Library).
- **No hosted CI.** `npm run check` (lint + typecheck + tests) is the gate; a versioned git `pre-push`
  hook (`.githooks/pre-push`, enabled by `npm install` through the `prepare` script) runs it.

## Design

Source design: 6 mobile screens (first launch, library, book detail with household reviews, barcode
scanner, my readings, recommendations) and the local architecture board.

Tokens (light / dark):

| token | light | dark |
|---|---|---|
| background | `#F3F4F1` | `#0F1513` |
| surface | `#FFFFFF` | `#1A2320` |
| border | `#DDE1DC` | `#2C3833` |
| text | `#16201B` | `#E8ECE9` |
| textMuted | `#5B6660` | `#A3AFA8` |
| primary | `#1F6B4A` | `#3DDC84` (text on it `#0F1513`) |
| primaryPressed | `#154D35` | `#2FB56C` |
| availableBg / availableFg / availableDot | `#DCEFE4` / `#155238` / `#2E9E64` | `#1D3A2B` / `#9FE0BC` / `#3DDC84` |
| busyBg / busyFg / busyDot | `#FCE9C2` / `#6E4300` / `#B07400` | `#3D2E10` / `#F5CF85` / `#E0A63A` |
| scanner background / accent | `#0F1513` / `#3DDC84` | same |

Profile colors: green `#1F6B4A`, blue `#2C4A6B`, rust `#B5523B`, violet `#6B4E8A`, ochre `#C08A1E`.
Typography: display "Bricolage Grotesque" 700 (titles), body "Inter" 400/500/600 (loaded with
`expo-font` / `@expo-google-fonts`). Radii 12–18, touch targets >= 44 px. Icons: stroke SVG
(`react-native-svg`), never emoji. Theme follows the system setting (`useColorScheme`).

Books without a cover image get a generated cover: a background color picked deterministically from
the title (palette of the design: `#B5523B #2C4A6B #E3B448 #1E2A33 #6B4E8A #3E6B4F #2F5D62 #C08A1E #8C2F2F #5E7A3A`),
title in Bricolage 700 and author below, like the design.

Navigation: bottom tab bar with 4 tabs — **Library** (Biblio), **Readings** (Lectures), **Scan**
(Scanner), **For you** (Pour toi). Book detail, add/edit book, profile settings and server settings
are stack screens. First launch (onboarding) shows before the tabs while no profile exists.

App code layout: routes in `app/app/` (expo-router; tabs in `app/app/(tabs)/`: `index` Library,
`readings`, `scan`, `for-you`), components in `app/src/components/` (`Cover`, `Icon`, `Screen`,
`AppProviders`), `useTheme()` (`app/src/theme`), `useI18n()` (`app/src/i18n`), `useSession()` /
`useApi()` (`app/src/session`: device profile, server address, `ApiClient` sending
`X-Etagere-Profile`; feature API helpers go next to `app/src/api/client.ts`). Component tests use
`renderWithProviders()` and `fakeFetch()` from `app/src/test/`.

## i18n

French and English. Dictionaries live in `packages/shared/src/i18n/{fr,en}.ts` with the same keys
(a test asserts key parity). The app picks the device language (`expo-localization`), French first,
fallback English. Server error responses carry a stable `code`, never user-facing prose.

## Identity (no account)

- On first launch the app generates a UUID v4 profile id, asks a first name and a color, then
  `PUT /api/profiles/:id`. The id is stored on the device (AsyncStorage / localStorage).
- Every request carries the header `X-Etagere-Profile: <uuid>`. Mutations without a known profile
  answer `401 { code: "unknown_profile" }`.
- The server only answers clients on private networks (loopback, RFC 1918, link-local, IPv6 ULA /
  link-local, including IPv4-mapped forms). Anything else: `403 { code: "outside_lan" }`.
  Everyone on the LAN can do everything (household trust model, by design).

## Data model (SQLite, `node:sqlite`)

Database file: `<dataDir>/etagere.sqlite`; covers: `<dataDir>/covers/<bookId>.jpg`.
`dataDir` = `ETAGERE_DATA_DIR` env, else `./etagere-data` (Docker: `/data`). Migrations are numbered
TypeScript modules exporting their SQL (`server/src/db/migrations/`, D-17) applied at start (`schema_migrations` table). Ids are UUID v4 strings; dates ISO 8601 UTC.
One repository module per table in `server/src/db/` (`profiles.ts`, `books.ts`, ...). The SQL
function `fold(text)` lower-cases and strips accents for search (D-18).

```
profiles  (id PK, name TEXT 1..40, color TEXT, created_at, updated_at, removed_at NULL)
books     (id PK, isbn13 TEXT UNIQUE NULL, title TEXT 1..300, authors JSON array of 0..20 strings,
           genres JSON array, publisher NULL, year INT NULL, pages INT NULL, description NULL,
           cover TEXT NULL  -- local file name when downloaded,
           source 'lookup'|'manual', added_by FK profiles, added_at, updated_at)
readings  (id PK, book_id FK, profile_id FK, started_at NULL, finished_at NULL,
           state 'reading'|'finished'|'abandoned')
           -- "I've already read it" = state finished, started_at NULL, finished_at = now
           -- UNIQUE partial index: at most one row with state='reading' per book (= the lock)
loans     (id PK, book_id FK, borrower TEXT 1..60, lent_by FK profiles, lent_at, returned_at NULL)
           -- UNIQUE partial index: at most one open loan per book
comments  (id PK, book_id FK, profile_id FK, text TEXT 1..2000, created_at, updated_at)
```

Availability of a book: `available` | `reading` (with reader profile) | `lent` (with borrower).
A book is unavailable when it has a reading in state `reading` or an open loan. Deleting a book
deletes its readings, loans, comments and cover. Removing a profile soft-deletes it (`removed_at`);
its history stays and shows its name.

## HTTP API (prefix `/api`, JSON)

Errors are always `{ code: string, ...details }`. Validation errors: `400 { code: "invalid_input", fields: string[] }`.
Unknown route: `404 not_found`. Unexpected: `500 internal_error` (no internals leaked).

Server code layout: `buildApp(deps)` in `server/src/app.ts` (deps: `db`, `fetch`, `now`, `dataDir`,
`lanUrls`, logger, reachable as `app.deps`); one plugin per route group in `server/src/routes/`
(registered in `routes/index.ts`); `parseInput(schema, value)` and `HttpError` in `server/src/http/`;
`requireProfile(request)` resolves `X-Etagere-Profile` or throws `401 unknown_profile`. Tests build
the app with `buildTestApp()` (`server/src/__tests__/support/test-app.ts`): in-memory db, fixed clock, no network.

### Server
- `GET /api/health` → `{ status: "ok", name: "Étagère", version, householdName }`
- `GET /api/server-info` → `{ version, bookCount, profileCount, urls: string[] }` (LAN URLs, used by the onboarding card and the QR pairing page)

### Profiles
- `GET /api/profiles` → `{ profiles: Profile[] }` (not removed)
- `PUT /api/profiles/:id` body `{ name, color }` → `200 Profile` (create or update; header must match `:id` or be absent on creation)
- `DELETE /api/profiles/:id` → `204` (soft delete)

`Profile = { id, name, color, createdAt }`

### Books
- `GET /api/books?query=&filter=all|available|reading|lent|unread_by_me&sort=added|title|author` →
  `{ books: BookSummary[], counts: { all, available, reading, lent, unreadByMe } }`.
  `query` matches title, authors, ISBN (case and accent insensitive).
- `GET /api/books/:id` → `BookDetail`
- `POST /api/books` body `BookInput` → `201 BookDetail`; duplicate ISBN → `409 { code: "already_in_library", book: BookSummary }`
- `PATCH /api/books/:id` body partial `BookInput` → `BookDetail`
- `DELETE /api/books/:id` → `204`
- `GET /api/lookup/:isbn` → `200 BookCandidate` | `400 invalid_isbn` | `404 not_found` |
  `409 already_in_library` | `502 upstream_unavailable`. Accepts ISBN-10 or ISBN-13 with or without
  hyphens; normalised to ISBN-13. Source: Open Library (`/isbn/{isbn}.json` + authors + works for
  subjects; covers `covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false`). 5 s timeout.
- `GET /api/covers/:file` → the cover image (downloaded at book creation, so the app works without
  Internet). The `coverUrl` fields are server-relative (`/api/covers/<id>.jpg`) or null.

```
BookInput     = { isbn13?: string|null, title, authors: string[], genres?: string[], publisher?, year?, pages?,
                  description?, coverSourceUrl?: string|null /* https://covers.openlibrary.org only */ }
BookCandidate = BookInput & { isbn13: string, coverSourceUrl: string|null }
BookSummary   = { id, isbn13, title, authors, coverUrl, addedAt, availability: Availability, readByMe: boolean }
Availability  = { state: "available" } | { state: "reading", by: { id, name, color } } | { state: "lent", borrower, since }
BookDetail    = BookSummary & { genres, publisher, year, pages, description, source, addedBy: {id,name,color},
                  readBy: {id,name,color}[] /* finished readings, distinct */, commentCount }
```

### Readings (the lock)
- `POST /api/books/:id/reading/start` → `200 BookDetail`; already reading by someone / lent → `409 { code: "unavailable", availability }`
- `POST /api/books/:id/reading/finish` (only the current reader) → `200 BookDetail`
- `POST /api/books/:id/reading/putdown` ("Je le repose", state `abandoned`, frees the book) → `200 BookDetail`
- `POST /api/books/:id/reading/already-read` → `200 BookDetail` (idempotent per profile)
- `GET /api/me/readings` → `{ current: ReadingItem | null, finished: ReadingItem[] }` for the header profile,
  plus `stats: { finishedCount }`. `ReadingItem = { book: BookSummary, startedAt, finishedAt, commentCount }`

### Loans
- `POST /api/books/:id/loan` body `{ borrower }` → `200 BookDetail`; unavailable → `409 unavailable`
- `POST /api/books/:id/loan/return` → `200 BookDetail`

### Comments
- `GET /api/books/:id/comments` → `{ comments: Comment[] }` newest first
- `POST /api/books/:id/comments` body `{ text }` → `201 Comment`
- `PATCH /api/comments/:id` / `DELETE /api/comments/:id` → author only, else `403 not_author`

`Comment = { id, bookId, author: {id,name,color}, text, createdAt, updatedAt }`

### Recommendations
- `GET /api/me/recommendations` → `{ featured: Reco|null, onShelf: Reco[], toBuy: BuyIdea[] }`
  - `onShelf`: books in the house not read by me, scored by shared authors (+3), shared genres (+1 each,
    max 3) with books I finished, household comments count (+0.5 each, max 2); available ones first.
    `Reco = { book: BookSummary, reasons: Reason[], quote: { author: {name,color}, text } | null }`,
    `Reason = { kind: "author"|"genre"|"household", ref: string }` (the app renders the sentence).
  - `toBuy`: up to 10 books NOT in the house, from Open Library search by my top 3 authors and genres,
    excluding owned ISBNs/titles. Cached 24 h server-side; on upstream failure `toBuy: []`
    and `toBuyError: "upstream_unavailable"`. `BuyIdea = { title, authors, isbn13|null, coverSourceUrl|null, reason: Reason }`.

### Realtime
- `GET /api/events` WebSocket. The server pushes `{ type: "books.changed"|"profiles.changed"|"comments.changed", id? }`
  after every mutation. The app invalidates its cached queries on each event (TanStack Query) and
  reconnects with backoff.

### PWA
The server serves the exported web app (`app/dist`, copied into the published server package as
`server/public`) at `/`, with SPA fallback to `index.html` for non-`/api` paths, a web manifest and a
service worker caching the shell. Opening `http://<server>:4848` on a phone gives the full app.

## Server discovery and pairing

- Default port `4848` (`PORT` env). On start the server logs its LAN URLs and prints a QR code
  (terminal) of the main URL. It announces `_etagere._tcp` over mDNS (`bonjour-service`) with the
  host name `etagere.local` when possible.
- The app (native) tries, in order: the saved address; `http://etagere.local:4848`; then shows the
  server settings screen: scan the server QR code or type the address. The PWA uses its own origin.
- The onboarding card ("Library found · etagere.local · 128 books · 4 members") comes from `/api/server-info`.

## Offline

The app persists the last successful query results (TanStack Query persister on AsyncStorage /
localStorage). Without the server it shows the cached library read-only with a banner
"Server unreachable — showing the last copy"; mutations are disabled.

## Scanning

Native: `expo-camera` barcode scanning (EAN-13, ISBN starts with 978/979). Web/PWA: `BarcodeDetector`
when available, else `@zxing/browser` — live camera only in a secure context; over plain-HTTP LAN
the PWA offers "take a photo of the barcode" (`<input type=file accept=image/* capture=environment>`)
decoded with `@zxing/browser` (D-13). Torch toggle on native. On read: lookup → bottom sheet with the
candidate → "Add to library" (one tap). "Scan another" and "Type the ISBN" stay available. Manual
entry (no barcode) is the add/edit form.

## Distribution

- **Docker**: multi-stage image (`node:24-alpine`), volume `/data`, port 4848, `docker compose up -d`.
  `network_mode: host` documented for mDNS. Built and pushed to `ghcr.io/bibear/etagere` by the
  maintainer from his machine (`npm run release:docker`).
- **npm**: `npx etagere-server` (package `etagere-server`, includes the built PWA).
- **Android**: APK attached to GitHub Releases, built with EAS (`eas build -p android --profile preview`).
- **iOS**: PWA ("Add to Home Screen") until store accounts exist. `eas.json`, app icons, splash and
  store listing texts (`docs/store/`) are ready for later submission.
