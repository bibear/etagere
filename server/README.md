# etagere-server

The home server of [Étagère](https://github.com/bibear/etagere), a household book library that
stays at home. It runs on any computer of the house (a laptop, a Raspberry Pi, a NAS) and every
phone of the household connects to it over the home Wi-Fi: with the Étagère app, or simply by
opening its address in a browser (the web app is included).

No account, no cloud: the only outbound calls are the ISBN lookups (Open Library and Google
Books, only the ISBN is sent) and the reading ideas (Open Library). The server refuses any client outside the home network.

## Run it

Requires Node.js 24 or newer.

```sh
npx etagere-server
```

On start it prints the addresses to open on a phone (for example `http://192.168.1.20:4848`)
and a QR code that the app scans to pair. It also announces itself as `etagere.local` on the
home network (mDNS).

Keep it running in the background with your usual tool (a systemd service, `pm2`, a login item),
or use the Docker image: see the
[main README](https://github.com/bibear/etagere#install-the-server).

## Configuration

Environment variables:

| variable | default | meaning |
|---|---|---|
| `PORT` | `4848` | HTTP port |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `ETAGERE_DATA_DIR` | `./etagere-data` | Where the SQLite database and the covers are stored |
| `ETAGERE_HOUSEHOLD_NAME` | `Étagère` | Name shown in the apps |
| `ETAGERE_MDNS` | on | `0` disables the `etagere.local` announce |
| `ETAGERE_PUBLIC_URL` | none | The address phones should use, shown in the start-up banner, the QR code and the app (for example `http://192.168.1.20:4848`). Needed in Docker bridge mode and on Docker Desktop, where the server only sees the container's address |
| `ETAGERE_ALLOWED_HOSTS` | none | Extra host names the server answers to, comma separated (for example a name of your home DNS). IP addresses, `localhost` and `*.local` names always work |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

Back up the data directory to keep your library (`etagere.sqlite` and `covers/`).

## License

[AGPL-3.0](https://github.com/bibear/etagere/blob/main/LICENSE). Free and open source.
