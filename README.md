# Étagère

A household book library that stays at home. A small server runs on a computer of the house;
every phone of the household connects to it over the home Wi-Fi to see which books you own,
who is reading what, and what the household thinks of them. No account, no cloud.

Free and open source under the [AGPL-3.0](LICENSE). The app speaks French and English.

- **Scan to add**: point the phone at the barcode on the back of a book; title, authors and cover
  come from Open Library and Google Books, one tap adds it.
- **Who has it?** Every book shows whether it is free, being read (and by whom) or lent to a friend.
  Starting a book "takes" it, so nobody looks for it in vain.
- **Household reviews**: everyone writes what they thought; the others read it on the book.
- **My readings**: what I am reading, what I have finished.
- **For you**: books already on the shelf that match what you liked, and ideas to buy.
- **Stays at home**: the server only answers devices on the home network. The only outbound calls
  are the ISBN lookups (Open Library, Google Books: only the ISBN is sent) and the reading ideas
  (Open Library).

## Screenshots

<!-- Screenshots to add: docs/screenshots/{welcome,library,book,scan,readings,for-you}.png -->

_Screenshots are coming with the first release. Meanwhile, the design mockups of the six screens
are in [docs/design](docs/design) (open the `.dc.html` files in a browser)._

## How it works

```
 phones (app or browser) ──── home Wi-Fi ────  computer at home: etagere-server
                                                (API + web app + SQLite database)
```

One computer of the house runs the server: a laptop, a Raspberry Pi, a NAS, any machine that can
run Docker or Node.js 24. It stores the library in a single SQLite file and the covers next to it.
Phones use the Étagère app (Android) or simply open the server address in their browser: the web
app is included and can be added to the home screen (iPhone included).

## Install the server

> **Before the first release.** No version is published yet: the Docker image
> (`ghcr.io/bibear/etagere`), the npm package (`npx etagere-server`) and the Android APK arrive
> with the first release. Until then, run the server [from source](#from-source-works-today).

### From source (works today)

Requires Node.js 24 or newer and git.

```sh
git clone https://github.com/bibear/etagere.git
cd etagere
npm install
npm run build:package -w etagere-server   # the server and the web app phones open
ETAGERE_DATA_DIR="$HOME/etagere-data" npm run start -w etagere-server
```

With Docker, build the image yourself: `docker build -f docker/Dockerfile -t etagere .`, then use
`etagere` instead of `ghcr.io/bibear/etagere:latest` in the commands below.

### With Docker (from the first release; recommended for an always-on machine)

```sh
curl -O https://raw.githubusercontent.com/bibear/etagere/main/docker/docker-compose.yml
docker compose up -d
```

The library is kept in the `etagere-data` Docker volume. Inside a container the server only sees
its own address (`172.x.x.x`), so set `ETAGERE_PUBLIC_URL` to this computer's address (for example
`http://192.168.1.20:4848`) in the compose file: the start-up QR code and the app then show a URL
phones can reach. On Linux you can instead enable `network_mode: host` (and remove `ports`): phones
also find the server as `etagere.local`. Docker Desktop (macOS, Windows) has no host networking,
so `ETAGERE_PUBLIC_URL` is the way there.

Without compose:

```sh
docker run -d --name etagere --restart unless-stopped \
  -e ETAGERE_PUBLIC_URL=http://192.168.1.20:4848 \
  -p 4848:4848 -v etagere-data:/data ghcr.io/bibear/etagere:latest
```

### With Node.js (from the first release)

Requires Node.js 24 or newer.

```sh
npx etagere-server
```

The data goes to `./etagere-data` (change it with `ETAGERE_DATA_DIR`). All settings are in the
[server README](server/README.md#configuration).

### Then

On start, the server prints the addresses to open on a phone, for example
`http://192.168.1.20:4848`, and a QR code. Give the computer a fixed address in your router
(a "DHCP reservation") so the phones always find it.

Back up the data (the `etagere.sqlite` file and the `covers` folder of the data directory, or the
Docker volume) like any other important file.

## Install the app

- **Android** (from the first release): download the APK from the
  [latest release](https://github.com/bibear/etagere/releases/latest) and open it on the phone
  (allow installing apps from your browser when asked). Until then, use the web app below.
- **iPhone, iPad, any phone**: open the server address (`http://192.168.1.20:4848`) in the browser,
  then "Add to Home Screen". Over plain HTTP the browser does not open the live camera, so the web
  app scans by "taking a photo of the barcode".
- Store versions (App Store, Google Play) are prepared and will follow.

At first launch the app looks for the server (`etagere.local`), else asks for its address: type
it, or scan the QR code printed by the server. Then choose your first name and your color.
That's it: no account, no password.

## Development

Requires Node.js 24 or newer.

```sh
npm install        # also enables the versioned git hooks (.githooks/pre-push)
npm run check      # lint + typecheck + all tests: the quality gate, run before every push
npm run server     # API server in watch mode on port 4848 (data in server/etagere-data)
npm run app        # Expo dev server
npm run web        # the app in a desktop browser
```

Workspaces: `packages/shared` (types, validation, i18n, tokens), `server` (Fastify API),
`app` (Expo app, iOS / Android / PWA).

To try the PWA served by the home server:

```sh
npm run build:web  # exports the web app into server/public
npm run server     # then open http://<this computer>:4848 on a phone of the household
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the API and data contract. Releases:
[docs/RELEASE.md](docs/RELEASE.md).

## License

Étagère is free software: you can redistribute it and/or modify it under the terms of the
[GNU Affero General Public License v3.0](LICENSE). If you host a modified version for other
people, you must offer them its source code.
