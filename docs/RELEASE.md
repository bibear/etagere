# Release guide (maintainer)

Everything is built and published from the maintainer's machine: there is no hosted CI. A release
publishes the same version on four channels:

| channel | artefact | command |
|---|---|---|
| npm | `etagere-server` (server + web app) | `npm publish -w etagere-server` |
| Docker | `ghcr.io/bibear/etagere:<version>` and `:latest` (amd64 + arm64) | `npm run release:docker` |
| Android | APK attached to the GitHub Release | `eas build --profile preview` |
| GitHub | tag `v<version>` + release notes | `gh release create` |

The examples below release `0.2.0`; replace it with the real version.

## One-time setup

1. **npm**: an npmjs.com account with two-factor authentication, then `npm login`. The package
   name `etagere-server` must belong to that account (first `npm publish` claims it).
2. **GitHub Container Registry**: Docker Desktop (or Docker Engine) with `buildx`, then log in with
   a [personal access token (classic)](https://github.com/settings/tokens) that has the
   `write:packages` scope:

   ```sh
   echo "$GHCR_TOKEN" | docker login ghcr.io -u bibear --password-stdin
   ```

   After the first push, open GitHub > your profile > Packages > `etagere` > Package settings and
   set the visibility to **Public** (and link it to the `etagere` repository if it is not already).
3. **Expo / EAS** (no global install, `npx` is enough): an expo.dev account, then from `app/`:

   ```sh
   cd app
   npx eas-cli@27 login
   npx eas-cli@27 init          # creates the EAS project, writes extra.eas.projectId into app.json
   cd ..
   git add app/app.json && git commit -m "chore(app): link the EAS project" && git push origin main
   ```

   The first Android build asks to generate the signing keystore: let EAS manage it. Keep a backup
   (`npx eas-cli@27 credentials -p android` > Download), because every update of the APK must be
   signed with the same key.
4. **GitHub CLI**: `gh auth login`.

## 1. Prepare

```sh
git switch main && git pull
npm ci
npm run release:version -- 0.2.0     # root, shared, server, app package.json + app.json + lock
npm run check                        # lint + typecheck + tests
npm run smoke:pack -w etagere-server # packs, installs and starts the npm package for real
git commit -am "chore: release 0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

## 2. npm

```sh
npm publish -w etagere-server --dry-run   # check the file list: dist/index.js, public/, LICENSE, README.md
npm publish -w etagere-server --access public
```

`prepack` rebuilds everything (server bundle, web app export, license), so the published package
always matches the tagged sources. Check: `npx etagere-server@0.2.0` in an empty folder.

## 3. Docker

```sh
npm run release:docker -- --dry-run   # prints the buildx command
npm run release:docker                # builds linux/amd64 + linux/arm64, pushes :0.2.0 and :latest
```

A pre-release version (`0.3.0-beta.1`) does not move `latest`; `-- --no-latest` skips it
explicitly. Check:

```sh
docker run --rm -p 4848:4848 ghcr.io/bibear/etagere:0.2.0
curl http://localhost:4848/api/health
```

## 4. Android APK

```sh
cd app
npx eas-cli@27 build -p android --profile preview --non-interactive --wait --json > ../eas-build.json
cd ..
curl -L -o etagere-0.2.0.apk "$(node -p "require('./eas-build.json')[0].artifacts.buildUrl")"
rm eas-build.json
```

Install it on a phone once (`adb install etagere-0.2.0.apk`, or open the file) before publishing.

## 5. GitHub Release

```sh
gh release create v0.2.0 etagere-0.2.0.apk \
  --repo bibear/etagere \
  --title "Étagère 0.2.0" \
  --generate-notes
rm etagere-0.2.0.apk
```

Edit the notes to start with what changes for a household, and mention the server channels:
`npx etagere-server@0.2.0`, `ghcr.io/bibear/etagere:0.2.0`.

## Later: the stores

Store submission needs paid developer accounts (Apple Developer Program, Google Play Console).
Everything else is ready: `app/eas.json` has a `production` profile (store bundles, build numbers
incremented by EAS), icons and splash are in `app/assets/`, permission texts in `app/locales/`, the
listing texts and the privacy policy in [docs/store/](store/).

```sh
cd app
npx eas-cli@27 build -p android --profile production   # Android App Bundle for Google Play
npx eas-cli@27 submit -p android --latest
npx eas-cli@27 build -p ios --profile production       # asks for the Apple account and certificates
npx eas-cli@27 submit -p ios --latest
```

Store review notes: the app needs a server on the local network. Give the reviewers a short video
of the setup (`npx etagere-server` then the app) and the address of a demo server if they ask for
one.
