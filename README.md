# Étagère

A household book library that stays at home. A small server runs on a computer of the house;
every phone of the household connects to it over the home Wi-Fi to see which books you own,
who is reading what, and what the household thinks of them. No account, no cloud.

> Work in progress. See the [milestones](https://github.com/bibear/etagere/milestones) and
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Free and open source under the [AGPL-3.0](LICENSE).

## Development

Requires Node.js 24 or newer.

```sh
npm install        # also enables the versioned git hooks (.githooks/pre-push)
npm run check      # lint + typecheck + all tests: the quality gate, run before every push
```

Workspaces: `packages/shared` (types, validation, i18n, tokens), `server` (Fastify API),
`app` (Expo app, iOS / Android / PWA).

To try the PWA served by the home server:

```sh
npm run build:web  # exports the web app into server/public
npm run server     # then open http://<this computer>:4848 on a phone of the household
```
