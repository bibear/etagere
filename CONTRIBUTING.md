# Contributing to Étagère

Thanks for your interest! Étagère is a small, personal, free and open source project. Bug reports,
translations, fixes and ideas are welcome.

## Before you start

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): it is the contract of the API, the data model
  and the design. [docs/DECISIONS.md](docs/DECISIONS.md) explains why things are the way they are.
- For anything bigger than a fix, open an issue first so we agree on the approach.
- The product principles are not negotiable: everything stays at home (no account, no cloud, no
  analytics, no tracking), the server answers the home network only, the app works in French and
  English.

## Set up

Requires Node.js 24 or newer (the server uses the built-in `node:sqlite`).

```sh
git clone https://github.com/bibear/etagere.git
cd etagere
npm install        # installs every workspace and enables the git hooks
npm run check      # lint + typecheck + tests
```

| command | what it does |
|---|---|
| `npm run server` | API server in watch mode on port 4848 (data in `./etagere-data`) |
| `npm run app` | Expo dev server for the native app |
| `npm run web` | the app in a desktop browser (talks to the server on port 4848) |
| `npm run build:web` | exports the web app into `server/public` (served at `/` by the server) |
| `npm test` | all Jest tests (`npm test -- --selectProjects server` for one workspace) |
| `npm run format` | formats everything with Prettier |

Repository layout: `packages/shared` (types, zod schemas, ISBN helpers, i18n dictionaries, design
tokens), `server` (Fastify API, SQLite, PWA hosting), `app` (Expo: iOS, Android and the PWA),
`docker` (image and compose file), `docs`.

## Quality gate

There is no hosted CI. `npm run check` (ESLint, Prettier, TypeScript in every workspace, Jest) is
the gate; the versioned `pre-push` hook runs it before every push. Keep it green.

## Tests

Every change ships with its tests.

- Test behaviour through public surfaces: the server through `app.inject()` / `buildTestApp()`
  (in-memory database, fixed clock), the app through its screens with React Native Testing Library
  (`renderWithProviders()`, `fakeFetch()`).
- Inject the network and the clock. Tests never call the real Internet (Open Library answers are
  faked in `server/src/__tests__/support/`).
- Name tests after the behaviour ("refuses a second reader while the book is taken"), not after the
  implementation.

## Code

- TypeScript strict everywhere. Shared limits and validation live in the zod schemas of
  `@etagere/shared`, used by both the server and the app forms.
- User-facing text goes through i18n: add every key to both `packages/shared/src/i18n/fr.ts` and
  `en.ts` (a test checks they have the same keys). The server never returns prose, only stable
  error `code`s.
- Follow the design tokens (`useTheme()`), never hard-coded colors; touch targets of 44 px at least;
  icons are stroke SVG, never emoji.
- If you change the API or the data model, update `docs/ARCHITECTURE.md` in the same commit. Record
  a non-trivial product or technical choice as a new row of `docs/DECISIONS.md`.
- New dependencies must be well known and maintained; explain why in `docs/DECISIONS.md`.

## Commits and pull requests

- One commit per logical change, message in English, [conventional](https://www.conventionalcommits.org/)
  style: `feat(app): …`, `fix(server): …`, `docs: …`, `chore: …`. Reference the issue
  (`Closes #12`).
- Do not rewrite published history: fix a mistake with a new commit.
- Keep pull requests focused; describe what changes for the household and how you tested it
  (on which phone / browser for UI changes).

## Translations

The app is in French and English. To improve a wording, edit the dictionaries in
`packages/shared/src/i18n/`. A new language means a new dictionary with the same keys plus its
store listing in `docs/store/`; open an issue first.

## macOS and exFAT drives

On exFAT or network drives macOS creates `._*` files next to every file. They are ignored by git,
ESLint, Prettier, Jest, TypeScript, the npm package and the Docker build; never commit them.

## License

By contributing, you agree that your contributions are licensed under the
[AGPL-3.0](LICENSE), like the rest of the project.
