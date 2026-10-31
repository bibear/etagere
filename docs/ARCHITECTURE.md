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

Stack routes: `/onboarding` (first launch; the tabs layout redirects there while the device has no
profile), `/server` (server settings), `/book/[id]` (book detail), `/profile` (profile settings).
TanStack Query keys live in `app/src/api/queryKeys.ts`: everything about books under `['books']`
(lists `['books','list',params]`, detail `['books','detail',id]`), comments under `['comments']`,
the header profile's views under `['me']` — invalidating a prefix refreshes all of it.

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
  The `Host` header must also name the server on the home network (a private IP literal,
  `localhost`, a `*.local` name, or a name listed in `ETAGERE_ALLOWED_HOSTS`, comma separated);
  any other name (DNS rebinding from a public website) or no Host: `403 { code: "outside_lan" }`.
  The same names are the allowed CORS origins; a request (WebSocket included) carrying any other
  `Origin` answers `403 { code: "outside_lan" }`.
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
- `PUT /api/profiles/:id` body `{ name, color }` → `200 Profile` (create or update; header must match `:id` or be absent on creation).
  Header for another profile → `403 profile_mismatch`; no header on an existing profile → `401 unknown_profile`.
  Writing a removed profile again (with its own header) restores it.
- `DELETE /api/profiles/:id` → `204` (soft delete; any known profile may remove a member; their current reading is put down). Unknown or already removed → `404 not_found`

`Profile = { id, name, color, createdAt }`

### Books
- `GET /api/books?query=&filter=all|available|reading|lent|unread_by_me&sort=added|title|author` →
  `{ books: BookSummary[], counts: { all, available, reading, lent, unreadByMe } }`.
  `query` matches title, authors, ISBN (case and accent insensitive).
- `GET /api/books/:id` → `BookDetail`
  Counts cover the books matching `query` (whatever the filter). Sorts: `added` newest first, `title` / `author`
  (first author) alphabetical, ignoring case and accents. Without a profile header `readByMe` is false.
- `POST /api/books` body `BookInput` → `201 BookDetail`; duplicate ISBN → `409 { code: "already_in_library", book: BookSummary }`.
  `source` is `lookup` when the book has an ISBN, `manual` otherwise.
- `PATCH /api/books/:id` body partial `BookInput` → `BookDetail` (`coverSourceUrl`: a URL replaces the cover, `null` removes it)
- `DELETE /api/books/:id` → `204`
- `GET /api/lookup/:isbn` → `200 BookCandidate` | `400 invalid_isbn` | `404 not_found` |
  `409 already_in_library` | `502 upstream_unavailable`. Accepts ISBN-10 or ISBN-13 with or without
  hyphens; normalised to ISBN-13. Source: Open Library (`/isbn/{isbn}.json` + authors + works for
  subjects; covers `covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false`). 5 s timeout for the whole lookup.
  Genres = up to 5 readable work subjects (catalogue tags such as `nyt:…` or "Accessible book" dropped);
  missing authors or work do not fail the lookup.
- `GET /api/covers/:file` → the cover image (downloaded at book creation, so the app works without
  Internet; JPEG/PNG/WebP/GIF checked by content, 5 MB max, 5 s timeout; a failed download leaves the
  book without cover). `Cache-Control: no-cache` + `ETag` (a cover can be replaced). The `coverUrl` fields are server-relative (`/api/covers/<id>.jpg`) or null.

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
- `POST /api/books/:id/reading/start` → `200 BookDetail`; already reading by someone / lent → `409 { code: "unavailable", availability }`.
  Idempotent for the current reader. One book at a time per member: starting a book puts down the
  member's previous current reading (frees it).
- `POST /api/books/:id/reading/finish` (only the current reader, else `409 { code: "not_reader", availability }`) → `200 BookDetail`
- `POST /api/books/:id/reading/putdown` ("Je le repose", state `abandoned`, frees the book; current reader only, else `409 not_reader`) → `200 BookDetail`
- `POST /api/books/:id/reading/already-read` → `200 BookDetail` (idempotent per profile; when I am the current reader it finishes my reading)
- `GET /api/me/readings` → `{ current: ReadingItem | null, finished: ReadingItem[] }` for the header profile,
  plus `stats: { finishedCount }`. `ReadingItem = { book: BookSummary, startedAt, finishedAt, commentCount }`.
  `finished`: one item per book (latest finish), most recent first; `finishedCount` = number of distinct books.

### Loans
- `POST /api/books/:id/loan` body `{ borrower }` → `200 BookDetail`; unavailable (being read, its reader
  included, or already lent) → `409 { code: "unavailable", availability }`
- `POST /api/books/:id/loan/return` → `200 BookDetail` (any member); no open loan → `409 { code: "not_lent", availability }`
- Both publish `books.changed`. Returned loans stay in the table (history).

### Comments
- `GET /api/books/:id/comments` → `{ comments: Comment[] }` newest first
- `POST /api/books/:id/comments` body `{ text }` → `201 Comment`
- `PATCH /api/comments/:id` body `{ text }` → `200 Comment` / `DELETE /api/comments/:id` → `204`; author only, else `403 not_author`

`Comment = { id, bookId, author: {id,name,color}, text, createdAt, updatedAt }`

### Recommendations
- `GET /api/me/recommendations` → `{ featured: Reco|null, onShelf: Reco[], toBuy: BuyIdea[] }`
  - `onShelf`: books in the house not read by me (nor being read by me), scored by shared authors (+3), shared genres (+1 each,
    max 3) with books I finished, household comments count (+0.5 each, max 2; comments of the other members); available ones first,
    then by score, then newest added. Up to 20, zero-score books included (a new member still gets ideas).
    `featured` is the first available book of that order (a quoted one wins a tie), not repeated in `onShelf`; null when nothing is available.
    `Reco = { book: BookSummary, reasons: Reason[], quote: { author: {name,color}, text } | null }` — `quote` is the latest
    comment of another member. `Reason = { kind: "author"|"genre"|"household", ref: string, because?: string[] }`
    (the app renders the sentence): `ref` is the shared author / genre, or for `household` the latest reviewer's name;
    `because` lists up to 2 titles I finished that share it ("Because you read Dune and Foundation").
  - `toBuy`: up to 10 books NOT in the house, from Open Library `search.json` by my top 3 authors and top 3 genres
    (most frequent among books I finished), alternating between searches, excluding owned ISBNs/titles (case and accents
    ignored). Each search is cached 24 h server-side (failed ones are not cached; ownership is re-checked on every
    request); 5 s timeout. When every search fails: `toBuy: []` and `toBuyError: "upstream_unavailable"`.
    `BuyIdea = { title, authors, isbn13|null, coverSourceUrl|null /* covers.openlibrary.org/b/id/<id>-L.jpg */, reason: Reason }`.

### Realtime
- `GET /api/events` WebSocket (`@fastify/websocket`, same LAN guard). The server pushes `{ type: "books.changed"|"profiles.changed"|"comments.changed", id? }`
  after every mutation: `id` is the book id for `books.changed` and `comments.changed`, the profile id for
  `profiles.changed`. One-way channel (client messages ignored); the server pings every 30 s and drops dead sockets.
- App side (`app/src/realtime`, `<Realtime />` mounted in the root layout): connects while the device has a
  profile, invalidates the query key prefixes of `app/src/api/queryKeys.ts` an event makes stale
  (`books.changed` → books, me, server-info; `comments.changed` → that book's comments and detail, me;
  `profiles.changed` → profiles, books, comments, me, server-info), reconnects with exponential backoff
  (1 s → 30 s) and refreshes every query after a reconnection.

### PWA
The server serves the exported web app (`app/dist`, copied into the published server package as
`server/public`) at `/`, with SPA fallback to `index.html` for non-`/api` paths, a web manifest and a
service worker caching the shell. Opening `http://<server>:4848` on a phone gives the full app.

- Build: `npm run build:web` (root) runs `expo export -p web`, then `server/src/pwa/build-cli.ts`
  completes `app/dist` (icons drawn in code at 180/192/512 px + SVG, `manifest.webmanifest`, `sw.js`,
  manifest / iOS home-screen tags and the service worker registration injected into `index.html`) and
  replaces `server/public` with it (git-ignored). `ETAGERE_PUBLIC_DIR` points the server elsewhere; without
  an `index.html` there, the server is API only.
- Serving (`@fastify/static`, behind the LAN guard): `/_expo/static/**` (hashed) `Cache-Control: public,
  max-age=31536000, immutable`, everything else `no-cache`. Unknown GET/HEAD paths outside `/api` and
  without a file extension answer `index.html`; unknown `/api` paths and missing files stay `404 not_found`.
  Dotfiles and `._*` files are never served.
- Service worker (`/sw.js`, cache `etagere-shell-<content hash>`): precaches `/`, the manifest, the
  bundles and the icons; navigations are network first with the cached shell offline; other same-origin
  GETs cache first (fonts, images cached on first use); `/api` and other origins are never intercepted.
  Browsers only run service workers in a secure context (https or `localhost`): over plain-HTTP LAN the
  app still installs to the home screen from the manifest, and offline data comes from the app's own cache.

## Server discovery and pairing

- Default port `4848` (`PORT` env). On start the server prints (plain stdout, not the JSON log) its
  LAN URLs, `http://etagere.local:<port>` when mDNS is on, and a terminal QR code (`qrcode`) of the
  main URL: the first private IPv4 URL, e.g. `http://192.168.1.20:4848` (the same code opens the PWA
  from a phone camera). It announces `_etagere._tcp` over mDNS (`bonjour-service`, `server/src/discovery.ts`)
  named after the household, host name `etagere.local`, TXT `{ version, path: "/api" }`. Best effort:
  a failure (port 5353 busy, no multicast, Docker bridge network) only logs a warning.
  `ETAGERE_MDNS=0` turns the announce off.
- The app (native) tries, in order: the saved address; `http://etagere.local:4848` (`discoverServer`
  in `app/src/pairing/`, run by the onboarding card; when only the default answers, the saved
  address is forgotten); then the onboarding offers the server settings screen: scan the server QR
  code (native only, `expo-camera` QR mode; any `http(s)://` payload, normalised, saved once its
  `/api/health` answers) or type the address. The PWA uses its own origin (no scan button).
  When the device already has a profile, saving a new address first writes that profile to the
  new server (`PUT /api/profiles/:id`, same id), so the member keeps their identity there.
- The onboarding card ("Library found · etagere.local · 128 books · 4 members") comes from `/api/server-info`.

## Offline

The app persists the last successful query results (TanStack Query `dehydrate` / `hydrate`,
`app/src/offline/`) as one AsyncStorage / localStorage entry `etagere.queryCache`, saved at most once
a second after a successful fetch (search results excepted) and restored before the app shows. The
copy belongs to one server and one profile and expires after 30 days; queries stay in memory 24 h
(`gcTime`) so every visited screen is in it. Any query or mutation failing with a network error
switches the app to offline: screens keep the cached data with a banner "Server unreachable —
showing the last copy", and every write (`<Button needsServer>`, `useOffline()`) is disabled. While
offline `/api/health` is probed every 10 s; when it answers, every query is refreshed.

## Scanning

Native: `expo-camera` barcode scanning (EAN-13, ISBN starts with 978/979). Web/PWA: `BarcodeDetector`
when available, else `@zxing/browser` — live camera only in a secure context; over plain-HTTP LAN
the PWA offers "take a photo of the barcode" (`<input type=file accept=image/* capture=environment>`)
decoded with `@zxing/browser` (D-13). Torch toggle on native. On read: lookup → bottom sheet with the
candidate → "Add to library" (one tap). "Scan another" and "Type the ISBN" stay available. Manual
entry (no barcode) is the add/edit form.

## Distribution

- **Docker** (`docker/Dockerfile`, context = repository root, `.dockerignore`): multi-stage image
  (`node:24-alpine`). The build stage runs `npm ci` then `npm pack -w etagere-server` (the same
  package as npm); the runtime stage installs that tarball with production dependencies only, runs
  as the `node` user, `ETAGERE_DATA_DIR=/data` (volume), port 4848, `HEALTHCHECK` on `/api/health`,
  OCI labels linking the image to the repository. `docker/docker-compose.yml` uses a named volume
  (`etagere-data`) and documents `network_mode: host` for mDNS (Linux). Built for linux/amd64 and
  linux/arm64 and pushed to `ghcr.io/bibear/etagere:<version>` + `:latest` (not for pre-releases)
  by the maintainer from his machine (`npm run release:docker`, `scripts/release-docker.js`,
  `--dry-run` prints the commands).
- **npm**: `npx etagere-server` (package `etagere-server`, includes the built PWA). `npm pack` runs
  `prepack` = `server/scripts/build.js --pwa`: esbuild bundles `server/src/index.ts` and
  `@etagere/shared` into one CommonJS file `dist/index.js` (the bin, with a node shebang; npm
  dependencies stay external, so `@etagere/shared` is a dev dependency of the server), exports the web
  app (`app/dist`), completes it as a PWA (`server/src/pwa/build-cli.ts`, see § PWA) into `server/public` and copies the root `LICENSE`. Published files:
  `dist/index.js`, `public/`, `LICENSE`, `README.md` (`server/README.md` is the npm page).
  `npm run smoke:pack -w etagere-server` packs, installs the tarball in an empty project, starts the
  bin and checks `/api/health` and `/` (needs the npm registry, not part of `npm run check`).
- **Android**: APK attached to GitHub Releases, built with EAS (`eas build -p android --profile preview`).
- **iOS**: PWA ("Add to Home Screen") until store accounts exist. `eas.json`, app icons, splash and
  store listing texts (`docs/store/`) are ready for later submission.
- Native build settings (`app/app.json`, `app/eas.json`): profiles `preview` (internal APK, iOS
  simulator) and `production` (Android app bundle, store builds, `autoIncrement` with the remote
  version source). Cleartext HTTP on Android through `expo-build-properties`
  (`android.usesCleartextTraffic`), `NSAllowsLocalNetworking` + `NSLocalNetworkUsageDescription` on
  iOS. Permission texts localised in `app/locales/{fr,en}.json` (camera, local network, display
  name); microphone blocked. Icons and splash image (`app/assets/`) are generated from the PWA icon
  drawing (`server/src/pwa/icon.ts`) by `npm run icons -w @etagere/app`; a test fails when they
  are out of date. Splash on the theme background (light `#F3F4F1`, dark `#0F1513`).
